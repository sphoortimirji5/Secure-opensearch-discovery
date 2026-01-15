# Local Development

Docker-based environment for developing and testing MemberSearch without AWS dependencies.

---

## Prerequisites

- Docker & Docker Compose
- Node.js 18+
- npm or yarn

---

## Infrastructure

```bash
docker-compose up -d
```

| Service | Port | Purpose |
|---------|------|---------|
| OpenSearch | 9200 | Search cluster (single-node) |
| OpenSearch Dashboards | 5601 | Query UI (optional) |
| DynamoDB Local | 8000 | Member data store |

---

## Environment Configuration

```bash
# .env.local
OPENSEARCH_NODE=http://localhost:9200
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_REGION=us-east-1
JWT_ISSUER=http://localhost:3000  # Local mock issuer
```

> [!CAUTION]
> **Do not use `SKIP_AUTH=true`** — this trains unsafe habits. Instead, use mock JWTs for local development.

### Mock JWT Setup

Generate deterministic test tokens for local development:

```typescript
// scripts/generate-local-jwt.ts
import * as jwt from 'jsonwebtoken';

const LOCAL_SECRET = 'local-dev-secret-do-not-use-in-prod';

export const mockAuditorToken = jwt.sign(
  { sub: 'local-auditor', 'cognito:groups': ['auditor'] },
  LOCAL_SECRET,
  { issuer: 'http://localhost:3000', expiresIn: '24h' }
);

export const mockComplianceToken = jwt.sign(
  { sub: 'local-compliance', 'cognito:groups': ['compliance_lead'] },
  LOCAL_SECRET,
  { issuer: 'http://localhost:3000', expiresIn: '24h' }
);
```

```bash
# Use in curl
curl "http://localhost:3000/search?q=violation" \
  -H "Authorization: Bearer $(npm run --silent token:auditor)"
```

---

## Seeding Data

```bash
npm run seed
```

This script:
1. Creates the DynamoDB `members` table
2. Inserts mock member records
3. Creates OpenSearch `members` index with proper mappings
4. Runs redaction pipeline → bulk indexes documents

---

## Running the API

```bash
npm run start:dev
```

API available at `http://localhost:3000`

### Test Endpoints

```bash
# Fuzzy search (with mock JWT)
curl "http://localhost:3000/search?q=violation" \
  -H "Authorization: Bearer $(npm run --silent token:auditor)"

# Health check (no auth required)
curl "http://localhost:3000/health"
```

---

## Hot Reload

NestJS runs with `--watch` in dev mode. Changes to `src/` automatically restart the server.

---

## Debugging

```bash
# View OpenSearch indices
curl http://localhost:9200/_cat/indices?v

# Query OpenSearch directly
curl -X GET "http://localhost:9200/members/_search?pretty" \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}}'

# View DynamoDB tables
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

---

## Cleanup

```bash
docker-compose down -v  # Remove volumes too
```
