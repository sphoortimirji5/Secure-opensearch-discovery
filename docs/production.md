# Production Deployment

AWS-based production architecture for Secure OpenSearch Discovery multi-vertical platform.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              VPC                                      │
│                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────────┐ │
│  │  DynamoDB   │───►│   Lambda    │───►│                          │ │
│  │  + Streams  │    │  Indexer    │    │      OpenSearch          │ │
│  └─────────────┘    └─────────────┘    │       Service            │ │
│                                        │                          │ │
│  ┌─────────────┐    ┌─────────────┐    │   members index          │ │
│  │ PostgreSQL  │───►│ ECS/Lambda  │───►│   locations index        │ │
│  │    (RDS)    │    │  Indexer    │    │                          │ │
│  └─────────────┘    └─────────────┘    └──────────────────────────┘ │
│                                                     ▲                │
│                                                     │                │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────┴───────────┐    │
│  │    API      │───►│    ECS      │───►│      Bedrock         │    │
│  │  Gateway    │    │  NestJS     │    │  (Claude/Titan)      │    │
│  │  + Cognito  │    │    API      │    └──────────────────────┘    │
│  └─────────────┘    └─────────────┘                                 │
│                           │                                          │
│                     ┌─────┴─────┐                                   │
│                     │  SQS DLQ  │                                   │
│                     └───────────┘                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Components

### Membership Vertical

| Component | Service | Purpose |
|-----------|---------|---------|
| Source | DynamoDB | Member records |
| Sync | DynamoDB Streams + Lambda | Real-time CDC |
| Index | OpenSearch `members` | Fuzzy search |

### Locations Vertical

| Component | Service | Purpose |
|-----------|---------|---------|
| Source | RDS PostgreSQL | Location records |
| Sync | Scheduled Lambda / ECS Task | Batch reindex |
| Index | OpenSearch `locations` | Filter by region/rate |

### Agent Vertical

| Component | Service | Purpose |
|-----------|---------|---------|
| LLM | AWS Bedrock | Claude/Titan inference |
| Auth | IAM Task Roles | No API keys needed |
| Guardrails | Built-in | Input/output validation |

---

## Environment Variables

```bash
# .env.production
OPENSEARCH_NODE=https://membersearch.us-east-1.es.amazonaws.com
AWS_REGION=us-east-1
JWT_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/<pool-id>

# PostgreSQL (Locations)
POSTGRES_HOST=membersearch-locations.xxx.us-east-1.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=locations

# LLM (Agent)
LLM_PROVIDER=bedrock
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

---

## Access & Authentication

| Component | Auth Method | Access |
|-----------|-------------|--------|
| **NestJS API** | ECS Task Role | OpenSearch, Bedrock, DynamoDB |
| **Lambda Indexer** | Lambda Execution Role | DynamoDB Streams, OpenSearch write |
| **OpenSearch** | IAM-based signing | No credentials in code |
| **Bedrock** | IAM Task Role | No API keys—uses STS credentials |
| **RDS** | IAM auth or Secrets Manager | Rotated credentials |

> All IAM roles are defined in `infra/` CDK stack. No API keys or secrets in application code.

---

## Deployment

See [migration.md](migration.md) for deployment steps.

---

## Index Lifecycle Management

| Aspect | Strategy | Rationale |
|--------|----------|-----------|
| **Sharding** | 1 primary, 1 replica | Sufficient for <10M documents |
| **Rollover** | Not required initially | Single index per vertical |
| **Retention** | Indefinite | Sync with source systems |

---

## Monitoring

See [observability.md](observability.md) for metrics, alerting, and dashboards.
