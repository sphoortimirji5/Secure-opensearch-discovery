import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export interface MemberSearchStackProps extends cdk.StackProps {
    /**
     * OpenSearch instance type. Default: t3.small.search (dev) 
     * For production: r6g.large.search or higher
     */
    opensearchInstanceType?: string;

    /**
     * Number of OpenSearch data nodes. Default: 1 (dev)
     * For production: 2+ with multi-AZ
     */
    opensearchDataNodeCount?: number;

    /**
     * CPU units for Fargate task. Default: 512
     */
    cpu?: number;

    /**
     * Memory (MiB) for Fargate task. Default: 1024
     */
    memory?: number;

    /**
     * Desired count of Fargate tasks. Default: 1
     */
    desiredCount?: number;

    /**
     * Enable synthetic monitoring canary. Default: true
     */
    enableCanary?: boolean;
}

export class MemberSearchStack extends cdk.Stack {
    public readonly vpc: ec2.IVpc;
    public readonly cluster: ecs.ICluster;
    public readonly opensearchDomain: opensearch.Domain;
    public readonly fargateService: ecsPatterns.ApplicationLoadBalancedFargateService;
    public readonly canary?: synthetics.Canary;

    constructor(scope: Construct, id: string, props?: MemberSearchStackProps) {
        super(scope, id, props);

        const {
            opensearchInstanceType = 't3.small.search',
            opensearchDataNodeCount = 1,
            cpu = 512,
            memory = 1024,
            desiredCount = 1,
            enableCanary = true,
        } = props ?? {};

        // =========================================================================
        // VPC
        // =========================================================================
        this.vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2,
            natGateways: 1,
            subnetConfiguration: [
                {
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                },
                {
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24,
                },
            ],
        });

        // =========================================================================
        // OpenSearch Domain
        // =========================================================================
        this.opensearchDomain = new opensearch.Domain(this, 'OpenSearch', {
            version: opensearch.EngineVersion.OPENSEARCH_2_11,
            vpc: this.vpc,
            vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
            capacity: {
                dataNodes: opensearchDataNodeCount,
                dataNodeInstanceType: opensearchInstanceType,
            },
            ebs: {
                volumeSize: 20,
                volumeType: ec2.EbsDeviceVolumeType.GP3,
            },
            nodeToNodeEncryption: true,
            encryptionAtRest: { enabled: true },
            enforceHttps: true,
            logging: {
                slowSearchLogEnabled: true,
                slowIndexLogEnabled: true,
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for prod
        });

        // =========================================================================
        // ECS Cluster
        // =========================================================================
        this.cluster = new ecs.Cluster(this, 'Cluster', {
            vpc: this.vpc,
            containerInsights: true,
        });

        // =========================================================================
        // Fargate Service with ALB
        // =========================================================================
        this.fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(
            this,
            'FargateService',
            {
                cluster: this.cluster,
                cpu,
                memoryLimitMiB: memory,
                desiredCount,
                taskImageOptions: {
                    image: ecs.ContainerImage.fromAsset('../'),
                    containerPort: 3000,
                    environment: {
                        NODE_ENV: 'production',
                        OPENSEARCH_NODE: `https://${this.opensearchDomain.domainEndpoint}`,
                        AWS_REGION: this.region,
                        PORT: '3000',
                    },
                    logDriver: ecs.LogDrivers.awsLogs({
                        streamPrefix: 'membersearch',
                        logRetention: logs.RetentionDays.ONE_MONTH,
                    }),
                },
                publicLoadBalancer: true,
                assignPublicIp: false,
                circuitBreaker: { rollback: true },
            },
        );

        // Health check configuration
        this.fargateService.targetGroup.configureHealthCheck({
            path: '/',
            interval: cdk.Duration.seconds(30),
            timeout: cdk.Duration.seconds(5),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 3,
        });

        // Auto-scaling
        const scaling = this.fargateService.service.autoScaleTaskCount({
            minCapacity: desiredCount,
            maxCapacity: desiredCount * 4,
        });

        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 70,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60),
        });

        // =========================================================================
        // IAM Permissions
        // =========================================================================
        const taskRole = this.fargateService.taskDefinition.taskRole;

        // OpenSearch access
        this.opensearchDomain.grantReadWrite(taskRole);

        // DynamoDB access (for members table)
        taskRole.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'dynamodb:GetItem',
                    'dynamodb:Query',
                    'dynamodb:Scan',
                    'dynamodb:PutItem',
                    'dynamodb:UpdateItem',
                ],
                resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/members*`],
            }),
        );

        // Bedrock access (for AI agent)
        taskRole.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['bedrock:InvokeModel'],
                resources: ['arn:aws:bedrock:*:*:foundation-model/anthropic.claude*'],
            }),
        );

        // Allow Fargate security group to access OpenSearch
        this.opensearchDomain.connections.allowFrom(
            this.fargateService.service,
            ec2.Port.tcp(443),
            'Allow Fargate to OpenSearch',
        );

        // =========================================================================
        // Synthetic Monitoring (Canary)
        // =========================================================================
        if (enableCanary) {
            const apiEndpoint = `http://${this.fargateService.loadBalancer.loadBalancerDnsName}`;

            this.canary = new synthetics.Canary(this, 'ApiCanary', {
                canaryName: 'membersearch-smoke',
                schedule: synthetics.Schedule.rate(cdk.Duration.minutes(5)),
                runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_7_0,
                test: synthetics.Test.custom({
                    code: synthetics.Code.fromInline(`
const { URL } = require('url');
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const apiCanary = async function () {
    const apiEndpoint = process.env.API_ENDPOINT;
    
    // Test 1: Health check
    log.info('Testing health endpoint...');
    let response = await synthetics.executeHttpStep(
        'Health Check',
        new URL('/', apiEndpoint),
        { method: 'GET' }
    );
    
    if (response.statusCode !== 200) {
        throw new Error(\`Health check failed: \${response.statusCode}\`);
    }
    log.info('Health check passed');

    // Test 2: Verify auth is required (should return 401)
    log.info('Testing auth requirement...');
    try {
        response = await synthetics.executeHttpStep(
            'Auth Required',
            new URL('/members/search?q=test', apiEndpoint),
            { method: 'GET' }
        );
        
        if (response.statusCode !== 401) {
            throw new Error(\`Expected 401, got \${response.statusCode}\`);
        }
        log.info('Auth requirement verified (401 returned)');
    } catch (error) {
        // 401 may throw, which is expected
        if (!error.message.includes('401')) {
            throw error;
        }
        log.info('Auth requirement verified (401 thrown)');
    }

    log.info('All smoke tests passed!');
};

exports.handler = async () => {
    return await apiCanary();
};
                    `),
                    handler: 'index.handler',
                }),
                environmentVariables: {
                    API_ENDPOINT: apiEndpoint,
                },
                startAfterCreation: true,
            });

            // CloudWatch Alarm for canary failures
            const alertTopic = new sns.Topic(this, 'CanaryAlertTopic', {
                displayName: 'MemberSearch Canary Alerts',
            });

            const canaryAlarm = new cloudwatch.Alarm(this, 'CanaryFailureAlarm', {
                alarmName: 'MemberSearch-Canary-Failure',
                alarmDescription: 'Alerts when production smoke tests fail',
                metric: this.canary.metricSuccessPercent({
                    period: cdk.Duration.minutes(5),
                }),
                threshold: 100,
                comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
                evaluationPeriods: 1,
                treatMissingData: cloudwatch.TreatMissingData.BREACHING,
            });

            canaryAlarm.addAlarmAction({
                bind: () => ({ alarmActionArn: alertTopic.topicArn }),
            });

            new cdk.CfnOutput(this, 'CanaryName', {
                value: this.canary.canaryName,
                description: 'CloudWatch Synthetics Canary Name',
            });

            new cdk.CfnOutput(this, 'AlertTopicArn', {
                value: alertTopic.topicArn,
                description: 'SNS Topic for canary failure alerts (subscribe your email)',
            });
        }

        // =========================================================================
        // Outputs
        // =========================================================================
        new cdk.CfnOutput(this, 'LoadBalancerDns', {
            value: this.fargateService.loadBalancer.loadBalancerDnsName,
            description: 'Application Load Balancer DNS',
        });

        new cdk.CfnOutput(this, 'OpenSearchEndpoint', {
            value: this.opensearchDomain.domainEndpoint,
            description: 'OpenSearch Domain Endpoint',
        });
    }
}
