# Security Model

The portal does not replace Vault security controls.

## Rules

- Do not store issued plaintext secrets in the portal database.
- Do not log issued plaintext secrets.
- Do not put real AWS credentials, Vault tokens, database passwords, or customer-specific values in source code.
- Store only lease IDs, TTL, expiry, status, masked display values, and metadata.
- Use Vault policy as the real authorization boundary.
- Treat portal UI permissions as workflow controls, not the primary security boundary.

## Audit

The portal stores business workflow audit events:

- request created
- approval
- rejection
- execution
- revocation

This does not replace Vault audit logs. Vault audit logging must remain enabled and separately monitored.

## Runtime Tokens

Phase 1 uses mock Vault and does not require a Vault token.

For real mode:

- never use a root token in runtime
- prefer user token pass-through where user attribution matters
- use a tightly scoped service token only where the broker pattern is approved
- AppRole or AWS IAM auth should be considered for non-human service authentication

## AWS Secrets

AWS Secrets Manager may store runtime configuration such as `DATABASE_URL`.

It must not store issued Vault credentials, issued database passwords, issued GitLab/Jenkins/legacy tokens, or one-time revealed values.
