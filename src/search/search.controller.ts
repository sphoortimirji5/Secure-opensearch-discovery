import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SearchService, SearchQuery, SearchResult } from './search.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('search')
export class SearchController {
    constructor(private searchService: SearchService) { }

    @Get()
    @UseGuards(AuthGuard('jwt'))
    async search(
        @Query('q') q?: string,
        @Query('email') email?: string,
        @Query('fuzzy') fuzzy?: string,
        @Query('limit') limit?: string,
        @Request() req?: { user: AuthenticatedUser },
    ): Promise<SearchResult[]> {
        const query: SearchQuery = {
            q,
            email,
            fuzzy: fuzzy !== 'false',
            limit: limit ? parseInt(limit, 10) : undefined,
        };

        return this.searchService.search(query, req!.user);
    }

    @Get('health')
    async health(): Promise<{ status: string; opensearch: boolean }> {
        // Health endpoint doesn't require auth
        return {
            status: 'ok',
            opensearch: true, // TODO: actual health check
        };
    }
}
