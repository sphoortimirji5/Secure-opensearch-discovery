import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';

@Injectable()
export class OpenSearchProvider {
    private client: Client;

    constructor(private configService: ConfigService) {
        const node = this.configService.get<string>('OPENSEARCH_NODE');

        this.client = new Client({
            node,
            ssl: {
                rejectUnauthorized: false, // For local development
            },
        });
    }

    getClient(): Client {
        return this.client;
    }

    /**
     * Check if OpenSearch is reachable
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.cluster.health({});
            return response.body.status !== 'red';
        } catch {
            return false;
        }
    }

    /**
     * Create index with mappings if it doesn't exist
     */
    async ensureIndex(indexName: string, mappings: Record<string, unknown>): Promise<void> {
        const exists = await this.client.indices.exists({ index: indexName });

        if (!exists.body) {
            await this.client.indices.create({
                index: indexName,
                body: {
                    mappings,
                    settings: {
                        number_of_shards: 1,
                        number_of_replicas: 1,
                    },
                },
            });
        }
    }
}
