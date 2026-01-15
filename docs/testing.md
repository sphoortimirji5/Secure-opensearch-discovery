# Testing Strategy

Comprehensive testing approach for MemberSearch.

---

## Testing Philosophy

| Type | Speed | Scope | Infrastructure |
|------|-------|-------|----------------|
| **Unit** | ~100ms | Single function | None (mocked) |
| **Integration** | ~5s | Module + DB | Testcontainers |
| **E2E** | ~10s | Full HTTP cycle | Docker Compose |
| **Smoke** | ~10s | Sanity check | Docker Compose |
| **Stress** | ~5min | Performance limits | Docker Compose |

---

## Test Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit | Jest | Service/controller logic |
| Integration | Jest + Testcontainers | Real OpenSearch queries |
| E2E | Supertest | HTTP request validation |
| Load | Artillery | Performance baseline |

---

## Unit Tests

```bash
npm run test
```

### What's Tested
- `RedactionService`: PII pattern detection
- `SearchService`: Query DSL building
- `RolesGuard`: RBAC logic
- `IndexerService`: Document transformation

### Example

```typescript
// redaction.service.spec.ts
describe('RedactionService', () => {
  it('redacts SSN patterns', () => {
    const input = 'SSN: 123-45-6789';
    const output = service.redact(input);
    expect(output).toBe('SSN: [REDACTED]');
  });

  it('redacts phone numbers', () => {
    const input = 'Call 555-123-4567';
    const output = service.redact(input);
    expect(output).toBe('Call [REDACTED]');
  });
});
```

---

## Integration Tests

```bash
npm run test:integration
```

Uses Testcontainers to spin up real OpenSearch and DynamoDB Local:

```typescript
// search.integration.spec.ts
describe('SearchService (Integration)', () => {
  let opensearchContainer: StartedTestContainer;
  
  beforeAll(async () => {
    opensearchContainer = await new GenericContainer('opensearchproject/opensearch:2.11.0')
      .withEnvironment({ 'discovery.type': 'single-node' })
      .withExposedPorts(9200)
      .start();
  });

  it('performs fuzzy search on member names', async () => {
    // Seed test data
    await indexTestMember({ fname: 'Jonathan', lname: 'Smith' });
    
    // Fuzzy match
    const results = await searchService.search({ q: 'Johnaton' });
    expect(results).toHaveLength(1);
    expect(results[0].fname).toBe('Jonathan');
  });
});
```

---

## E2E Tests

End-to-end tests validate the full request/response cycle through the HTTP layer, including:
- **Authentication**: JWT validation, 401 on missing/invalid tokens
- **Authorization**: RBAC field filtering per role
- **Search**: Fuzzy matching, email lookup, limit params
- **Observability**: Metrics endpoint, health check

```bash
npm run test:e2e
```

```typescript
// search.e2e-spec.ts
describe('/search (GET)', () => {
  it('returns 401 without JWT', () => {
    return request(app.getHttpServer())
      .get('/search?q=test')
      .expect(401);
  });

  it('returns filtered results for auditor role', () => {
    return request(app.getHttpServer())
      .get('/search?q=violation')
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body[0].status_notes).toBeUndefined(); // Filtered
      });
  });
});
```

---

## Security Regression Tests

Invariant tests that prove security properties hold across updates:

```typescript
// security.regression.spec.ts
describe('PII Invariants', () => {
  it('never indexes raw SSN even after member updates', async () => {
    // 1. Create member with SSN in notes
    const member = await createMember({
      member_id: 'test-123',
      status_notes: 'SSN: 123-45-6789 verified',
    });

    // 2. Trigger indexing
    await indexerService.processRecord(member);

    // 3. Query OpenSearch directly (bypass API)
    const doc = await opensearchClient.get({
      index: 'members',
      id: 'test-123',
    });

    // 4. Assert raw SSN never appears
    expect(doc._source.status_notes).not.toContain('123-45-6789');
    expect(doc._source.status_notes).toContain('[SSN-REDACTED]');
  });

  it('never exposes sensitive fields to auditor role', async () => {
    const result = await searchService.search(
      { q: 'test' },
      { role: 'auditor' }
    );
    
    result.forEach(doc => {
      expect(doc).not.toHaveProperty('ssn_last4');
      expect(doc).not.toHaveProperty('status_notes');
    });
  });
});
```

> These tests prove "PII never reaches OpenSearch" is an invariant, not just a feature.

---

## Stress & Load Testing

Load tests validate performance under sustained traffic. Two configurations:

| Config | Command | Duration | Purpose |
|--------|---------|----------|--------|
| **Smoke** | `npm run test:stress:smoke` | 10s | Quick sanity check |
| **Full** | `npm run test:stress` | 4+ min | Full stress with spike |

### What Stress Tests Validate
- **Latency SLOs**: p95 < 200ms, p99 < 500ms
- **Error budget**: < 1% failure rate
- **Throughput**: Sustained request handling
- **Cold start**: JVM warm-up behavior

```bash
# Quick validation (no infra required for API startup)
npm run test:stress:smoke

# Full stress test with spike phase
npm run test:stress
```

Artillery config (`artillery.yml`):

```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"

scenarios:
  - name: "Search flow"
    flow:
      - get:
          url: "/search?q=violation"
          headers:
            Authorization: "Bearer {{ $env.TEST_TOKEN }}"
```

### Baseline Targets

| Metric | Target |
|--------|--------|
| p50 latency | < 50ms |
| p99 latency | < 200ms |
| Error rate | < 0.1% |
| Throughput | > 100 RPS |

---

## CI Pipeline

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      opensearch:
        image: opensearchproject/opensearch:2.11.0
        ports: ['9200:9200']
        env:
          discovery.type: single-node
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test
      - run: npm run test:e2e
```
