# Migration: Local → Production

How to deploy from local development to AWS production.

---

## Prerequisites

- AWS CLI configured
- Docker running
- AWS CDK CLI (`npm install -g aws-cdk`)

---

## Deploy to Production

```bash
cd infra
npm install

# First time only: bootstrap CDK
npx cdk bootstrap

# Deploy everything
npx cdk deploy
```

CDK deploys:
- VPC with public/private subnets
- ECS Fargate + ALB (builds & pushes container automatically)
- OpenSearch domain
- IAM roles for DynamoDB, OpenSearch, Bedrock

---

## Configuration

Edit `infra/bin/infra.ts` for production sizing:

```typescript
new MemberSearchStack(app, 'MemberSearchStack', {
    opensearchInstanceType: 'r6g.large.search',
    opensearchDataNodeCount: 2,
    cpu: 1024,
    memory: 2048,
    desiredCount: 2,
});
```

---

## After Deployment

1. **Create OpenSearch index** with mappings
2. **Deploy Lambda indexer** for DynamoDB Streams
3. **Backfill existing data** if any

---

## Rollback

CDK has automatic rollback on failed deployments. For manual rollback:

```bash
# Redeploy previous version
npx cdk deploy --previous
```

---

## Destroy

```bash
cd infra && npx cdk destroy
```

> **Warning**: Deletes all resources including OpenSearch data.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| CDK bootstrap error | `npx cdk bootstrap aws://<account>/<region>` |
| Docker build fails | Ensure Docker daemon is running |
| Fargate unhealthy | Check Grafana/Loki: `{app="membersearch-api"}` |
