import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

export interface Member {
    member_id: string;
    email: string;
    fname: string;
    lname: string;
    status_notes?: string;
    tags?: string[];
    ssn_last4?: string;
    created_at: string;
    updated_at: string;
}

@Injectable()
export class MembersRepository {
    private readonly docClient: DynamoDBDocumentClient;
    private readonly tableName = 'members';

    constructor(private configService: ConfigService) {
        const endpoint = this.configService.get<string>('DYNAMODB_ENDPOINT');
        const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';

        const client = new DynamoDBClient({
            region,
            ...(endpoint && { endpoint }),
        });

        this.docClient = DynamoDBDocumentClient.from(client);
    }

    async findById(memberId: string): Promise<Member | null> {
        const result = await this.docClient.send(new GetCommand({
            TableName: this.tableName,
            Key: { member_id: memberId },
        }));

        return (result.Item as Member) || null;
    }

    async findAll(limit = 100): Promise<Member[]> {
        const result = await this.docClient.send(new ScanCommand({
            TableName: this.tableName,
            Limit: limit,
        }));

        return (result.Items as Member[]) || [];
    }

    async save(member: Member): Promise<void> {
        await this.docClient.send(new PutCommand({
            TableName: this.tableName,
            Item: member,
        }));
    }
}
