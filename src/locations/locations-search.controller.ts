/**
 * @fileoverview Locations Search Controller
 *
 * HTTP endpoints for location search operations.
 */

import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { LocationsSearchService, LocationSearchQuery } from './locations-search.service';
import { AuthenticatedUser } from '../shared/auth';
import { LocationIndexDocument } from './interfaces';

@ApiTags('locations')
@Controller('locations/search')
export class LocationsSearchController {
    constructor(private searchService: LocationsSearchService) { }

    /**
     * Searches locations.
     */
    @Get()
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Search locations', description: 'Search locations by name, region, or rate model' })
    @ApiQuery({ name: 'q', required: false, example: 'fitness', description: 'Search query (name)' })
    @ApiQuery({ name: 'region', required: false, example: 'West', description: 'Filter by region' })
    @ApiQuery({ name: 'rate_model', required: false, example: 'conversion_rate', description: 'Filter by rate model' })
    @ApiQuery({ name: 'limit', required: false, example: '10', description: 'Max results (default: 20)' })
    async search(
        @Query('q') q?: string,
        @Query('region') region?: string,
        @Query('rate_model') rate_model?: string,
        @Query('limit') limit?: string,
        @Request() req?: { user: AuthenticatedUser },
    ): Promise<LocationIndexDocument[]> {
        const query: LocationSearchQuery = {
            q,
            region,
            rate_model,
            limit: limit ? parseInt(limit, 10) : undefined,
        };

        return this.searchService.search(query, req!.user);
    }

    /**
     * Retrieves a location by ID.
     */
    @Get('health')
    @ApiOperation({ summary: 'Health check', description: 'Check locations search service health' })
    async health(): Promise<{ status: string; opensearch: boolean }> {
        return {
            status: 'ok',
            opensearch: true,
        };
    }

    /**
     * Retrieves a location by ID.
     */
    @Get(':id')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get location by ID' })
    async findById(
        @Param('id') id: string,
    ): Promise<LocationIndexDocument | null> {
        return this.searchService.findById(id);
    }
}
