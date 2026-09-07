# Vault Security Portal

Vault 기반 보안 셀프서비스 포털입니다. 기존 `vault-portal-ui-refresh`와 `factory-productivity-suite`의 최신 확장 기능을 한 저장소에서 관리합니다. 승인·실행·폐기·감사와 Plugin Factory 관련 코드가 포함됩니다.

독립 프로젝트의 기준 브랜치는 `main`입니다. Enterprise AWS Lab 인프라는 [별도 저장소](https://github.com/Byeongwook-Heo/hashicorp-enterprise-aws-lab)에서 관리합니다. 기존 운영 주소는 공개용 예시로 바뀌었으며 실제 배포 대상은 환경 변수로 지정해야 합니다.

Production-oriented MVP for an enterprise security self-service portal backed by HashiCorp Vault.

This repository contains the former `security-portal/` subtree at its root. It does not modify the separate HashiCorp Enterprise AWS Lab environment. The original phase notes below describe the initial MVP; later integration and factory source is included in this consolidated snapshot.

## Phase 1 Scope

- Next.js frontend
- Node.js/Express backend BFF
- PostgreSQL metadata store
- Mock Vault adapter
- Mock login
- GitLab token request happy path
- Approval, execution, revoke, and audit flow
- AWS ECS Fargate Terraform for a new test environment

Phase 1 intentionally does not connect to the existing Vault cluster. Real Vault integration is prepared through adapter interfaces and belongs to Phase 2.

## Local Development

```bash
pnpm install
pnpm build
pnpm test
```

With Docker running:

```bash
docker compose up --build
```

Open:

```text
http://localhost:3000
```

Mock users:

- `developer@example.com`
- `approver@example.com`
- `admin@example.com`
- `auditor@example.com`

## Happy Path

1. Login as `developer@example.com`.
2. Open Secret Request.
3. Submit a GitLab token request for `TANGO-EC`.
4. Login as `approver@example.com`.
5. Approve the request.
6. Execute the request.
7. Check Active Credentials.
8. Revoke the credential.
9. Check Audit Reports.

## AWS Test Environment

Terraform is in:

```text
infra/aws/terraform
```

Default mode creates a new test VPC and deploys ECS/RDS/ALB infrastructure. It does not touch the existing lab VPC or Vault instances.

```bash
cd infra/aws/terraform
terraform init
terraform plan
terraform apply
```

Application images are built and deployed inside AWS CodeBuild. Local Docker is not required:

```bash
cd ../../..
pnpm deploy:aws
```

Use `pnpm deploy:aws --frontend-only` or `pnpm deploy:aws --backend-only` for a single service. The command uploads a filtered source archive to the encrypted deployment bucket; CodeBuild runs tests, builds ARM64 images, pushes them to ECR, updates ECS, waits for service stability, and checks the portal health endpoints.

## Vault Mode

Default:

```text
VAULT_MODE=mock
```

Phase 2 can switch to:

```text
VAULT_MODE=real
VAULT_ADDR=http://<private-vault-endpoint>:8200
VAULT_NAMESPACE=<namespace>
```

Do not use a Vault root token in application runtime. Use a tightly scoped service token, AppRole, AWS IAM auth, or user token pass-through depending on the operating model.

Real Vault integration details are in [docs/real-vault-integration.md](docs/real-vault-integration.md).
