locals {
  name_prefix             = "${var.project_name}-${var.environment}"
  az_count                = length(var.availability_zones)
  public_subnet_ids       = var.create_new_network ? aws_subnet.public[*].id : var.public_subnet_ids
  private_subnet_ids      = var.create_new_network ? aws_subnet.private[*].id : var.private_subnet_ids
  private_route_table_ids = var.create_new_network ? aws_route_table.private[*].id : var.private_route_table_ids
  vpc_id                  = var.create_new_network ? aws_vpc.this[0].id : var.vpc_id
  frontend_image_uri      = var.frontend_image_uri != "" ? var.frontend_image_uri : try("${aws_ecr_repository.frontend[0].repository_url}:latest", "public.ecr.aws/nginx/nginx:latest")
  backend_image_uri       = var.backend_image_uri != "" ? var.backend_image_uri : try("${aws_ecr_repository.backend[0].repository_url}:latest", "public.ecr.aws/nginx/nginx:latest")
  managed_vault_secret_definitions = {
    runtime_role_id   = { name = "runtime-role-id", environment = "VAULT_ROLE_ID" }
    runtime_secret_id = { name = "runtime-secret-id", environment = "VAULT_SECRET_ID" }
    plugin_role_id    = { name = "plugin-role-id", environment = "VAULT_PLUGIN_ROLE_ID" }
    plugin_secret_id  = { name = "plugin-secret-id", environment = "VAULT_PLUGIN_SECRET_ID" }
  }
  managed_vault_secret_arns = var.enable_real_vault_runtime ? [
    for secret in aws_secretsmanager_secret.vault_approle : secret.arn
  ] : []
  legacy_vault_secret_arns = var.enable_real_vault_runtime ? [] : compact([
    var.vault_token_secret_arn,
    var.vault_role_id_secret_arn,
    var.vault_secret_id_secret_arn
  ])
  backend_secret_arns = compact(concat(
    [aws_secretsmanager_secret.database_url.arn],
    local.managed_vault_secret_arns,
    local.legacy_vault_secret_arns,
    [try(aws_secretsmanager_secret.ollama_api_token[0].arn, "")]
  ))
  managed_vault_secrets = var.enable_real_vault_runtime ? [
    for key, definition in local.managed_vault_secret_definitions : {
      name      = definition.environment
      valueFrom = aws_secretsmanager_secret.vault_approle[key].arn
    }
  ] : []
  legacy_vault_secrets = var.enable_real_vault_runtime ? [] : concat(
    var.vault_token_secret_arn == "" ? [] : [{ name = "VAULT_TOKEN", valueFrom = var.vault_token_secret_arn }],
    var.vault_role_id_secret_arn == "" ? [] : [{ name = "VAULT_ROLE_ID", valueFrom = var.vault_role_id_secret_arn }],
    var.vault_secret_id_secret_arn == "" ? [] : [{ name = "VAULT_SECRET_ID", valueFrom = var.vault_secret_id_secret_arn }]
  )
  backend_secrets = concat(
    [{ name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn }],
    local.managed_vault_secrets,
    local.legacy_vault_secrets,
    var.enable_ollama ? [{ name = "OLLAMA_API_KEY", valueFrom = aws_secretsmanager_secret.ollama_api_token[0].arn }] : []
  )
  effective_vault_mode         = var.enable_real_vault_runtime ? "real" : var.vault_mode
  effective_vault_addr         = var.enable_real_vault_runtime ? "http://${try(aws_lb.vault[0].dns_name, "not-provisioned")}:${var.vault_internal_port}" : var.vault_addr
  effective_vault_auth_mode    = var.enable_real_vault_runtime ? "approle" : var.vault_auth_mode
  effective_factory_build_mode = var.enable_real_vault_runtime ? "codebuild" : "static"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_vpc" "this" {
  count                = var.create_new_network ? 1 : 0
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "this" {
  count  = var.create_new_network ? 1 : 0
  vpc_id = local.vpc_id

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  count                   = var.create_new_network ? local.az_count : 0
  vpc_id                  = local.vpc_id
  availability_zone       = var.availability_zones[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  map_public_ip_on_launch = true

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-public-${count.index + 1}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count             = var.create_new_network ? local.az_count : 0
  vpc_id            = local.vpc_id
  availability_zone = var.availability_zones[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 20)

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-private-${count.index + 1}"
    Tier = "private"
  })
}

resource "aws_route_table" "public" {
  count  = var.create_new_network ? 1 : 0
  vpc_id = local.vpc_id

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route" "public_default" {
  count                  = var.create_new_network ? 1 : 0
  route_table_id         = aws_route_table.public[0].id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this[0].id
}

resource "aws_route_table_association" "public" {
  count          = var.create_new_network ? local.az_count : 0
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_eip" "nat" {
  count  = var.create_new_network && var.enable_nat_gateway ? 1 : 0
  domain = "vpc"

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-nat-eip"
  })
}

resource "aws_nat_gateway" "this" {
  count         = var.create_new_network && var.enable_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-nat"
  })
}

resource "aws_route_table" "private" {
  count  = var.create_new_network ? 1 : 0
  vpc_id = local.vpc_id

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-private-rt"
  })
}

resource "aws_route" "private_default" {
  count                  = var.create_new_network && var.enable_nat_gateway ? 1 : 0
  route_table_id         = aws_route_table.private[0].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[0].id
}

resource "aws_route_table_association" "private" {
  count          = var.create_new_network ? local.az_count : 0
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Security group for portal ALB"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
  }

  dynamic "ingress" {
    for_each = var.acm_certificate_arn == "" ? [] : [1]
    content {
      description = "HTTPS"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = var.allowed_ingress_cidrs
    }
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-alb-sg"
  })
}

resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs-sg"
  description = "Security group for portal ECS tasks"
  vpc_id      = local.vpc_id

  ingress {
    description     = "Frontend from ALB"
    from_port       = var.frontend_container_port
    to_port         = var.frontend_container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "Backend from ALB"
    from_port       = var.backend_container_port
    to_port         = var.backend_container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-ecs-sg"
  })
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db-sg"
  description = "Security group for portal PostgreSQL"
  vpc_id      = local.vpc_id

  ingress {
    description     = "PostgreSQL from backend"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-db-sg"
  })
}

resource "aws_ecr_repository" "frontend" {
  count                = var.enable_ecr ? 1 : 0
  name                 = "${local.name_prefix}-frontend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.tags
}

resource "aws_ecr_repository" "backend" {
  count                = var.enable_ecr ? 1 : 0
  name                 = "${local.name_prefix}-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.tags
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${local.name_prefix}/frontend"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name_prefix}/backend"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_db_subnet_group" "this" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = local.private_subnet_ids
  tags       = local.tags
}

resource "aws_db_instance" "this" {
  identifier                  = "${local.name_prefix}-postgres"
  engine                      = "postgres"
  engine_version              = var.rds_engine_version
  instance_class              = var.rds_instance_class
  allocated_storage           = var.rds_allocated_storage
  db_name                     = var.rds_database_name
  username                    = var.rds_username
  password                    = random_password.db.result
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  storage_encrypted           = true
  backup_retention_period     = var.backup_retention_days
  deletion_protection         = var.deletion_protection
  skip_final_snapshot         = true
  publicly_accessible         = false
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-postgres"
  })
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix}/database-url"
  recovery_window_in_days = 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgres://%s:%s@%s:%s/%s?sslmode=require",
    var.rds_username,
    random_password.db.result,
    aws_db_instance.this.address,
    aws_db_instance.this.port,
    var.rds_database_name
  )
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name_prefix}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.backend_secret_arns
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${local.name_prefix}-ecs-execution-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

resource "aws_iam_role" "task" {
  name               = "${local.name_prefix}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}

resource "aws_ecs_cluster" "this" {
  name = "${local.name_prefix}-cluster"
  tags = local.tags
}

resource "aws_lb" "this" {
  name               = "${local.name_prefix}-alb"
  internal           = var.alb_internal
  load_balancer_type = "application"
  idle_timeout       = 120
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.public_subnet_ids
  tags               = local.tags
}

resource "aws_lb_target_group" "frontend" {
  name        = "${local.name_prefix}-fe-tg"
  port        = var.frontend_container_port
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    path                = "/"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.tags
}

resource "aws_lb_target_group" "backend" {
  name        = "${local.name_prefix}-be-tg"
  port        = var.backend_container_port
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener_rule" "backend_core" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/api/auth*", "/api/systems*", "/api/requests*", "/api/credentials*", "/api/plugin-factory*"]
    }
  }
}

resource "aws_lb_listener_rule" "backend_admin" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/api/admin*", "/api/assistant*", "/api/audit-events*", "/api/health*", "/api/vault*"]
    }
  }
}

resource "aws_lb_listener_rule" "vault_ui_proxy" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/ui", "/ui/*", "/v1", "/v1/*"]
    }
  }
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name_prefix}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name         = "frontend"
      image        = local.frontend_image_uri
      essential    = true
      portMappings = [{ containerPort = var.frontend_container_port, protocol = "tcp" }]
      environment = [
        { name = "NEXT_PUBLIC_API_BASE_URL", value = "/api" },
        { name = "APP_UI_BUILD", value = "ollama-factory-20260710d" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.frontend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "frontend"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name         = "backend"
      image        = local.backend_image_uri
      essential    = true
      portMappings = [{ containerPort = var.backend_container_port, protocol = "tcp" }]
      environment = [
        { name = "PORT", value = tostring(var.backend_container_port) },
        { name = "FRONTEND_ORIGIN", value = "http://${aws_lb.this.dns_name}" },
        { name = "VAULT_MODE", value = local.effective_vault_mode },
        { name = "VAULT_ADDR", value = local.effective_vault_addr },
        { name = "VAULT_NAMESPACE", value = var.vault_namespace },
        { name = "VAULT_AUTH_MODE", value = local.effective_vault_auth_mode },
        { name = "VAULT_APPROLE_AUTH_MOUNT", value = var.vault_approle_auth_mount },
        { name = "VAULT_USE_SYSTEM_NAMESPACE", value = tostring(var.vault_use_system_namespace) },
        { name = "VAULT_REQUEST_TIMEOUT_MS", value = tostring(var.vault_request_timeout_ms) },
        { name = "VAULT_PLUGIN_ALLOWED_MOUNT_PREFIX", value = var.enable_real_vault_runtime ? var.vault_plugin_allowed_mount_prefix : "" },
        { name = "VAULT_PLUGIN_DISTRIBUTION_MODE", value = var.enable_real_vault_runtime ? "ssm" : "mock" },
        { name = "VAULT_PLUGIN_NODE_IDS", value = var.enable_real_vault_runtime ? join(",", var.vault_instance_ids) : "" },
        { name = "VAULT_PLUGIN_DIRECTORY", value = var.vault_plugin_directory },
        { name = "FACTORY_BUILD_MODE", value = local.effective_factory_build_mode },
        { name = "FACTORY_BUILD_PROJECT", value = var.enable_real_vault_runtime ? try(aws_codebuild_project.factory_plugin[0].name, "") : "" },
        { name = "FACTORY_BUILD_BUCKET", value = var.enable_real_vault_runtime ? try(aws_s3_bucket.factory_artifacts[0].bucket, "") : "" },
        { name = "FACTORY_BUILD_PREFIX", value = "factory-builds" },
        { name = "FACTORY_BUILD_MAX_ATTEMPTS", value = tostring(var.factory_build_max_attempts) },
        { name = "FACTORY_BUILD_POLL_INTERVAL_MS", value = "3000" },
        { name = "FACTORY_BUILD_TIMEOUT_MS", value = "600000" },
        { name = "LLM_MODE", value = var.enable_ollama ? "ollama" : "rules" },
        { name = "OLLAMA_BASE_URL", value = var.enable_ollama ? "http://${aws_instance.ollama[0].private_ip}:${var.ollama_api_port}" : "" },
        { name = "OLLAMA_MODEL", value = var.ollama_model },
        { name = "OLLAMA_REQUEST_TIMEOUT_MS", value = tostring(var.ollama_request_timeout_ms) },
        { name = "APP_API_BUILD", value = "vault-factory-interview-20260711a" },
        { name = "API_BASE_PATH", value = "/api" }
      ]
      secrets = local.backend_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "backend"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "frontend" {
  name            = "${local.name_prefix}-frontend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = var.frontend_container_port
  }

  depends_on = [aws_lb_listener_rule.backend_core, aws_lb_listener_rule.backend_admin]
  tags       = local.tags

  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_ecs_service" "backend" {
  name            = "${local.name_prefix}-backend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = var.backend_container_port
  }

  depends_on = [aws_lb_listener_rule.backend_core, aws_lb_listener_rule.backend_admin]
  tags       = local.tags

  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_route53_record" "this" {
  count   = var.route53_zone_id != "" && var.domain_name != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
