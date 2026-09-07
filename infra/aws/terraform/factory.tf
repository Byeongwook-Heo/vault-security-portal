data "aws_caller_identity" "factory" {
  count = var.provision_real_vault_integration ? 1 : 0
}

data "aws_partition" "current" {}

check "real_vault_integration_inputs" {
  assert {
    condition = !var.provision_real_vault_integration || (
      var.vault_vpc_id != "" &&
      var.vault_vpc_cidr != "" &&
      var.vault_security_group_id != "" &&
      var.vault_node_iam_role_name != "" &&
      length(var.vault_subnet_ids) >= 2 &&
      length(var.vault_route_table_ids) >= 1 &&
      length(var.vault_instance_ids) >= 1 &&
      length(local.private_route_table_ids) >= 1
    )
    error_message = "Real Vault provisioning requires the Vault VPC, CIDR, subnets, route tables, security group, node role, instances, and portal private route tables."
  }

  assert {
    condition     = !var.enable_real_vault_runtime || var.provision_real_vault_integration
    error_message = "enable_real_vault_runtime requires provision_real_vault_integration=true."
  }
}

resource "aws_vpc_peering_connection" "vault" {
  count       = var.provision_real_vault_integration ? 1 : 0
  vpc_id      = local.vpc_id
  peer_vpc_id = var.vault_vpc_id
  auto_accept = true

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-to-vault"
  })
}

resource "aws_route" "portal_to_vault" {
  for_each                  = var.provision_real_vault_integration ? toset(local.private_route_table_ids) : toset([])
  route_table_id            = each.value
  destination_cidr_block    = var.vault_vpc_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.vault[0].id
}

resource "aws_route" "vault_to_portal" {
  for_each                  = var.provision_real_vault_integration ? toset(var.vault_route_table_ids) : toset([])
  route_table_id            = each.value
  destination_cidr_block    = var.vpc_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.vault[0].id
}

resource "aws_vpc_security_group_ingress_rule" "vault_api_from_portal" {
  count             = var.provision_real_vault_integration ? 1 : 0
  security_group_id = var.vault_security_group_id
  description       = "Vault API from Security Portal private VPC"
  cidr_ipv4         = var.vpc_cidr
  from_port         = var.vault_internal_port
  to_port           = var.vault_internal_port
  ip_protocol       = "tcp"

  tags = local.tags
}

resource "aws_lb" "vault" {
  count                            = var.provision_real_vault_integration ? 1 : 0
  name                             = "${local.name_prefix}-vault-nlb"
  internal                         = true
  load_balancer_type               = "network"
  subnets                          = var.vault_subnet_ids
  enable_cross_zone_load_balancing = true

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-vault-nlb"
  })
}

resource "aws_lb_target_group" "vault" {
  count       = var.provision_real_vault_integration ? 1 : 0
  name        = "${local.name_prefix}-vault-tg"
  port        = var.vault_internal_port
  protocol    = "TCP"
  vpc_id      = var.vault_vpc_id
  target_type = "instance"

  health_check {
    enabled             = true
    protocol            = "HTTP"
    path                = "/v1/sys/health"
    port                = "traffic-port"
    matcher             = "200-499"
    interval            = 10
    timeout             = 6
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.tags
}

resource "aws_lb_target_group_attachment" "vault" {
  for_each         = var.provision_real_vault_integration ? toset(var.vault_instance_ids) : toset([])
  target_group_arn = aws_lb_target_group.vault[0].arn
  target_id        = each.value
  port             = var.vault_internal_port
}

resource "aws_lb_listener" "vault" {
  count             = var.provision_real_vault_integration ? 1 : 0
  load_balancer_arn = aws_lb.vault[0].arn
  port              = var.vault_internal_port
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.vault[0].arn
  }
}

resource "aws_secretsmanager_secret" "vault_approle" {
  for_each = var.provision_real_vault_integration ? local.managed_vault_secret_definitions : {}

  name                    = "${local.name_prefix}/vault/${each.value.name}"
  description             = "Managed AppRole material for the Security Portal Vault integration."
  recovery_window_in_days = 7

  tags = merge(local.tags, {
    CredentialScope = startswith(each.key, "plugin_") ? "plugin-deployer" : "runtime"
  })
}

resource "aws_s3_bucket" "factory_artifacts" {
  count         = var.provision_real_vault_integration ? 1 : 0
  bucket        = "${local.name_prefix}-factory-artifacts-${data.aws_caller_identity.factory[0].account_id}"
  force_destroy = true

  tags = local.tags
}

resource "aws_s3_bucket_ownership_controls" "factory_artifacts" {
  count  = var.provision_real_vault_integration ? 1 : 0
  bucket = aws_s3_bucket.factory_artifacts[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "factory_artifacts" {
  count  = var.provision_real_vault_integration ? 1 : 0
  bucket = aws_s3_bucket.factory_artifacts[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "factory_artifacts" {
  count  = var.provision_real_vault_integration ? 1 : 0
  bucket = aws_s3_bucket.factory_artifacts[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "factory_artifacts" {
  count  = var.provision_real_vault_integration ? 1 : 0
  bucket = aws_s3_bucket.factory_artifacts[0].id

  rule {
    id     = "expire-factory-runs"
    status = "Enabled"

    filter {
      prefix = "factory-builds/"
    }

    expiration {
      days = 30
    }
  }
}

data "aws_iam_policy_document" "factory_artifacts_bucket" {
  count = var.provision_real_vault_integration ? 1 : 0

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.factory_artifacts[0].arn,
      "${aws_s3_bucket.factory_artifacts[0].arn}/*"
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

resource "aws_s3_bucket_policy" "factory_artifacts" {
  count  = var.provision_real_vault_integration ? 1 : 0
  bucket = aws_s3_bucket.factory_artifacts[0].id
  policy = data.aws_iam_policy_document.factory_artifacts_bucket[0].json

  depends_on = [aws_s3_bucket_public_access_block.factory_artifacts]
}

resource "aws_cloudwatch_log_group" "factory_build" {
  count             = var.provision_real_vault_integration ? 1 : 0
  name              = "/codebuild/${local.name_prefix}-plugin-factory"
  retention_in_days = var.log_retention_days

  tags = local.tags
}

data "aws_iam_policy_document" "factory_codebuild_assume" {
  count = var.provision_real_vault_integration ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "factory_codebuild" {
  count              = var.provision_real_vault_integration ? 1 : 0
  name               = "${local.name_prefix}-factory-codebuild"
  assume_role_policy = data.aws_iam_policy_document.factory_codebuild_assume[0].json

  tags = local.tags
}

data "aws_iam_policy_document" "factory_codebuild" {
  count = var.provision_real_vault_integration ? 1 : 0

  statement {
    sid = "BuildLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["${aws_cloudwatch_log_group.factory_build[0].arn}:*"]
  }

  statement {
    sid = "FactoryBucketMetadata"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket"
    ]
    resources = [aws_s3_bucket.factory_artifacts[0].arn]
  }

  statement {
    sid = "FactoryObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.factory_artifacts[0].arn}/factory-builds/*"]
  }
}

resource "aws_iam_role_policy" "factory_codebuild" {
  count  = var.provision_real_vault_integration ? 1 : 0
  name   = "${local.name_prefix}-factory-build"
  role   = aws_iam_role.factory_codebuild[0].id
  policy = data.aws_iam_policy_document.factory_codebuild[0].json
}

resource "aws_codebuild_project" "factory_plugin" {
  count                  = var.provision_real_vault_integration ? 1 : 0
  name                   = "${local.name_prefix}-plugin-factory"
  description            = "Credential-free isolated Go build runner for Vault custom plugins."
  service_role           = aws_iam_role.factory_codebuild[0].arn
  build_timeout          = 15
  queued_timeout         = 15
  concurrent_build_limit = 2

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = false
  }

  logs_config {
    cloudwatch_logs {
      group_name  = aws_cloudwatch_log_group.factory_build[0].name
      stream_name = "build"
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = <<-BUILDSPEC
      version: 0.2
      phases:
        install:
          runtime-versions:
            golang: 1.22
        build:
          commands:
            - |
              set +e
              WORK_DIR=/tmp/factory-source
              SOURCE_ZIP=/tmp/factory-source.zip
              BINARY=/tmp/$FACTORY_COMMAND
              LOG=/tmp/factory-build.log
              RESULT=/tmp/factory-result.json
              STATUS=pass
              FORMAT_STATUS=skipped
              TIDY_STATUS=skipped
              TEST_STATUS=skipped
              BUILD_STATUS=skipped
              SHA256=""
              rm -rf "$WORK_DIR" "$SOURCE_ZIP" "$BINARY" "$LOG" "$RESULT"
              mkdir -p "$WORK_DIR"
              : > "$LOG"

              if aws s3 cp "s3://$FACTORY_BUCKET/$FACTORY_SOURCE_KEY" "$SOURCE_ZIP" --only-show-errors >>"$LOG" 2>&1 && unzip -q "$SOURCE_ZIP" -d "$WORK_DIR" >>"$LOG" 2>&1; then
                cd "$WORK_DIR" || STATUS=fail

                if find . -type f -name '*.go' -print0 | xargs -0 -r gofmt -w >>"$LOG" 2>&1; then
                  FORMAT_STATUS=pass
                else
                  FORMAT_STATUS=fail
                  STATUS=fail
                fi

                if go mod tidy >>"$LOG" 2>&1; then
                  TIDY_STATUS=pass
                else
                  TIDY_STATUS=fail
                  STATUS=fail
                fi

                if go test ./... >>"$LOG" 2>&1; then
                  TEST_STATUS=pass
                else
                  TEST_STATUS=fail
                  STATUS=fail
                fi

                if GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -o "$BINARY" "./cmd/$FACTORY_PLUGIN_NAME" >>"$LOG" 2>&1; then
                  BUILD_STATUS=pass
                  SHA256=$(sha256sum "$BINARY" | awk '{print $1}')
                else
                  BUILD_STATUS=fail
                  STATUS=fail
                fi

                if [ "$STATUS" = pass ]; then
                  if ! aws s3 cp "$BINARY" "s3://$FACTORY_BUCKET/$FACTORY_ARTIFACT_KEY" --only-show-errors >>"$LOG" 2>&1; then
                    BUILD_STATUS=fail
                    STATUS=fail
                    SHA256=""
                  fi
                fi
              else
                STATUS=fail
              fi

              DIAGNOSTICS=$(tail -c 16000 "$LOG" | base64 -w 0)
              jq -n \
                --arg status "$STATUS" \
                --arg diagnostics_base64 "$DIAGNOSTICS" \
                --arg sha256 "$SHA256" \
                --arg format_status "$FORMAT_STATUS" \
                --arg tidy_status "$TIDY_STATUS" \
                --arg test_status "$TEST_STATUS" \
                --arg build_status "$BUILD_STATUS" \
                '{status: $status, diagnostics_base64: $diagnostics_base64, sha256: $sha256, format_status: $format_status, tidy_status: $tidy_status, test_status: $test_status, build_status: $build_status}' > "$RESULT"
              aws s3 cp "$RESULT" "s3://$FACTORY_BUCKET/$FACTORY_RESULT_KEY" --only-show-errors
              exit 0
    BUILDSPEC
  }

  tags = local.tags

  depends_on = [aws_iam_role_policy.factory_codebuild]
}

data "aws_iam_policy_document" "factory_task" {
  count = var.provision_real_vault_integration ? 1 : 0

  statement {
    sid       = "StartFactoryBuild"
    actions   = ["codebuild:StartBuild"]
    resources = [aws_codebuild_project.factory_plugin[0].arn]
  }

  statement {
    sid       = "ReadFactoryBuild"
    actions   = ["codebuild:BatchGetBuilds"]
    resources = ["*"]
  }

  statement {
    sid = "FactoryBucketMetadata"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket"
    ]
    resources = [aws_s3_bucket.factory_artifacts[0].arn]
  }

  statement {
    sid = "FactoryObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.factory_artifacts[0].arn}/factory-builds/*"]
  }

  statement {
    sid     = "DistributePluginWithSsm"
    actions = ["ssm:SendCommand"]
    resources = concat(
      ["arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}::document/AWS-RunShellScript"],
      [for instance_id in var.vault_instance_ids : "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.factory[0].account_id}:instance/${instance_id}"]
    )
  }

  statement {
    sid       = "ReadPluginDistribution"
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "factory_task" {
  count  = var.provision_real_vault_integration ? 1 : 0
  name   = "${local.name_prefix}-plugin-factory"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.factory_task[0].json
}

data "aws_iam_policy_document" "vault_node_factory_artifacts" {
  count = var.provision_real_vault_integration && var.vault_node_iam_role_name != "" ? 1 : 0

  statement {
    sid = "FactoryBucketMetadata"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket"
    ]
    resources = [aws_s3_bucket.factory_artifacts[0].arn]
  }

  statement {
    sid       = "ReadVerifiedFactoryArtifacts"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.factory_artifacts[0].arn}/factory-builds/*/artifact/*"]
  }
}

resource "aws_iam_role_policy" "vault_node_factory_artifacts" {
  count  = var.provision_real_vault_integration && var.vault_node_iam_role_name != "" ? 1 : 0
  name   = "${local.name_prefix}-factory-artifacts"
  role   = var.vault_node_iam_role_name
  policy = data.aws_iam_policy_document.vault_node_factory_artifacts[0].json
}
