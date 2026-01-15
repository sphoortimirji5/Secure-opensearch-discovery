# Scale Analysis & Failure Modes

Traffic analysis for MemberSearch with mitigation strategies.

---

## Traffic Profiles

| Profile | Volume | Sustained RPS | Risk Level |
|---------|--------|---------------|------------|
| **Baseline** | 100 req/hr | ~0.03 RPS | Low |
| **Bursty** | 5,000–10,000 req/hr | ~1.4–2.8 RPS | Medium |

---

## Baseline Traffic (100 req/hr)

**~1.7 requests/minute** — handles comfortably with default configuration.

### What Works
- Single OpenSearch node sufficient
- Default NestJS connection pool
- No rate limiting required
- Cold starts acceptable

### What Could Still Break

| Component | Failure Mode | Mitigation |
|-----------|--------------|------------|
| OpenSearch | Index corruption from bad deploys | Use index aliases, keep rollback version |
| DynamoDB Streams | Poison records causing retry loops | Enable DLQ, set `bisectBatchOnFunctionError` |
| JWT validation | Expired tokens causing 401 spikes | Client-side token refresh before expiry |

---

## Bursty Traffic (5,000–10,000 req/hr)

**~80–170 requests/min (~1.4–2.8 RPS)** with short spikes depending on client batching (e.g., cron jobs, UI refresh waves).

> [!NOTE]
> This is NOT high traffic by most standards. Most breaking points at this scale are configuration issues, not capacity limits.

### Likely Breaking Points

---

#### 1. Slow Queries / Query Explosions

**Symptom**: p99 latency spikes, OpenSearch CPU saturation

**Why**: Unbounded searches, leading wildcards, or large result sets

**Mitigation**:
- Cap result size: `size <= 50`
- Block leading wildcards in query validation
- Strict `_source` filtering (only return needed fields)
- Add request timeouts (10s max)

```typescript
// search.service.ts - enforce limits
const sanitizedSize = Math.min(query.limit || 20, 50);
if (query.q?.startsWith('*')) {
  throw new BadRequestException('Leading wildcards not allowed');
}
```

---

#### 2. Connection Churn (Keep-Alive Not Working)

**Symptom**: `ConnectionError`, `TimeoutError`, high latency variance

**Why**: If HTTP keep-alive isn't enabled, each request creates a new TCP/TLS connection, causing overhead and potential exhaustion

**Mitigation**:
- Ensure HTTP keep-alive is enabled on OpenSearch client
- Bound in-flight requests to OpenSearch
- Add request timeouts and fail fast

```typescript
// opensearch.provider.ts
const client = new Client({
  node: opensearchUrl,
  requestTimeout: 10000,
  maxRetries: 2,
  // Node.js http.Agent handles keep-alive by default
});
```

---

#### 3. Indexer Backlog from Downstream Pressure

**Symptom**: `ApproximateAgeOfOldestRecord` grows, DLQ fills up

**Why**: OpenSearch throttling (429), poison records causing retry loops, or insufficient Lambda concurrency

**Mitigation**:
- Set reserved concurrency on indexer Lambda (e.g., 5–10)
- Use batching window to improve bulk efficiency (`maximumBatchingWindow: 5`)
- Keep batch size reasonable (100–200) — larger batches increase blast radius per failure
- Implement backoff on 429/5xx from OpenSearch
- Route poison records to DLQ quickly (don't infinite-retry)

```yaml
# serverless.yml
functions:
  indexer:
    reservedConcurrency: 10
    events:
      - stream:
          arn: ${self:custom.dynamoStreamArn}
          batchSize: 100
          maximumBatchingWindow: 5
          bisectBatchOnFunctionError: true
          maximumRetryAttempts: 2
```

> [!NOTE]
> DynamoDB Streams is fine at this scale. Kinesis is only needed if your write rate is massive (10,000+ writes/min), not for 3 RPS search traffic.

---

#### 4. OpenSearch Read/Write Contention

**Symptom**: Query latency degrades during heavy indexing

**Why**: Indexing and querying share the same domain resources

**Mitigation**:
- Scale nodes horizontally (add data nodes)
- Add replicas for read scaling
- Reduce indexing load during traffic spikes (pause/backoff)
- Consider separate read vs write coordination nodes for larger deployments

---

#### 5. API Gateway Stage Throttles

**Symptom**: `429 ThrottlingException` from API Gateway

**Why**: If you've set custom stage throttles, they may accidentally block your burst profile

**Mitigation**:
- Review stage throttle settings match your expected burst
- This is rarely the bottleneck at < 10 RPS

```yaml
# Example - only if you've set limits
throttle:
  rateLimit: 100       # Sustained rate
  burstLimit: 200      # Spike headroom
```

---

#### 6. JWT/JWKS Validation Overhead

**Symptom**: High CPU on NestJS pods during request spikes

**Why**: JWKS fetch on every request (misconfiguration) or key not cached

**Mitigation**:
- Most JWKS libraries cache by default — verify yours is configured
- Cache verified key material in-process
- Ensure you're NOT fetching JWKS on every request

```typescript
// jwt.strategy.ts - verify caching is enabled
const jwksClient = require('jwks-rsa');
const client = jwksClient({
  jwksUri: `${issuer}/.well-known/jwks.json`,
  cache: true,                    // Must be true
  cacheMaxEntries: 5,
  cacheMaxAge: 600000,            // 10 minutes
});
```

---

#### 7. DLQ Accumulation

**Symptom**: DLQ message count grows, records not being processed

**Why**: Burst of indexing failures (bad data, OpenSearch throttling)

**Mitigation**:
- Set DLQ **retention period** to 14 days (max SQS allows)
- Create DLQ replay mechanism with exponential backoff
- Alarm thresholds tuned for low volume:
  - **Warning**: >= 1 message (investigate)
  - **Critical**: >= 20 messages (immediate action)

```yaml
# CloudWatch Alarm - low volume appropriate
- Name: MemberSearchDLQWarning
  Metric: ApproximateNumberOfMessagesVisible
  Threshold: 1
  Period: 300
  EvaluationPeriods: 1
```

---

#### 8. Alert Noise at Low Volume

**Symptom**: Percentage-based alerts fire on single errors

**Why**: 1 error out of 10 requests = 10% error rate, triggers alert

**Mitigation**:
- Use absolute thresholds: "N errors in 5 minutes" not "X% error rate"
- For low-volume services, count-based alerts are more actionable

```yaml
# Prefer this
- Metric: membersearch_errors_total
  Threshold: 5           # 5 errors in window
  Period: 300

# Not this at low volume
- Metric: error_rate_percent
  Threshold: 1           # Fires on 1 error if only 10 requests
```

---

## Unexpected Traffic Event (1,000+ RPS)

If traffic spikes to 1,000+ RPS (orders of magnitude above normal), this is an **incident**, not normal scaling:

| Component | Will Break | Immediate Action |
|-----------|------------|------------------|
| OpenSearch | Yes — connection exhaustion, queue depth | Scale cluster, enable circuit breaker |
| API | Likely — pod CPU saturation | Scale ECS tasks to 10+ |
| DynamoDB Streams | Maybe — depends on write volume | Increase Lambda concurrency |
| API Gateway | Maybe — depends on account limits | Request limit increase |

**Runbook**: Treat as incident. Scale first, investigate source second.

---

## Scaling Recommendations by Traffic

| Traffic | OpenSearch | ECS Tasks | Lambda | Relative Cost |
|---------|------------|-----------|--------|---------------|
| 100 req/hr | 1 node | 1 | On-demand | Low |
| 1,000 req/hr | 1 node + replica | 2 | On-demand | Low–Medium |
| 5,000 req/hr | 2 nodes | 3–5 | Reserved (5) | Medium |
| 10,000 req/hr | 3 nodes | 5–10 | Reserved (10) | Medium–High |

---

## Pre-Burst Checklist

Before expecting traffic spikes:

- [ ] HTTP keep-alive verified on OpenSearch client
- [ ] Query size limits enforced (max 50)
- [ ] Lambda reserved concurrency set
- [ ] DLQ alarm at >= 1 message
- [ ] JWKS caching verified (not fetching every request)
- [ ] Load test completed at 2x expected peak
- [ ] Absolute-count alerts configured (not just %)

---

## Monitoring During Burst

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| `membersearch_query_duration_seconds` p99 | < 200ms | 200–500ms | > 500ms |
| OpenSearch CPU | < 50% | 50–80% | > 80% |
| DLQ message count | 0 | >= 1 | >= 20 |
| Lambda concurrent executions | < 5 | 5–10 | > 20 |
| Error count (5 min window) | 0 | 1–5 | > 10 |

---

## Recovery Procedures

### OpenSearch Overload
1. Pause indexing (disable Lambda trigger)
2. Scale cluster nodes
3. Resume indexing with smaller batch size

### DLQ Accumulation
1. Investigate: validation errors vs OpenSearch throttling
2. Fix root cause
3. Replay DLQ in small batches (10 at a time)

### API Saturation
1. Scale ECS tasks
2. Enable response caching if applicable (60s TTL for stable data)
3. Rate-limit abusive clients
