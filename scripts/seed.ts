/**
 * Seed script for local development
 * Creates DynamoDB table, OpenSearch index, and populates with mock data
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Client } from '@opensearch-project/opensearch';

// Configuration
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const OPENSEARCH_NODE = process.env.OPENSEARCH_NODE || 'http://localhost:9200';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Clients - DynamoDB Local doesn't validate credentials, use dummy values
const dynamoClient = new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
    },
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const opensearchClient = new Client({ node: OPENSEARCH_NODE, ssl: { rejectUnauthorized: false } });

// Mock data
const mockMembers = [
    {
        member_id: 'mem-001',
        email: 'john.doe@example.com',
        fname: 'John',
        lname: 'Doe',
        status_notes: 'Enrollment violation reported on 2024-01-15. SSN: 123-45-6789 verified.',
        tags: ['tier1', 'active'],
        ssn_last4: '6789',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
    },
    {
        member_id: 'mem-002',
        email: 'jane.smith@example.com',
        fname: 'Jane',
        lname: 'Smith',
        status_notes: 'Account in good standing. Contact: 555-123-4567',
        tags: ['tier2', 'active'],
        ssn_last4: '1234',
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
    },
    {
        member_id: 'mem-003',
        email: 'bob.wilson@example.com',
        fname: 'Bob',
        lname: 'Wilson',
        status_notes: 'At-risk member. Multiple rule violations noted.',
        tags: ['tier1', 'at-risk'],
        ssn_last4: '5678',
        created_at: '2024-01-03T00:00:00Z',
        updated_at: '2024-01-10T00:00:00Z',
    },
    {
        member_id: 'mem-004',
        email: 'alice.johnson@example.com',
        fname: 'Alice',
        lname: 'Johnson',
        status_notes: 'Premium member since 2020. Email: alice.alt@personal.com',
        tags: ['premium', 'active'],
        ssn_last4: '9012',
        created_at: '2020-06-15T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
    },
    {
        member_id: 'mem-005',
        email: 'charlie.brown@example.com',
        fname: 'Charlie',
        lname: 'Brown',
        status_notes: 'Pending compliance review for enrollment discrepancy.',
        tags: ['tier2', 'pending-review'],
        ssn_last4: '3456',
        created_at: '2024-01-05T00:00:00Z',
        updated_at: '2024-01-12T00:00:00Z',
    },
];

// OpenSearch index mappings
const indexMappings = {
    properties: {
        member_id: { type: 'keyword' },
        email: { type: 'keyword' },
        fname: { type: 'text', analyzer: 'standard' },
        lname: { type: 'text', analyzer: 'standard' },
        status_notes: { type: 'text', analyzer: 'standard' },
        tags: { type: 'keyword' },
    },
};

// PII redaction patterns
const redactionPatterns = [
    { regex: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, replacement: '[SSN-REDACTED]' },
    { regex: /\b(\+1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE-REDACTED]' },
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },
];

function redact(input: string): string {
    let result = input;
    for (const pattern of redactionPatterns) {
        result = result.replace(pattern.regex, pattern.replacement);
    }
    return result;
}

async function createDynamoDBTable(): Promise<void> {
    console.log('Creating DynamoDB table...');

    try {
        await dynamoClient.send(new DescribeTableCommand({ TableName: 'members' }));
        console.log('   Table already exists');
        return;
    } catch {
        // Table doesn't exist, create it
    }

    await dynamoClient.send(new CreateTableCommand({
        TableName: 'members',
        KeySchema: [{ AttributeName: 'member_id', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'member_id', AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST',
    }));

    console.log('   Table created');
}

async function seedDynamoDB(): Promise<void> {
    console.log('Seeding DynamoDB...');

    for (const member of mockMembers) {
        await docClient.send(new PutCommand({
            TableName: 'members',
            Item: member,
        }));
        console.log(`   Added: ${member.fname} ${member.lname}`);
    }

    console.log('   DynamoDB seeded');
}

async function createOpenSearchIndex(): Promise<void> {
    console.log('Creating OpenSearch index...');

    const exists = await opensearchClient.indices.exists({ index: 'members' });

    if (exists.body) {
        console.log('   Deleting existing index...');
        await opensearchClient.indices.delete({ index: 'members' });
    }

    await opensearchClient.indices.create({
        index: 'members',
        body: {
            mappings: indexMappings,
            settings: {
                number_of_shards: 1,
                number_of_replicas: 0, // Local only
            },
        },
    });

    console.log('   Index created');
}

async function indexToOpenSearch(): Promise<void> {
    console.log('Indexing to OpenSearch (with PII redaction)...');

    for (const member of mockMembers) {
        // Transform and redact before indexing
        const doc = {
            member_id: member.member_id,
            email: member.email.toLowerCase(),
            fname: member.fname,
            lname: member.lname,
            status_notes: member.status_notes ? redact(member.status_notes) : undefined,
            tags: member.tags,
            // Note: ssn_last4 is NOT indexed
        };

        await opensearchClient.index({
            index: 'members',
            id: member.member_id,
            body: doc,
            refresh: true,
        });

        console.log(`   Indexed: ${member.fname} ${member.lname}`);
        if (member.status_notes) {
            console.log(`     Original: "${member.status_notes.substring(0, 50)}..."`);
            console.log(`     Redacted: "${doc.status_notes?.substring(0, 50)}..."`);
        }
    }

    console.log('   OpenSearch indexed');
}

async function main(): Promise<void> {
    console.log('\nMemberSearch Seed Script\n');

    try {
        await createDynamoDBTable();
        await seedDynamoDB();
        await createOpenSearchIndex();
        await indexToOpenSearch();

        console.log('\nSeeding complete!\n');
        console.log('Next steps:');
        console.log('  1. npm run start:dev');
        console.log('  2. curl "http://localhost:3000/search?q=violation" -H "Authorization: Bearer $(npm run --silent token:auditor)"');
        console.log('');
    } catch (error) {
        console.error('\nSeeding failed:', error);
        process.exit(1);
    }
}

main();
