output "alb_dns_name" {
  description = "Portal ALB DNS name."
  value       = aws_lb.this.dns_name
}

output "portal_url" {
  description = "Portal HTTP URL."
  value       = "http://${aws_lb.this.dns_name}"
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "frontend_ecr_repository_url" {
  description = "Frontend ECR repository URL."
  value       = try(aws_ecr_repository.frontend[0].repository_url, null)
}

output "backend_ecr_repository_url" {
  description = "Backend ECR repository URL."
  value       = try(aws_ecr_repository.backend[0].repository_url, null)
}

output "codebuild_deploy_project_name" {
  description = "CodeBuild project that builds images and deploys them to ECS."
  value       = try(aws_codebuild_project.app_deploy[0].name, null)
}

output "codebuild_source_bucket" {
  description = "Encrypted S3 bucket used for CodeBuild source archives."
  value       = try(aws_s3_bucket.codebuild_source[0].bucket, null)
}

output "database_secret_arn" {
  description = "Secrets Manager ARN containing backend DATABASE_URL."
  value       = aws_secretsmanager_secret.database_url.arn
}

output "ollama_instance_id" {
  description = "Private GPU instance running Ollama."
  value       = try(aws_instance.ollama[0].id, null)
}

output "ollama_private_ip" {
  description = "Private Ollama instance IP used by the backend task definition."
  value       = try(aws_instance.ollama[0].private_ip, null)
}

output "ollama_model" {
  description = "Ollama model configured for Plugin Factory chat."
  value       = var.enable_ollama ? var.ollama_model : null
}

output "ollama_api_secret_arn" {
  description = "Secrets Manager ARN containing the private Ollama bearer token."
  value       = try(aws_secretsmanager_secret.ollama_api_token[0].arn, null)
}

output "vault_internal_endpoint" {
  description = "Private NLB endpoint used by the backend for real Vault traffic."
  value       = try("http://${aws_lb.vault[0].dns_name}:${var.vault_internal_port}", null)
}

output "vault_approle_secret_arns" {
  description = "Secrets Manager containers that must be populated before enabling the real Vault runtime."
  value       = { for key, secret in aws_secretsmanager_secret.vault_approle : key => secret.arn }
}

output "factory_build_project_name" {
  description = "Isolated CodeBuild project used by the Plugin Factory repair loop."
  value       = try(aws_codebuild_project.factory_plugin[0].name, null)
}

output "factory_artifact_bucket" {
  description = "Encrypted S3 bucket containing Factory build inputs, diagnostics, and verified binaries."
  value       = try(aws_s3_bucket.factory_artifacts[0].bucket, null)
}
