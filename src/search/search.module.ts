import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { OpenSearchProvider } from './opensearch.provider';

@Module({
    controllers: [SearchController],
    providers: [SearchService, OpenSearchProvider],
    exports: [SearchService, OpenSearchProvider],
})
export class SearchModule { }
