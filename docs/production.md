# Production Deployment

AWS-based production architecture for MemberSearch.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐ │
│  │   DynamoDB   │───►│    Lambda    │───►│  OpenSearch   │ │
│  │   + Streams  │    │   Indexer    │    │   Service     │ │
│  └──────────────┘    └──────┬───────┘    └───────────────┘ │
│                             │                    ▲          │
│                             ▼                    │          │
│                      ┌──────────────┐            │          │
│                      │   SQS DLQ    │            │          │
│                      └──────────────┘            │          │
│                                                  │          │
│  ┌──────────────┐    ┌──────────────┐           │          │
│  │ API Gateway  │───►│  ECS/Lambda  │───────────┘          │
│  │   + Cognito  │    │  NestJS API  │                      │
│  └──────────────┘    └──────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### DynamoDB
- **Table**: `members`
- **Stream**: NEW_AND_OLD_IMAGES (for change detection)
- **Partition Key**: `member_id`

### Lambda Indexer
- **Trigger**: DynamoDB Streams
- **Batch Size**: 100 records
- **Retry**: 3 attempts with bisect on error
- **DLQ**: SQS queue for failed records

### OpenSearch Service
- **Domain**: `membersearch`
- **Instance**: `r6g.large.search` (production)
- **Access**: VPC endpoint, IAM signing
- **Index**: `members` with custom analyzers

### NestJS API
- **Deployment**: ECS Fargate or Lambda (via `@vendia/serverless-express`)
- **Auth**: Cognito JWT via API Gateway authorizer
- **Networking**: VPC with OpenSearch access

### Index Lifecycle Management

| Aspect | Strategy | Rationale |
|--------|----------|-----------|
| **Sharding** | 1 primary, 1 replica | Sufficient for <10M documents; adjust if growth exceeds |
| **Rollover** | Not required initially | Single index; implement when index size exceeds 50GB |
| **Retention** | Indefinite (sync with DynamoDB) | Soft deletes via TTL if needed |

> [!NOTE]
> Index lifecycle policies (ILM) can be added later if data volume grows. For now, a single `members` index with alias-based reindexing is sufficient.

---

## Environment Variables

```bash
# .env.production
OPENSEARCH_NODE=https://membersearch.us-east-1.es.amazonaws.com
AWS_REGION=us-east-1
# No DYNAMODB_ENDPOINT — uses real AWS
# No SKIP_AUTH — JWT required
```

---

## IAM Policies

### Lambda Indexer
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetRecords",
    "dynamodb:GetShardIterator",
    "dynamodb:DescribeStream",
    "dynamodb:ListStreams"
  ],
  "Resource": "arn:aws:dynamodb:*:*:table/members/stream/*"
}
```

### OpenSearch Access
```json
{
  "Effect": "Allow",
  "Action": ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpPut"],
  "Resource": "arn:aws:es:*:*:domain/membersearch/*"
}
```

---

## Deployment

### Lambda Indexer (Serverless Framework)
```bash
cd indexer/
serverless deploy --stage prod
```

### NestJS API (ECS)
```bash
# Build container
docker build -t membersearch-api .

# Push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker tag membersearch-api:latest <account>.dkr.ecr.<region>.amazonaws.com/membersearch-api:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/membersearch-api:latest

# Deploy via Terraform/CDK
terraform apply
```

---

## Monitoring

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| DLQ Message Count | SQS | > 0 |
| Lambda Errors | CloudWatch | > 1% error rate |
| OpenSearch Cluster Health | OpenSearch | Yellow/Red |
| API p99 Latency | API Gateway | > 500ms |
