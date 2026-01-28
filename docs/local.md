# Local Development

Docker-based environment for developing MemberSearch.

---

## Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Gemini API key (for local LLM testing)

---

## Quick Start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Install dependencies & seed data
npm install && npm run seed

# 3. Start API
npm run start:dev
```

API available at `http://localhost:3000`

---

## Infrastructure

| Service | Port | Purpose |
|---------|------|---------|
| OpenSearch | 9200 | Search cluster |
| OpenSearch Dashboards | 5601 | Query UI |
| DynamoDB Local | 8000 | Member data store |
| PostgreSQL | 5433 | Locations data store |
| Jaeger | 16686 | Trace UI |
| Prometheus | 9090 | Metrics |
| Grafana | 3001 | Dashboards |
| Loki | 3100 | Log aggregation |

---

## Environment

```bash
# .env.local
OPENSEARCH_NODE=http://localhost:9200
DYNAMODB_ENDPOINT=http://localhost:8000
JWT_SECRET=local-dev-secret-do-not-use-in-prod
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
```

---

## Testing

See [testing.md](testing.md) for unit, integration, E2E, and stress tests.

---

## Cleanup

```bash
docker-compose down -v
```
