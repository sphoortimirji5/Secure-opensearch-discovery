import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { z } from 'zod';

// Zod schema for environment validation
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default('3000'),

    // OpenSearch
    OPENSEARCH_NODE: z.string().url(),

    // DynamoDB
    DYNAMODB_ENDPOINT: z.string().url().optional(),
    AWS_REGION: z.string().default('us-east-1'),

    // Auth
    JWT_ISSUER: z.string(),
    JWT_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

@Global()
@Module({
    imports: [
        NestConfigModule.forRoot({
            envFilePath: ['.env.local', '.env'],
            validate: (config) => {
                const result = envSchema.safeParse(config);
                if (!result.success) {
                    console.error('Invalid environment configuration:');
                    console.error(result.error.format());
                    throw new Error('Invalid environment configuration');
                }
                return result.data;
            },
        }),
    ],
    providers: [ConfigService],
    exports: [ConfigService],
})
export class ConfigModule { }
