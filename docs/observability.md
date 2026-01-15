# Observability

Logging, metrics, and monitoring for MemberSearch.

---

## Logging

### NestJS API (nestjs-pino)

```typescript
// main.ts
import { Logger } from 'nestjs-pino';

app.useLogger(app.get(Logger));
```

**Configuration:**
```typescript
// app.module.ts
PinoModule.forRoot({
  pinoHttp: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
    redact: ['req.headers.authorization', 'res.headers["set-cookie"]'],
  },
});
```

### Log Format

**Local (pretty):**
```
[09:45:30] INFO: Search request received
  query: "violation"
  role: "auditor"
  duration: 45ms
```

**Production (JSON):**
```json
{"level":"info","time":1705312345,"msg":"Search request received","query":"violation","role":"auditor","duration":45}
```

---

## Metrics (Prometheus)

### Setup

```typescript
// app.module.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

PrometheusModule.register({
  path: '/metrics',
  defaultMetrics: { enabled: true },
});
```

### Custom Metrics

```typescript
// search.service.ts
import { Counter, Histogram } from 'prom-client';

const searchCounter = new Counter({
  name: 'membersearch_queries_total',
  help: 'Total number of search requests',
  labelNames: ['role', 'status'],
});

const searchDuration = new Histogram({
  name: 'membersearch_query_duration_seconds',
  help: 'Search request duration',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
});
```

### Key Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `membersearch_queries_total` | Counter | role, status |
| `membersearch_query_duration_seconds` | Histogram | - |
| `membersearch_index_operations_total` | Counter | status |
| `membersearch_dlq_messages_total` | Counter | - |
| `membersearch_index_lag_seconds` | Gauge | - |

### Index Lag Metric (CDC Health)

```typescript
// indexer.service.ts
import { Gauge } from 'prom-client';

const indexLag = new Gauge({
  name: 'membersearch_index_lag_seconds',
  help: 'Age of oldest unprocessed DynamoDB stream record',
});

// Derived from DynamoDB Streams CloudWatch metric:
// ApproximateAgeOfOldestRecord
```

> [!TIP]
> This metric directly supports the CDC story. If `membersearch_index_lag_seconds > 5`, the search index is drifting from the source of truth.

---

## Distributed Tracing (AWS X-Ray)

### Lambda Indexer
```typescript
import AWSXRay from 'aws-xray-sdk';
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
```

### NestJS (via OpenTelemetry)
```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';

const sdk = new NodeSDK({
  textMapPropagator: new AWSXRayPropagator(),
});
sdk.start();
```

---

## Service Level Objectives (SLOs)

| SLI | Target | Measurement |
|-----|--------|-------------|
| Search Availability | 99.9% | Successful responses / total requests |
| Search Latency (p99) | < 200ms | Histogram percentile |
| Index Lag | < 5 seconds | Stream age metric |
| DLQ Empty | 100% | SQS message count = 0 |

---

## Alerting

### CloudWatch Alarms

```yaml
# DLQ not empty
- AlarmName: MemberSearchDLQNotEmpty
  MetricName: ApproximateNumberOfMessagesVisible
  Namespace: AWS/SQS
  Threshold: 1
  ComparisonOperator: GreaterThanOrEqualToThreshold

# High error rate
- AlarmName: MemberSearchAPIErrors
  MetricName: 5XXError
  Namespace: AWS/ApiGateway
  Threshold: 1
  EvaluationPeriods: 1

# Index drift detection
- AlarmName: MemberSearchIndexLag
  MetricName: ApproximateAgeOfOldestRecord
  Namespace: AWS/DynamoDB
  Dimensions:
    - Name: TableName
      Value: members
  Threshold: 5000  # 5 seconds in milliseconds
  ComparisonOperator: GreaterThanThreshold
```

---

## Dashboards

### Grafana (if self-hosting metrics)
- Search RPS and latency
- Index operations per second
- DLQ message count
- OpenSearch cluster health

### CloudWatch Dashboard
- Lambda invocations and errors
- API Gateway latency percentiles
- OpenSearch domain metrics
