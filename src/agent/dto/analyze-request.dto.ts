/**
 * @fileoverview Analyze Request DTO
 */

import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeRequestDto {
    @ApiProperty({ example: 'Which members are at-risk and need follow-up?', description: 'Business question to analyze' })
    @IsString()
    question: string;

    @ApiPropertyOptional({ example: 'GYM_104', description: 'Optional location ID to focus analysis' })
    @IsOptional()
    @IsString()
    locationId?: string;

    @ApiPropertyOptional({ example: 10, description: 'Max data points to analyze (1-500)' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(500)
    limit?: number;
}

