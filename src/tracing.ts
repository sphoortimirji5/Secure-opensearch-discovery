/**
 * @fileoverview OpenTelemetry Tracing Setup
 *
 * Auto-instrumentation for distributed tracing with OTLP export to Jaeger.
 * This file MUST be imported before any other imports in main.ts.
 *
 * @remarks
 * Local: Exports to Jaeger at http://localhost:4318
 * Production: Configure OTEL_EXPORTER_OTLP_ENDPOINT for your tracing backend
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
    resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'membersearch-api',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    }),
    traceExporter,
    instrumentations: [
        getNodeAutoInstrumentations({
            // Disable noisy instrumentations
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
    ],
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error: Error) => console.error('Error terminating tracing', error))
        .finally(() => process.exit(0));
});

export { sdk };
