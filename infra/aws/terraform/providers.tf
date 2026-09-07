terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.51.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "= 3.9.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
