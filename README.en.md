# Vault Security Portal

[한국어](README.md) · [English](README.en.md)

## Purpose

A web portal for practicing policy-based self-service across the request, approval, issuance, and revocation of HashiCorp Vault-backed credentials.

## Benefits

- Connect user requests, approval decisions, and execution results in one workflow.
- Practice credential lifecycle management using active-credential and audit views.
- Evaluate the workflow in mock mode before configuring a real Vault adapter.

## Features and structure

- Next.js frontend, Node.js/Express BFF, and PostgreSQL metadata store
- Request → approval → execution → active credentials → revocation → audit
- Developer, approver, administrator, and auditor roles with mock login
- Vault adapters, inventory, Plugin Factory, and build/distribution support
- `infra/aws/terraform/`: ECS Fargate, RDS, ALB, ECR, and CodeBuild infrastructure

## Getting started

Install Node.js and the pnpm version specified in `package.json`. Local Docker mode uses mock Vault.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
docker compose up --build
```

Open `http://localhost:3000`. Submit a request as `developer@example.com`, approve it as `approver@example.com`, then inspect execution, revocation, and audit records. Additional example users are `admin@example.com` and `auditor@example.com`.

## Documentation

- [Local development](docs/local-development.md)
- [Architecture](docs/architecture.md)
- [Real Vault integration](docs/real-vault-integration.md)
- [AWS deployment](docs/aws-deployment.md)
- [Security model](docs/security-model.md)

## Scope and limitations

Authentication and Vault behavior default to mock mode. Real integrations require TLS, least-privilege authentication such as AppRole, and review of product APIs and licensing. Never use a Vault root token in the application. `pnpm deploy:aws` changes AWS services and incurs cloud costs.
