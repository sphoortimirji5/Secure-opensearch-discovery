#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MemberSearchStack } from '../lib/app-stack';

const app = new cdk.App();

// Environment configuration
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

new MemberSearchStack(app, 'MemberSearchStack', {
    env,
    description: 'Secure OpenSearch Discovery - ECS Fargate + OpenSearch',
});
