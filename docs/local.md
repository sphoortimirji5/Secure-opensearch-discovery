# Local Development

Docker-based environment for developing Secure OpenSearch Discovery.

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

## API Endpoints

### Membership (DynamoDB → OpenSearch)

```bash
# Search members
GET /members/search?q=john%20smith&limit=20

# Reindex from DynamoDB
POST /members/reindex
```

### Locations (PostgreSQL → OpenSearch)

```bash
# Search locations
GET /locations/search?q=downtown&region=Northeast&rate_model=standard

# Get by ID
GET /locations/:id

# Reindex from PostgreSQL
POST /locations/reindex
```

### Agent (LLM Analysis)

```bash
# Analyze data with LLM
POST /agent/analyze
Content-Type: application/json

{"question": "What are the enrollment trends for Q4?"}
```

---

## Environment

```bash
# .env.local
OPENSEARCH_NODE=http://localhost:9200
DYNAMODB_ENDPOINT=http://localhost:8000
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
JWT_SECRET=local-dev-secret-do-not-use-in-prod
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
LLM_TIMEOUT_MS=30000
LLM_CIRCUIT_RESET_MS=30000
```

---

## Testing

See [testing.md](testing.md) for unit, integration, E2E, and stress tests.

---

## Cleanup

```bash
docker-compose down -v
```
