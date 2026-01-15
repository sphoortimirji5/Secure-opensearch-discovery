import { Injectable, Logger } from '@nestjs/common';
import { OpenSearchProvider } from './opensearch.provider';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Counter, Histogram } from 'prom-client';

// Prometheus metrics
const searchCounter = new Counter({
    name: 'membersearch_queries_total',
    help: 'Total number of search requests',
    labelNames: ['role', 'status'],
});

const searchDuration = new Histogram({
    name: 'membersearch_query_duration_seconds',
    help: 'Search request duration',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
});

export interface SearchQuery {
    q?: string;
    email?: string;
    fuzzy?: boolean;
    limit?: number;
}

export interface SearchResult {
    member_id: string;
    email?: string;
    fname?: string;
    lname?: string;
    status_notes?: string;
    tags?: string[];
}

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);
    private readonly INDEX_NAME = 'members';

    constructor(private opensearchProvider: OpenSearchProvider) { }

    /**
     * Get source fields based on user role
     * Application-layer filtering is the PRIMARY enforcement
     */
    private getSourceFilter(user: AuthenticatedUser): string[] {
        const baseFields = ['member_id', 'email', 'fname', 'lname', 'tags'];

        // Compliance lead gets sensitive fields
        if (user.roles.includes('compliance_lead')) {
            return [...baseFields, 'status_notes', 'ssn_last4'];
        }

        // Auditor and others: no sensitive fields
        return baseFields;
    }

    /**
     * Build OpenSearch query DSL
     */
    private buildQuery(params: SearchQuery): Record<string, unknown> {
        const { q, email, fuzzy = true } = params;

        // Exact email match
        if (email) {
            return {
                term: { email: email.toLowerCase() },
            };
        }

        // Fuzzy text search
        if (q) {
            if (fuzzy) {
                return {
                    multi_match: {
                        query: q,
                        fields: ['fname^2', 'lname^2', 'email', 'status_notes'],
                        fuzziness: 'AUTO',
                        prefix_length: 2,
                    },
                };
            }
            return {
                multi_match: {
                    query: q,
                    fields: ['fname', 'lname', 'email', 'status_notes'],
                },
            };
        }

        // Default: match all
        return { match_all: {} };
    }

    /**
     * Execute search with RBAC filtering
     */
    async search(params: SearchQuery, user: AuthenticatedUser): Promise<SearchResult[]> {
        const timer = searchDuration.startTimer();
        const role = user.roles[0] || 'unknown';

        try {
            const client = this.opensearchProvider.getClient();
            const limit = params.limit || 20;

            const response = await client.search({
                index: this.INDEX_NAME,
                body: {
                    query: this.buildQuery(params),
                    _source: this.getSourceFilter(user),
                    size: limit,
                },
            });

            const hits = response.body.hits.hits;
            const results = hits.map((hit: { _source: SearchResult }) => hit._source);

            searchCounter.inc({ role, status: 'success' });
            this.logger.log({ msg: 'Search completed', query: params.q, resultCount: results.length, role });

            return results;
        } catch (error) {
            searchCounter.inc({ role, status: 'error' });
            this.logger.error({ msg: 'Search failed', error, query: params });
            throw error;
        } finally {
            timer();
        }
    }
}
