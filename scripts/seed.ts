/**
 * @fileoverview Local Development Seed Script
 *
 * Bootstraps the local development environment by:
 * 1. Creating a DynamoDB table for member records
 * 2. Seeding mock member data into DynamoDB
 * 3. Creating an OpenSearch index with appropriate mappings
 * 4. Indexing members into OpenSearch with PII redaction
 *
 * @remarks
 * This script is intended for LOCAL DEVELOPMENT ONLY. It uses dummy credentials
 * that are only valid for DynamoDB Local. Never run this against production.
 *
 * @example
 * ```bash
 * npm run seed
 * ```
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Client } from '@opensearch-project/opensearch';

/* -------------------------------------------------------------------------- */
/*                              Configuration                                  */
/* -------------------------------------------------------------------------- */

/** DynamoDB Local endpoint. Override via DYNAMODB_ENDPOINT env var. */
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

/** OpenSearch node URL. Override via OPENSEARCH_NODE env var. */
const OPENSEARCH_NODE = process.env.OPENSEARCH_NODE || 'http://localhost:9200';

/** AWS region for DynamoDB client. Override via AWS_REGION env var. */
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

/* -------------------------------------------------------------------------- */
/*                              Client Setup                                   */
/* -------------------------------------------------------------------------- */

/**
 * DynamoDB client configured for local development.
 * Uses dummy credentials as DynamoDB Local doesn't validate them.
 */
const dynamoClient = new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
    },
});

/** DynamoDB DocumentClient for high-level operations. */
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * OpenSearch client with TLS verification disabled for local development.
 * @remarks Production deployments MUST enable certificate verification.
 */
const opensearchClient = new Client({ node: OPENSEARCH_NODE, ssl: { rejectUnauthorized: false } });

/* -------------------------------------------------------------------------- */
/*                              Mock Data                                      */
/* -------------------------------------------------------------------------- */

/**
 * Representative member records for local testing.
 *
 * @remarks
 * These records include intentional PII patterns (phone, email) in the
 * status_notes field to verify that redaction works correctly during indexing.
 */
const mockMembers = [
    {
        member_id: 'mem-001',
        email: 'john.doe@example.com',
        fname: 'John',
        lname: 'Doe',
        status_notes: 'Enrollment violation reported on 2024-01-15. Contact: 555-111-9999.',
        tags: ['tier1', 'active'],
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
        created_at: '2024-01-05T00:00:00Z',
        updated_at: '2024-01-12T00:00:00Z',
    },
];

/* -------------------------------------------------------------------------- */
/*                          OpenSearch Configuration                           */
/* -------------------------------------------------------------------------- */

/**
 * OpenSearch index mappings for the 'members' index.
 *
 * @remarks
 * - `member_id` and `email` are keyword fields for exact matching
 * - `fname`, `lname`, `status_notes` are text fields for full-text search
 */
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

/* -------------------------------------------------------------------------- */
/*                              PII Redaction                                  */
/* -------------------------------------------------------------------------- */

/**
 * Regular expression patterns for detecting and redacting PII.
 * Applied to status_notes before indexing to prevent sensitive data leakage.
 */
const redactionPatterns = [
    /** Phone pattern: 555-123-4567, (555) 123-4567, +1-555-123-4567 */
    { regex: /\b(\+1[-.\\s]?)?(\(?\d{3}\)?[-.\\s]?)?\d{3}[-.\\s]?\d{4}\b/g, replacement: '[PHONE-REDACTED]' },

    /** Email pattern: user@domain.com */
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },
];

/**
 * Applies all redaction patterns to an input string.
 *
 * @param input - The string potentially containing PII
 * @returns The sanitized string with PII replaced by redaction markers
 */
function redact(input: string): string {
    let result = input;
    for (const pattern of redactionPatterns) {
        result = result.replace(pattern.regex, pattern.replacement);
    }
    return result;
}

/* -------------------------------------------------------------------------- */
/*                              Seed Functions                                 */
/* -------------------------------------------------------------------------- */

/**
 * Creates the 'members' DynamoDB table if it doesn't already exist.
 *
 * @remarks
 * Uses PAY_PER_REQUEST billing for local development simplicity.
 * Production should consider provisioned capacity based on load patterns.
 */
async function createDynamoDBTable(): Promise<void> {
    console.log('Creating DynamoDB table...');

    try {
        await dynamoClient.send(new DescribeTableCommand({ TableName: 'members' }));
        console.log('   Table already exists');
        return;
    } catch {
        // Table doesn't exist - proceed with creation
    }

    await dynamoClient.send(new CreateTableCommand({
        TableName: 'members',
        KeySchema: [{ AttributeName: 'member_id', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'member_id', AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST',
    }));

    console.log('   Table created');
}

/**
 * Seeds mock member records into DynamoDB.
 *
 * @remarks
 * Records are inserted individually to simulate real write patterns.
 * Production indexing uses DynamoDB Streams for event-driven sync.
 */
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

/**
 * Creates the 'members' OpenSearch index with defined mappings.
 *
 * @remarks
 * Deletes any existing index to ensure clean state for development.
 * Uses single shard and zero replicas for local performance.
 */
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
                number_of_replicas: 0,
            },
        },
    });

    console.log('   Index created');
}

/**
 * Indexes all mock members into OpenSearch with PII redaction.
 *
 * @remarks
 * - Transforms member data before indexing
 * - Applies PII redaction to status_notes
 * - Uses member_id as document _id for idempotent upserts
 */
async function indexToOpenSearch(): Promise<void> {
    console.log('Indexing to OpenSearch (with PII redaction)...');

    for (const member of mockMembers) {
        const doc = {
            member_id: member.member_id,
            email: member.email.toLowerCase(),
            fname: member.fname,
            lname: member.lname,
            status_notes: member.status_notes ? redact(member.status_notes) : undefined,
            tags: member.tags,
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

/* -------------------------------------------------------------------------- */
/*                              Main Entrypoint                                */
/* -------------------------------------------------------------------------- */

/**
 * Main entrypoint for the seed script.
 * Orchestrates the complete local development bootstrap sequence.
 */
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
