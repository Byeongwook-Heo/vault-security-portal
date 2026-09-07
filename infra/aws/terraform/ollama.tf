resource "random_password" "ollama_api_token" {
  count   = var.enable_ollama ? 1 : 0
  length  = 48
  special = false

  keepers = {
    rotation = "2026-07-10b"
  }
}

resource "aws_secretsmanager_secret" "ollama_api_token" {
  count                   = var.enable_ollama ? 1 : 0
  name                    = "${local.name_prefix}/ollama-api-token"
  recovery_window_in_days = 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "ollama_api_token" {
  count         = var.enable_ollama ? 1 : 0
  secret_id     = aws_secretsmanager_secret.ollama_api_token[0].id
  secret_string = random_password.ollama_api_token[0].result
}

resource "aws_security_group" "ollama" {
  count       = var.enable_ollama ? 1 : 0
  name        = "${local.name_prefix}-ollama-sg"
  description = "Private Ollama API reachable only from portal ECS tasks"
  vpc_id      = local.vpc_id

  ingress {
    description     = "Authenticated Ollama API from portal backend"
    from_port       = var.ollama_api_port
    to_port         = var.ollama_api_port
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    description = "Package, model, SSM, and AWS API access through NAT"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-ollama-sg"
  })
}

data "aws_iam_policy_document" "ollama_assume" {
  count = var.enable_ollama ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ollama" {
  count              = var.enable_ollama ? 1 : 0
  name               = "${local.name_prefix}-ollama-role"
  assume_role_policy = data.aws_iam_policy_document.ollama_assume[0].json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "ollama_ssm" {
  count      = var.enable_ollama ? 1 : 0
  role       = aws_iam_role.ollama[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "ollama_secret" {
  count = var.enable_ollama ? 1 : 0

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.ollama_api_token[0].arn]
  }
}

resource "aws_iam_role_policy" "ollama_secret" {
  count  = var.enable_ollama ? 1 : 0
  name   = "${local.name_prefix}-ollama-secret-read"
  role   = aws_iam_role.ollama[0].id
  policy = data.aws_iam_policy_document.ollama_secret[0].json
}

resource "aws_iam_instance_profile" "ollama" {
  count = var.enable_ollama ? 1 : 0
  name  = "${local.name_prefix}-ollama-profile"
  role  = aws_iam_role.ollama[0].name
  tags  = local.tags
}

resource "aws_instance" "ollama" {
  count                       = var.enable_ollama ? 1 : 0
  ami                         = var.ollama_ami_id
  instance_type               = var.ollama_instance_type
  subnet_id                   = local.private_subnet_ids[var.ollama_subnet_index]
  vpc_security_group_ids      = [aws_security_group.ollama[0].id]
  iam_instance_profile        = aws_iam_instance_profile.ollama[0].name
  associate_public_ip_address = false
  monitoring                  = true
  source_dest_check           = true
  user_data_replace_on_change = false
  user_data = templatefile("${path.module}/templates/ollama-user-data.sh.tftpl", {
    aws_region           = var.aws_region
    ollama_api_port      = var.ollama_api_port
    ollama_internal_port = var.ollama_internal_port
    ollama_model         = var.ollama_model
    token_secret_arn     = aws_secretsmanager_secret.ollama_api_token[0].arn
  })

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    delete_on_termination = true
    encrypted             = true
    volume_size           = var.ollama_root_volume_size
    volume_type           = "gp3"
  }

  lifecycle {
    precondition {
      condition     = var.ollama_subnet_index >= 0 && var.ollama_subnet_index < length(local.private_subnet_ids)
      error_message = "ollama_subnet_index must select an existing private subnet."
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.ollama_ssm,
    aws_iam_role_policy.ollama_secret,
    aws_route.private_default,
    aws_secretsmanager_secret_version.ollama_api_token
  ]

  tags = merge(local.tags, {
    Name      = "${local.name_prefix}-ollama"
    Component = "llm-inference"
    Model     = var.ollama_model
  })
}
