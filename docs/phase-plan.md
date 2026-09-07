# Phase Plan

## Phase 1 - AWS Portal Test MVP

- Build portal MVP.
- Deploy into a separate AWS test environment.
- Use mock Vault mode.
- Do not modify the existing HashiCorp lab.

## Phase 2 - Real Vault Adapter

- Add stable Vault endpoint configuration.
- Validate Vault health.
- Add real KV, database, PKI, AppRole, and custom plugin path calls.

## Phase 3 - Custom Vault Plugin Skeletons

- Add Go skeletons for GitLab, Jenkins, and legacy API token plugins.
- Add build and registration examples.

## Phase 4 - Vault Terraform

- Register plugins.
- Mount plugin engines.
- Configure policies and roles.

## Phase 5 - Production Hardening

- Keycloak OIDC.
- CSRF/session hardening.
- Notification integrations.
- Threat model.
- CI/CD image pipeline.
