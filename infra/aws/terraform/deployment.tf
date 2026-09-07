data "aws_caller_identity" "current" {
  count = var.enable_ecr ? 1 : 0
}

resource "aws_s3_bucket" "codebuild_source" {
  count         = var.enable_ecr ? 1 : 0
  bucket        = "${local.name_prefix}-codebuild-source-${data.aws_caller_identity.current[0].account_id}"
  force_destroy = true

  tags = local.tags
}

resource "aws_s3_bucket_ownership_controls" "codebuild_source" {
  count  = var.enable_ecr ? 1 : 0
  bucket = aws_s3_bucket.codebuild_source[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "codebuild_source" {
  count  = var.enable_ecr ? 1 : 0
  bucket = aws_s3_bucket.codebuild_source[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "codebuild_source_bucket" {
  count = var.enable_ecr ? 1 : 0

  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"
    actions = [
      "s3:*"
    ]
    resources = [
      aws_s3_bucket.codebuild_source[0].arn,
      "${aws_s3_bucket.codebuild_source[0].arn}/*"
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "codebuild_source" {
  count  = var.enable_ecr ? 1 : 0
  bucket = aws_s3_bucket.codebuild_source[0].id
  policy = data.aws_iam_policy_document.codebuild_source_bucket[0].json

  depends_on = [aws_s3_bucket_public_access_block.codebuild_source]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "codebuild_source" {
  count  = var.enable_ecr ? 1 : 0
  bucket = aws_s3_bucket.codebuild_source[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "codebuild_source" {
  count  = var.enable_ecr ? 1 : 0
  bucket = aws_s3_bucket.codebuild_source[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "codebuild_source" {
  count  = var.enable_ecr ? 1 : 0
  bucket = aws_s3_bucket.codebuild_source[0].id

  rule {
    id     = "expire-deployment-sources"
    status = "Enabled"

    filter {
      prefix = "releases/"
    }

    expiration {
      days = 14
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

resource "aws_cloudwatch_log_group" "codebuild" {
  count             = var.enable_ecr ? 1 : 0
  name              = "/codebuild/${local.name_prefix}-app-deploy"
  retention_in_days = var.log_retention_days

  tags = local.tags
}

data "aws_iam_policy_document" "codebuild_assume" {
  count = var.enable_ecr ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codebuild" {
  count              = var.enable_ecr ? 1 : 0
  name               = "${local.name_prefix}-codebuild-role"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume[0].json

  tags = local.tags
}

data "aws_iam_policy_document" "codebuild" {
  count = var.enable_ecr ? 1 : 0

  statement {
    sid = "BuildLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["${aws_cloudwatch_log_group.codebuild[0].arn}:*"]
  }

  statement {
    sid = "SourceBucketMetadata"
    actions = [
      "s3:GetBucketAcl",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:ListBucket"
    ]
    resources = [aws_s3_bucket.codebuild_source[0].arn]
  }

  statement {
    sid = "SourceObjects"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion"
    ]
    resources = ["${aws_s3_bucket.codebuild_source[0].arn}/*"]
  }

  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart"
    ]
    resources = [
      aws_ecr_repository.frontend[0].arn,
      aws_ecr_repository.backend[0].arn
    ]
  }

  statement {
    sid = "EcsTaskDefinitions"
    actions = [
      "ecs:DescribeTaskDefinition",
      "ecs:RegisterTaskDefinition"
    ]
    resources = ["*"]
  }

  statement {
    sid = "EcsServices"
    actions = [
      "ecs:DescribeServices",
      "ecs:UpdateService"
    ]
    resources = [
      aws_ecs_service.frontend.id,
      aws_ecs_service.backend.id
    ]
  }

  statement {
    sid     = "PassEcsRoles"
    actions = ["iam:PassRole"]
    resources = [
      aws_iam_role.execution.arn,
      aws_iam_role.task.arn
    ]
  }
}

resource "aws_iam_role_policy" "codebuild" {
  count  = var.enable_ecr ? 1 : 0
  name   = "${local.name_prefix}-codebuild-deploy"
  role   = aws_iam_role.codebuild[0].id
  policy = data.aws_iam_policy_document.codebuild[0].json
}

resource "aws_codebuild_project" "app_deploy" {
  count                  = var.enable_ecr ? 1 : 0
  name                   = "${local.name_prefix}-app-deploy"
  description            = "Build Security Portal images in AWS and deploy them to ECS."
  service_role           = aws_iam_role.codebuild[0].arn
  build_timeout          = 60
  queued_timeout         = 60
  concurrent_build_limit = 1

  artifacts {
    type = "NO_ARTIFACTS"
  }

  cache {
    type  = "LOCAL"
    modes = ["LOCAL_DOCKER_LAYER_CACHE", "LOCAL_SOURCE_CACHE"]
  }

  environment {
    compute_type                = "BUILD_GENERAL1_MEDIUM"
    image                       = "aws/codebuild/amazonlinux-aarch64-standard:4.0"
    type                        = "ARM_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = true

    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = var.aws_region
    }

    environment_variable {
      name  = "FRONTEND_REPOSITORY_URI"
      value = aws_ecr_repository.frontend[0].repository_url
    }

    environment_variable {
      name  = "BACKEND_REPOSITORY_URI"
      value = aws_ecr_repository.backend[0].repository_url
    }

    environment_variable {
      name  = "ECS_CLUSTER"
      value = aws_ecs_cluster.this.name
    }

    environment_variable {
      name  = "ECS_FRONTEND_SERVICE"
      value = aws_ecs_service.frontend.name
    }

    environment_variable {
      name  = "ECS_BACKEND_SERVICE"
      value = aws_ecs_service.backend.name
    }

    environment_variable {
      name  = "ECS_FRONTEND_TASK_FAMILY"
      value = aws_ecs_task_definition.frontend.family
    }

    environment_variable {
      name  = "ECS_BACKEND_TASK_FAMILY"
      value = aws_ecs_task_definition.backend.family
    }

    environment_variable {
      name  = "PORTAL_URL"
      value = "http://${aws_lb.this.dns_name}"
    }

    environment_variable {
      name  = "DEPLOY_FRONTEND"
      value = "true"
    }

    environment_variable {
      name  = "DEPLOY_BACKEND"
      value = "true"
    }

    environment_variable {
      name  = "DOCKER_BUILDKIT"
      value = "1"
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = aws_cloudwatch_log_group.codebuild[0].name
      stream_name = "deploy"
    }
  }

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.codebuild_source[0].bucket}/bootstrap/source.zip"
    buildspec = "buildspec.aws.yml"
  }

  tags = local.tags

  depends_on = [aws_iam_role_policy.codebuild]
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  count      = var.enable_ecr ? 1 : 0
  repository = aws_ecr_repository.frontend[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the newest 30 frontend images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 30
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "backend" {
  count      = var.enable_ecr ? 1 : 0
  repository = aws_ecr_repository.backend[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the newest 30 backend images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 30
      }
      action = { type = "expire" }
    }]
  })
}
