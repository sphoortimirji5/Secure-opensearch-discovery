# Migration Guide

Strategies for moving between environments and handling data migrations.

---

## Local → Production

### Pre-flight Checklist

- [ ] OpenSearch index mappings match production
- [ ] DynamoDB table schema identical
- [ ] IAM roles created with correct policies
- [ ] VPC endpoints configured for OpenSearch
- [ ] Cognito user pool + app client configured
- [ ] DLQ created and alarmed

### Credentials Strategy

| Environment | Method | Configuration |
|-------------|--------|---------------|
| **Local** | Dummy credentials | `accessKeyId: 'local'` in seed script |
| **ECS** | Task IAM Role | Attached to ECS Task Definition |
| **Lambda** | Execution Role | Attached to Lambda function |

Never hardcode AWS credentials in production. The AWS SDK v3 automatically picks up credentials from:
1. Environment variables (CI/CD)
2. ECS Task Role (container metadata endpoint)
3. Lambda Execution Role (automatic)
4. EC2 Instance Profile

```typescript
// members.repository.ts - no credentials specified
const client = new DynamoDBClient({
  region,
  ...(endpoint && { endpoint }), // Only for local
  // SDK auto-resolves credentials from IAM Task Role
});
```

### Steps

1. **Deploy OpenSearch Domain**
   ```bash
   # Via Terraform/CDK
   terraform apply -target=module.opensearch
   ```

2. **Create Index with Mappings**
   ```bash
   # Run from bastion or Lambda
   curl -X PUT "https://<domain>/_index/members" \
     -H "Content-Type: application/json" \
     -d @mappings.json
   ```

3. **Enable DynamoDB Streams**
   ```bash
   aws dynamodb update-table \
     --table-name members \
     --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES
   ```

4. **Deploy Lambda Indexer**
   ```bash
   serverless deploy --stage prod
   ```

5. **Backfill Existing Data**
   ```bash
   # One-time script to index existing records
   npm run backfill:prod
   ```

6. **Deploy NestJS API**
   ```bash
   # ECS or Lambda deployment
   terraform apply -target=module.api
   ```

---

## Index Rebuilding

When mappings change or data needs re-indexing:

Mapping changes must be backward-compatible with existing DLQ records. If you add required fields or change field types, replaying the DLQ may fail. Always test DLQ replay in staging before deploying mapping changes to production.

### Zero-Downtime Reindex

```bash
# 1. Create new index with updated mappings
curl -X PUT "https://<domain>/members-v2" -d @new_mappings.json

# 2. Reindex from old to new
curl -X POST "https://<domain>/_reindex" \
  -H "Content-Type: application/json" \
  -d '{
    "source": {"index": "members"},
    "dest": {"index": "members-v2"}
  }'

# 3. Alias swap (atomic)
curl -X POST "https://<domain>/_aliases" \
  -H "Content-Type: application/json" \
  -d '{
    "actions": [
      {"remove": {"index": "members", "alias": "members-live"}},
      {"add": {"index": "members-v2", "alias": "members-live"}}
    ]
  }'

# 4. Delete old index
curl -X DELETE "https://<domain>/members"
```

---

## Rollback Strategy

### API Rollback
- ECS: Redeploy previous task definition
- Lambda: Point alias to previous version

### Index Rollback
- Keep previous index version for 24h before deletion
- Use aliases to instantly switch back

### Stream Processing Rollback
- DLQ preserves failed records
- Replay DLQ after fixing indexer bugs

---

## Data Consistency Verification

```bash
# Compare record counts
DYNAMO_COUNT=$(aws dynamodb scan --table-name members --select COUNT | jq .Count)
OS_COUNT=$(curl -s "https://<domain>/members/_count" | jq .count)

if [ "$DYNAMO_COUNT" -eq "$OS_COUNT" ]; then
  echo "Counts match: $DYNAMO_COUNT"
else
  echo "Mismatch: DynamoDB=$DYNAMO_COUNT, OpenSearch=$OS_COUNT"
fi
```
