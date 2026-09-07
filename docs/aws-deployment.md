# AWS Deployment

The Phase 1 AWS test environment creates new AWS resources and does not modify the existing HashiCorp lab environment.

## Default Resources

- VPC
- public subnets
- private subnets
- NAT gateway
- ALB
- ECS cluster
- frontend ECS service
- backend ECS service
- RDS PostgreSQL
- CloudWatch log groups
- IAM roles
- optional ECR repositories
- encrypted S3 deployment source bucket
- ARM64 CodeBuild deployment project

## Deployment Flow

1. Initialize and apply Terraform.
2. Run `pnpm deploy:aws` from the project root.
3. The command creates a filtered source ZIP and uploads it to the encrypted S3 source bucket.
4. CodeBuild runs type checks, tests, and linting.
5. CodeBuild builds native ARM64 images and pushes unique tags plus `latest` to ECR.
6. CodeBuild registers new ECS task definition revisions and starts rolling deployments.
7. ECS deployment circuit breakers roll back unhealthy revisions automatically.
8. CodeBuild waits for stable services and checks the portal, backend, and LLM health endpoints.

Local Docker is not used by this flow. The temporary local ZIP excludes dependencies, build output, environment files, Terraform state, and tfvars, and is deleted after upload.

```bash
pnpm deploy:aws
pnpm deploy:aws --frontend-only
pnpm deploy:aws --backend-only
```

The command uses the standard AWS SDK credential chain. Set `AWS_PROFILE`, or export temporary `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` values before running it.

## Existing Network Mode

Set:

```hcl
create_new_network = false
vpc_id             = "vpc-..."
public_subnet_ids  = ["subnet-...", "subnet-..."]
private_subnet_ids = ["subnet-...", "subnet-..."]
```

## Current Credential Requirement

The AWS role used to deploy this stack needs at least permissions for:

- EC2 VPC, subnet, route table, NAT, security group, and ALB networking operations
- ECS cluster, task definition, and service operations
- ECR repository and authorization token operations
- RDS instance and subnet group operations
- CloudWatch Logs operations
- IAM role and policy operations for ECS task execution
- Secrets Manager operations
- S3 deployment source upload operations
- CodeBuild project creation and build execution operations

The identity that starts a release needs `s3:PutObject` for the deployment source bucket and `codebuild:StartBuild` plus `codebuild:BatchGetBuilds` for the deployment project. The CodeBuild service role has a separate least-privilege policy for source download, ECR image push, ECS task registration, service updates, and passing the existing ECS roles.
