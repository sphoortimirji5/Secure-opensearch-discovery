# API Documentation

## Step 1: Generate a Token

Run this command:

```bash
node -e "console.log(require('jsonwebtoken').sign({sub:'test','cognito:groups':['auditor'],tenant_id:'rcm-internal',tenant_type:'internal'},'local-dev-secret-do-not-use-in-prod',{issuer:'http://localhost:3000',expiresIn:'1h'}))"
```

Copy the output token.

---

## Step 2: Authorize in Swagger UI

1. Open **http://localhost:3000/api-docs**
2. Click the green **Authorize** button
3. Paste: `Bearer <your-token>`
4. Click **Authorize** → **Close**

---

## Step 3: Test Endpoints

Click any endpoint → **Try it out** → **Execute**

---

## Other Roles

Replace `auditor` with `admin` for full access (including reindex operations).
