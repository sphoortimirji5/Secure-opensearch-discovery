import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { SearchModule } from './search/search.module';
import { RedactionModule } from './redaction/redaction.module';
import { MembersModule } from './members/members.module';
import { IndexerModule } from './indexer/indexer.module';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
    imports: [
        // Logging
        LoggerModule.forRoot({
            pinoHttp: {
                level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
                transport: process.env.NODE_ENV !== 'production'
                    ? { target: 'pino-pretty' }
                    : undefined,
                redact: ['req.headers.authorization', 'res.headers["set-cookie"]'],
            },
        }),

        // Metrics
        PrometheusModule.register({
            path: '/metrics',
            defaultMetrics: { enabled: true },
        }),

        // Application modules
        ConfigModule,
        AuthModule,
        RedactionModule,
        MembersModule,
        SearchModule,
        IndexerModule,
    ],
})
export class AppModule { }
