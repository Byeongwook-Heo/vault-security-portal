# Architecture

The portal is a workflow and experience layer. Vault remains the security backend.

```text
User
  -> Security Portal Frontend
  -> Backend / BFF
  -> Vault adapter
  -> Mock Vault in Phase 1
  -> Real Vault Enterprise in Phase 2
```

The frontend never calls Vault directly. It calls the backend/BFF only.

The backend owns:

- authentication session handling
- request workflow
- approval workflow
- business audit events
- Vault adapter calls
- metadata persistence

Vault owns:

- credential issuance
- TTL
- leases
- revocation
- policy enforcement
- Vault audit logging

## AWS Phase 1

```text
ALB
  /          -> ECS frontend
  /auth*     -> ECS backend
  /systems*  -> ECS backend
  /requests* -> ECS backend
  /credentials* -> ECS backend
  /audit-events* -> ECS backend
  /admin*    -> ECS backend

ECS backend -> RDS PostgreSQL
ECS backend -> Mock Vault adapter
```

The AWS test environment is intentionally separated from the current HashiCorp lab.

## Phase 2 Vault Endpoint

Production should not depend on a single Vault node private IP. Use a stable internal endpoint such as:

- internal NLB
- private DNS
- approved service discovery endpoint

Single-node private IPs are acceptable for lab-only validation.
