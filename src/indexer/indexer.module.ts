/**
 * @fileoverview Indexer Module
 *
 * Provides member indexing capabilities including:
 * - Single and bulk indexing with PII redaction
 * - Full reindex from DynamoDB
 * - Admin API endpoints for index management
 */

import { Module } from '@nestjs/common';
import { IndexerService } from './indexer.service';
import { IndexerController } from './indexer.controller';
import { SearchModule } from '../search/search.module';
import { RedactionModule } from '../redaction/redaction.module';
import { MembersModule } from '../members/members.module';

@Module({
    imports: [SearchModule, RedactionModule, MembersModule],
    controllers: [IndexerController],
    providers: [IndexerService],
    exports: [IndexerService],
})
export class IndexerModule { }
