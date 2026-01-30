// OpenTelemetry must be imported FIRST before any other imports
import './shared/tracing/tracing';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    // Use Pino logger
    app.useLogger(app.get(Logger));

    // Swagger API documentation
    const config = new DocumentBuilder()
        .setTitle('Secure OpenSearch Discovery API')
        .setDescription('Multi-vertical search and LLM analysis platform for healthcare fitness data')
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('members', 'Member search and indexing')
        .addTag('locations', 'Location search and management')
        .addTag('agent', 'LLM-powered analysis')
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);

    const port = process.env.PORT ?? 3000;
    await app.listen(port);

    console.log(`Secure OpenSearch Discovery API running on http://localhost:${port}`);
    console.log(`Swagger docs available at http://localhost:${port}/api-docs`);
}

bootstrap();
