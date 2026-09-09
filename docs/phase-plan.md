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

## Phase 3 - Vault Plugin Factory Integration

- Consume the separately maintained [vault-plugin-factory](https://github.com/Byeongwook-Heo/vault-plugin-factory) core package.
- Keep user approval, job persistence, audit, and UI orchestration in this Portal.
- Pin a reviewed Factory commit or release instead of duplicating Factory source.

## Phase 4 - Approved Vault Deployment Integration

- Invoke approved plugin registration and mount operations through the Factory/deployment boundary.
- Keep Portal-specific policy, approval, and audit integration here.
- Maintain canonical Factory build infrastructure and plugin templates in `vault-plugin-factory`.

## Phase 5 - Production Hardening

- Keycloak OIDC.
- CSRF/session hardening.
- Notification integrations.
- Threat model.
- CI/CD image pipeline.
