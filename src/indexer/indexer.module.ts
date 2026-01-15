import { Module } from '@nestjs/common';
import { IndexerService } from './indexer.service';
import { SearchModule } from '../search/search.module';
import { RedactionModule } from '../redaction/redaction.module';

@Module({
    imports: [SearchModule, RedactionModule],
    providers: [IndexerService],
    exports: [IndexerService],
})
export class IndexerModule { }
