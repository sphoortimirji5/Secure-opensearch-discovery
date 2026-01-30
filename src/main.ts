// OpenTelemetry must be imported FIRST before any other imports
import './shared/tracing/tracing';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    // Use Pino logger
    app.useLogger(app.get(Logger));

    const port = process.env.PORT ?? 3000;
    await app.listen(port);

    console.log(`MemberSearch API running on http://localhost:${port}`);
}

bootstrap();
