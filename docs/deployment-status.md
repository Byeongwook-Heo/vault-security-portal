# Deployment Status

Date: 2026-07-10

## Current Status

The isolated AWS test environment for the Security Portal is deployed and reachable.

- Environment: `security-portal-test`
- Region: `ap-northeast-2`
- Portal URL: `http://service.example.invalid`
- ECS cluster: `security-portal-test-cluster`
- Frontend service: `security-portal-test-frontend`
- Backend service: `security-portal-test-backend`
- Frontend ECR repository: `security-portal-test-frontend`
- Backend ECR repository: `security-portal-test-backend`
- CodeBuild deployment project: `security-portal-test-app-deploy`
- CodeBuild source bucket: `security-portal-test-codebuild-source-123456789012`
- Database: private RDS PostgreSQL
- Runtime database URL: stored in AWS Secrets Manager
- Plugin Factory assistant: private Ollama GPU service
- Ollama instance: `i-00000000000000000` (`g6.xlarge`, NVIDIA L4)
- Ollama model: `qwen3:8b`
- Ollama access token: stored in AWS Secrets Manager

## Verified

```bash
pnpm test
pnpm lint
pnpm typecheck
terraform fmt -recursive
terraform validate
terraform apply
pnpm deploy:aws
```

The first AWS-native release completed successfully in ARM CodeBuild and deployed image tag `codebuild-1` to frontend task revision `21` and backend task revision `14`. Terraform reported no changes after the release, and local Docker storage remained at `0B`.

Runtime checks:

```text
GET / -> HTTP 200
GET /health -> {"ok":true,"service":"security-portal-backend"}
POST /auth/mock-login -> developer@example.com login succeeded
GET /auth/me -> developer@example.com session returned
GET /systems -> 3 systems returned
GET /health/llm -> Ollama and qwen3:8b ready
POST /plugin-factory/chat -> Korean and English conversations succeeded
POST /plugin-factory/chat -> exact 52-template catalog returned
Browser console -> 0 warnings and 0 errors after CodeBuild deployment
```

GPU runtime checks:

```text
EC2 status checks -> 2/2 passed
NVIDIA GPU -> L4, driver 610.43.02, 23034 MiB
Ollama -> 0.31.2, qwen3:8b loaded
Ollama proxy without token -> HTTP 401
Ollama proxy with ECS token -> HTTP 200
Warm chat latency -> approximately 1-5 seconds in the validated scenarios
```

## Deployment Notes

- ECS task definitions are set to `ARM64` to match the pushed container images.
- Application tests, Docker builds, ECR pushes, ECS updates, stability waits, and health checks now run in AWS CodeBuild.
- Local deployment only creates a filtered source ZIP, uploads it to the encrypted S3 source bucket, and deletes the temporary file.
- Source archives exclude dependencies, build output, environment files, tfvars, and Terraform state; the validated release contained zero forbidden entries.
- ECS deployment circuit breakers automatically roll back unhealthy frontend or backend revisions.
- ECR lifecycle policies retain the newest 30 images per repository.
- RDS requires encrypted PostgreSQL connections, so the backend uses SSL for `sslmode=require`.
- PostgreSQL JSONB values are serialized before insert to avoid invalid JSON input errors.
- The frontend calls backend APIs through the same ALB host.
- Browser page routes stay on frontend paths such as `/systems`, `/requests`, `/credentials`, and `/admin`.
- Backend APIs are routed under `/api/...` to avoid collisions with frontend page routes.
- The backend currently runs in mock Vault mode.
- Ollama listens on loopback port `11435`; Nginx exposes authenticated port `11434` only to the ECS security group.
- The portal automatically uses the deterministic rules fallback when Ollama is disabled or unavailable.
- The `g6.xlarge` instance is billable while running. Stopping it removes instance compute charges, while attached EBS storage continues to incur charges.
- See `docs/ollama-deployment.md` for topology, operations, and recovery checks.

## Local Fixes Made During Deployment

- Split ALB backend path rules to stay under the AWS listener rule condition value limit.
- Changed default PostgreSQL engine version to `16.14`, which is available in `ap-northeast-2`.
- Added an empty frontend `public` directory marker so the Docker image build can copy the path consistently.
- Replaced local Docker build and ECR login steps with AWS CodeBuild.
- Moved same-host backend calls to `/api/...` because frontend pages and backend API endpoints shared names.
- Excluded workspace `node_modules`, build output, local environment files, and Terraform state from Docker build contexts.
- Replaced the Ollama CLI model bootstrap with the HTTP pull API so cloud-init does not depend on a login-shell `HOME` value.
- Added an authenticated Nginx proxy and removed shell tracing from bootstrap paths that handle the bearer token.
- Increased the ALB idle timeout and capped model output to keep conversational requests within the proxy window.
- Added deterministic action validation so comparison and explanation questions cannot accidentally trigger catalog or apply actions.

## Test Users

- `developer@example.com`
- `approver@example.com`
- `admin@example.com`
- `auditor@example.com`
