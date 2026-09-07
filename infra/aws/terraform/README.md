# AWS Terraform - Portal Test Environment

This Terraform stack is intentionally separate from the existing HashiCorp lab under `envs/dev`.

Default deployment path:

- dedicated VPC
- public/private subnets
- optional NAT gateway
- ALB
- ECS Fargate frontend and backend services
- RDS PostgreSQL
- CloudWatch log groups
- optional ECR repositories
- encrypted CodeBuild source bucket
- native ARM64 CodeBuild deployment project

The stack supports both mock Vault and a private real-Vault integration. Real mode adds VPC peering, an internal Vault NLB, isolated plugin builds, checksum-verified SSM distribution, and separate runtime and plugin-deployer AppRoles.

## Deployment Sequence

Apply the infrastructure first:

```bash
terraform init
terraform apply
```

Then run the application release from the project root:

```bash
pnpm deploy:aws
```

The local command only packages and uploads filtered source code. AWS CodeBuild performs tests, ARM64 Docker builds, ECR pushes, ECS rolling updates, stability waits, and HTTP health checks. Local Docker is not required.

Terraform intentionally ignores the ECS service `task_definition` field after bootstrap because CodeBuild owns application revision deployment. Task definition settings remain defined in Terraform, and CodeBuild clones the latest active family revision before replacing the image and build marker.

## Real Vault Integration

Use two applies so ECS never starts with empty AppRole secrets:

1. Set `provision_real_vault_integration = true` and keep `enable_real_vault_runtime = false`.
2. Apply Terraform to create private networking, the internal NLB, the Factory artifact bucket, CodeBuild, IAM policies, and four empty Secrets Manager containers.
3. Apply the policies under `infra/vault/policies/`, create the runtime and plugin-deployer AppRoles, and populate the four secret containers outside Terraform.
4. Set `enable_real_vault_runtime = true`, apply again, and deploy the backend image.

Plugin Factory mounts are restricted to `vault_plugin_allowed_mount_prefix`. The isolated CodeBuild worker receives no Vault address, token, RoleID, or SecretID. It can only read a generated source archive and write diagnostics plus the ARM64 binary. The backend verifies the binary SHA-256, and SSM installs it with Vault ownership on every configured node before catalog registration.

## Existing Network Mode

Use existing AWS networking without touching the current HashiCorp lab modules:

```hcl
create_new_network = false
vpc_id             = "vpc-..."
public_subnet_ids  = ["subnet-...", "subnet-..."]
private_subnet_ids = ["subnet-...", "subnet-..."]
```

## Security Notes

- Do not put real Vault root tokens in Terraform variables.
- Do not manage AppRole RoleIDs or SecretIDs as Terraform secret versions; doing so stores them in state.
- `DATABASE_URL` is stored in AWS Secrets Manager for the backend runtime.
- Issued Vault credentials must not be stored in AWS Secrets Manager or SSM Parameter Store.
- Terraform state can contain generated database passwords and must be encrypted and access-controlled.
- Vault audit logs remain separate from portal workflow audit logs.
