# MemberSearch

**Secure OpenSearch Discovery API for Protected Membership Data**

Internal NestJS service providing sub-second fuzzy search over PII-redacted member records, synchronized from DynamoDB via event-driven indexing.

---

## Problem

Transactional DynamoDB cannot support complex text searches (fuzzy names, status notes). Querying production tables directly impacts write performance and lacks full-text search capabilities.

## Solution

Extract → Redact → Index pipeline that creates a searchable, PII-protected OpenSearch index for internal administrative queries.

---

## Non-Goals

- **Real-time transactional consistency** with DynamoDB (eventual consistency is acceptable)
- **Member-facing search** — this is an internal administrative tool only

---

## TL;DR

- **Source of Truth**: DynamoDB (member records)
- **Search Layer**: OpenSearch with fuzzy/n-gram analysis
- **Sync**: DynamoDB Streams → Lambda Indexer → OpenSearch
- **PII Protection**: SSN/phone/email redacted before indexing
- **RBAC**: Role-based field filtering (Auditor vs Compliance Lead)
- **Idempotency**: `member_id` as OpenSearch `_id` (retries are harmless)

---

## Architecture

```
┌─────────────┐     DynamoDB      ┌─────────────────┐
│  DynamoDB   │ ───  Streams  ──► │  Lambda Indexer │
│  (Members)  │                   │  + Redaction    │
└─────────────┘                   └────────┬────────┘
                                           │
                                           ▼
┌─────────────┐                   ┌─────────────────┐
│  NestJS API │ ◄──── Query ───── │   OpenSearch    │
│  (Search)   │                   │  (members idx)  │
└─────────────┘                   └─────────────────┘
       │
       ▼ RBAC-filtered response
   [ Client ]
```

---

## Project Structure

```
src/
├── main.ts                      # Bootstrap (Express or Lambda adapter)
├── app.module.ts                # Root module
├── config/
│   └── config.module.ts         # Environment config with Zod validation
├── search/
│   ├── search.module.ts
│   ├── search.controller.ts     # GET /search endpoint
│   ├── search.service.ts        # Query building, source filtering
│   └── opensearch.provider.ts   # Client factory (local vs AWS)
├── members/
│   ├── members.module.ts
│   └── members.repository.ts    # DynamoDB DocumentClient wrapper
├── redaction/
│   ├── redaction.module.ts
│   └── redaction.service.ts     # PII pattern detection & masking
├── auth/
│   ├── auth.module.ts
│   ├── jwt.strategy.ts          # Passport JWT validation
│   └── roles.guard.ts           # RBAC enforcement
└── indexer/
    ├── indexer.module.ts
    └── indexer.service.ts       # Bulk index with redaction

scripts/
├── seed.ts                      # Local data seeding
└── generate-local-jwt.ts        # Mock JWT generation

indexer/                         # Lambda function (separate deploy)
└── handler.ts                   # DynamoDB Streams consumer
```

---

## Environment Hub

| Environment | Purpose | Documentation |
|-------------|---------|---------------|
| Local | Docker-based development | [docs/local.md](docs/local.md) |
| Production | AWS (OpenSearch Service, Lambda, DynamoDB) | [docs/production.md](docs/production.md) |
| Migration | Switching environments | [docs/migration.md](docs/migration.md) |

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search Engine | OpenSearch | AWS-managed, fuzzy search, field-level security |
| Sync Mechanism | DynamoDB Streams | Near real-time, built-in retry, 24h retention |
| Idempotency | `member_id` = `_id` | Natural deduplication, no external state |
| PII Handling | Pre-index redaction | Sensitive data never reaches search index |
| DLQ | SQS | Failed records preserved for replay |

---

## Quickstart

```bash
# 1. Start local infrastructure
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Seed mock data
npm run seed

# 4. Start API
npm run start:dev

# 5. Test search
curl "http://localhost:3000/search?q=violation"
```

---

## Documentation

- [Local Development](docs/local.md)
- [Production Deployment](docs/production.md)
- [Migration Guide](docs/migration.md)
- [Testing Strategy](docs/testing.md)
- [Observability](docs/observability.md)
- [Security](docs/security.md)
- [Scale & Failure Modes](docs/scale.md)

