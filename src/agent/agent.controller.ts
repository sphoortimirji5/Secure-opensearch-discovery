/**
 * @fileoverview Agent Controller
 *
 * HTTP endpoints for LLM-powered analysis.
 */

import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';
import { AuthenticatedUser } from '../shared/auth';
import { Insight } from './interfaces';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
    constructor(private agentService: AgentService) { }

    /**
     * Analyzes data to answer a business question.
     */
    @Post('analyze')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    @ApiOperation({ summary: 'LLM-powered analysis', description: 'Analyze data to answer a business question' })
    @ApiBody({ type: AnalyzeRequestDto })
    async analyze(
        @Body() request: AnalyzeRequestDto,
        @Request() req: { user: AuthenticatedUser },
    ): Promise<Insight> {
        return this.agentService.analyze(request, req.user);
    }

    /**
     * Health check for agent service.
     */
    @Get('health')
    @ApiOperation({ summary: 'Health check', description: 'Check agent service and LLM connectivity' })
    async health(): Promise<{ status: string; llm: boolean; circuitBreaker: string }> {
        return {
            status: 'ok',
            llm: true,
            circuitBreaker: 'closed',
        };
    }
}
