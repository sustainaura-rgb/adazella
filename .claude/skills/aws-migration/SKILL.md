---
name: aws-migration
description: AWS migration patterns for Adazella — moving from Render/Supabase/Netlify to AWS App Runner/RDS/Cognito/Amplify. Use when planning AWS resources, writing IAM policies, or designing migration scripts.
---

# AWS Migration Playbook

## Target architecture

| Service | Replaces | Why |
|---|---|---|
| App Runner (API) | Render Web Service | Always-on, auto-scale, simpler than ECS |
| Lambda + EventBridge | Render Scheduler | Pay-per-invocation, scales infinitely |
| RDS PostgreSQL Multi-AZ | Supabase Postgres | Production-grade with Multi-AZ failover |
| Cognito User Pools | Supabase Auth | Native Google OAuth + MFA |
| Amplify Hosting | Netlify | AWS-native, integrated with App Runner |
| CloudFront + WAF | Cloudflare | Edge delivery + DDoS in same account |
| SES | Resend/Brevo | $0.10/1000 emails, native AWS |
| Secrets Manager | env vars | Auto-rotation, audit log |
| KMS | (none) | Encryption keys with HSM backing |
| CloudTrail | (none) | Compliance audit log |

## Region choice

**Recommendation: `ap-south-1` (Mumbai)**
- Closer to Indian customer base (lower latency)
- US users still get acceptable latency (<200ms)
- Pricing similar to us-east-1
- Multi-AZ available (ap-south-1a, 1b, 1c)

## Migration order

### Phase 1: Foundation
1. AWS account + MFA + IAM admin
2. Apply for AWS Activate Founders ($1,000)
3. VPC: 2 public + 2 private subnets across 2 AZs
4. Security groups (DB only accessible from App Runner)

### Phase 2: Data layer
5. RDS PostgreSQL db.t4g.small (or db.t4g.micro for credits stretching) Multi-AZ
6. Migrate data from Supabase: pg_dump → restore
7. Create Cognito user pool + Google provider
8. Migrate users: export from Supabase → bulk import to Cognito

### Phase 3: Compute
9. Deploy API to App Runner (private VPC link to RDS)
10. Convert scheduler to Lambda functions (one per job type) + EventBridge schedules
11. Deploy frontend to Amplify
12. Configure CloudFront + WAF

### Phase 4: Security + Cutover
13. Move secrets to Secrets Manager
14. KMS keys for token encryption
15. Enable CloudTrail + GuardDuty
16. DNS cutover (sustainaura.eco → AWS)
17. Decommission old stack

## Critical IAM patterns

### App Runner needs to read secrets:
```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:secretsmanager:ap-south-1:*:secret:adazella/*"
}
```

### Lambda needs to read DB:
- Attach Lambda to private VPC subnet
- Security group allows outbound 5432 to RDS SG
- IAM role: AWSLambdaVPCAccessExecutionRole + custom secrets read

### Cognito → API token verification:
- API verifies JWTs against Cognito user pool's JWKS endpoint
- No DB lookup needed (faster than current Supabase pattern)

## Cost guardrails (CRITICAL — avoid surprise bills)

### Set on Day 1:
1. Billing alerts at $50, $100, $200
2. Budget action: stop non-prod resources at $200
3. AWS Budgets monthly limit

### Avoid these expensive defaults:
- ❌ NAT Gateway (~$35/mo each) — use VPC Endpoints instead
- ❌ Aurora Serverless v2 minimum 0.5 ACU ($43/mo) — use RDS db.t4g.micro for $13
- ❌ App Runner with always-on minimum instances >0
- ❌ CloudWatch Logs without retention policy (grows forever)
- ❌ Multi-region replication (expensive, only for big SaaS)

### Free tier (12 months):
- 750 hr/mo db.t3.micro RDS
- 1M Lambda requests
- 5GB S3 storage
- 100 GB CloudFront data transfer

## Provider-agnostic code patterns

We design code so swapping providers is a config change, not a rewrite.

### Auth abstraction (api/src/lib/auth-provider.ts — TODO)
```ts
interface AuthProvider {
  verifyToken(token: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
}

class SupabaseAuthProvider implements AuthProvider { ... }
class CognitoAuthProvider implements AuthProvider { ... }

export const authProvider = process.env.AUTH_PROVIDER === 'cognito'
  ? new CognitoAuthProvider()
  : new SupabaseAuthProvider();
```

### Secrets abstraction (api/src/lib/secrets.ts — TODO)
```ts
async function getSecret(name: string): Promise<string> {
  if (process.env.USE_AWS_SECRETS_MANAGER === 'true') {
    return getFromAWS(name);
  }
  return process.env[name] || '';
}
```

## Migration scripts

### Database export from Supabase:
```bash
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-acl \
  --exclude-schema=auth --exclude-schema=storage \
  > backup.sql
```

### Database import to RDS:
```bash
psql "$RDS_DB_URL" < backup.sql
```

### User export from Supabase Auth (custom script needed):
- Use Supabase Management API to fetch users
- Map to Cognito user pool format
- Bulk import via AWS CLI (`cognito-idp admin-create-user`)

## Useful AWS CLI commands

```bash
# Check billing
aws ce get-cost-and-usage --time-period Start=2026-04-01,End=2026-04-30 --granularity DAILY --metrics BlendedCost

# List secrets
aws secretsmanager list-secrets

# Check RDS status
aws rds describe-db-instances --db-instance-identifier adazella-db
```
