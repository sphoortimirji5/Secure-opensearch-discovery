import { Injectable, Logger } from '@nestjs/common';
import { OpenSearchProvider } from '../search/opensearch.provider';
import { RedactionService } from '../redaction/redaction.service';
import { Member } from '../members/members.repository';
import { Counter } from 'prom-client';
import { z } from 'zod';

const indexCounter = new Counter({
    name: 'membersearch_index_operations_total',
    help: 'Total number of index operations',
    labelNames: ['status', 'reason'],
});

// Validation schema for incoming member data
const MemberSchema = z.object({
    member_id: z.string().min(1, 'member_id is required'),
    email: z.string().email('Invalid email format'),
    fname: z.string().min(1, 'fname is required'),
    lname: z.string().min(1, 'lname is required'),
    status_notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    ssn_last4: z.string().length(4).optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export interface IndexDocument {
    member_id: string;
    email: string;
    fname: string;
    lname: string;
    status_notes?: string;
    tags?: string[];
}

export interface ValidationError {
    member_id?: string;
    errors: string[];
}

@Injectable()
export class IndexerService {
    private readonly logger = new Logger(IndexerService.name);
    private readonly INDEX_NAME = 'members';

    constructor(
        private opensearchProvider: OpenSearchProvider,
        private redactionService: RedactionService,
    ) { }

    /**
     * Validate member before indexing
     * Catches malformed data BEFORE it reaches OpenSearch
     */
    private validateMember(member: Member): ValidationError | null {
        const result = MemberSchema.safeParse(member);
        if (!result.success) {
            return {
                member_id: member.member_id,
                errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
            };
        }
        return null;
    }

    /**
     * Transform and redact member for indexing
     * PII is scrubbed BEFORE reaching OpenSearch
     */
    private transformForIndex(member: Member): IndexDocument {
        return {
            member_id: member.member_id,
            email: member.email.toLowerCase(),
            fname: member.fname,
            lname: member.lname,
            status_notes: member.status_notes
                ? this.redactionService.redact(member.status_notes)
                : undefined,
            tags: member.tags,
            // Note: ssn_last4 is intentionally NOT indexed
        };
    }

    /**
     * Index a single member (idempotent via member_id as _id)
     */
    async indexMember(member: Member): Promise<void> {
        // Early validation - reject malformed data before indexing
        const validationError = this.validateMember(member);
        if (validationError) {
            indexCounter.inc({ status: 'error', reason: 'validation' });
            this.logger.warn({
                msg: 'Member validation failed',
                member_id: validationError.member_id,
                errors: validationError.errors,
            });
            throw new Error(`Validation failed: ${validationError.errors.join(', ')}`);
        }

        try {
            const client = this.opensearchProvider.getClient();
            const doc = this.transformForIndex(member);

            await client.index({
                index: this.INDEX_NAME,
                id: member.member_id, // Idempotency key
                body: doc,
                refresh: true,
            });

            indexCounter.inc({ status: 'success', reason: '' });
            this.logger.log({ msg: 'Member indexed', member_id: member.member_id });
        } catch (error) {
            indexCounter.inc({ status: 'error', reason: 'opensearch' });
            this.logger.error({ msg: 'Indexing failed', member_id: member.member_id, error });
            throw error;
        }
    }

    /**
     * Bulk index multiple members
     */
    async bulkIndex(members: Member[]): Promise<{ success: number; failed: number }> {
        const client = this.opensearchProvider.getClient();
        let success = 0;
        let failed = 0;

        // Validate all members first
        const validationErrors: ValidationError[] = [];
        const validMembers: Member[] = [];

        for (const member of members) {
            const error = this.validateMember(member);
            if (error) {
                validationErrors.push(error);
                failed++;
                indexCounter.inc({ status: 'error', reason: 'validation' });
            } else {
                validMembers.push(member);
            }
        }

        if (validationErrors.length > 0) {
            this.logger.warn({
                msg: 'Some members failed validation',
                count: validationErrors.length,
                errors: validationErrors,
            });
        }

        if (validMembers.length === 0) {
            return { success, failed };
        }

        const operations = validMembers.flatMap((member) => {
            const doc = this.transformForIndex(member);
            return [
                { index: { _index: this.INDEX_NAME, _id: member.member_id } },
                doc,
            ];
        });

        try {
            const response = await client.bulk({ body: operations, refresh: true });

            if (response.body.errors) {
                response.body.items.forEach((item: { index?: { error?: unknown } }) => {
                    if (item.index?.error) {
                        failed++;
                        indexCounter.inc({ status: 'error', reason: 'opensearch' });
                    } else {
                        success++;
                        indexCounter.inc({ status: 'success', reason: '' });
                    }
                });
            } else {
                success = validMembers.length;
                indexCounter.inc({ status: 'success', reason: '' }, success);
            }

            this.logger.log({ msg: 'Bulk index completed', success, failed });
        } catch (error) {
            failed += validMembers.length;
            indexCounter.inc({ status: 'error', reason: 'opensearch' }, validMembers.length);
            this.logger.error({ msg: 'Bulk index failed', error });
            throw error;
        }

        return { success, failed };
    }
}
