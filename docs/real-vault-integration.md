# Real Vault Integration

Phase 2 adds a real Vault adapter behind the backend/BFF. The frontend still never calls Vault directly.

## Supported Runtime Modes

```text
VAULT_MODE=mock
VAULT_MODE=real
```

Real mode supports:

- `VAULT_AUTH_MODE=token`
- `VAULT_AUTH_MODE=approle`

Placeholders are intentionally explicit:

- `VAULT_AUTH_MODE=aws-iam` returns a configuration error until AWS IAM request signing is added.
- `VAULT_AUTH_MODE=oidc-pass-through` returns a configuration error until a user Vault token broker exists.

## Required Variables

Token mode:

```bash
VAULT_MODE=real
VAULT_AUTH_MODE=token
VAULT_ADDR=http://vault.internal:8200
VAULT_TOKEN=<tightly-scoped-token>
```

AppRole mode:

```bash
VAULT_MODE=real
VAULT_AUTH_MODE=approle
VAULT_ADDR=http://vault.internal:8200
VAULT_ROLE_ID=<role-id>
VAULT_SECRET_ID=<secret-id>
VAULT_APPROLE_AUTH_MOUNT=approle
```

Namespace handling:

```bash
VAULT_NAMESPACE=platform/payments
VAULT_USE_SYSTEM_NAMESPACE=false
```

If `VAULT_NAMESPACE` is set, the backend uses it for all real Vault calls.

If `VAULT_NAMESPACE` is empty and `VAULT_USE_SYSTEM_NAMESPACE=true`, the backend uses the namespace mapped on each business system.

For this lab, keep `VAULT_USE_SYSTEM_NAMESPACE=false` unless those namespaces already exist.

## Implemented Vault Calls

The backend maps business request types to Vault paths:

| Request type | Vault call |
| --- | --- |
| `KV_READ` | `GET <mount>/data/<path>` |
| `KV_WRITE` | `POST <mount>/data/<path>` |
| `DB_CREDENTIAL` | `GET <mount>/creds/<role>` |
| `PKI_CERTIFICATE` | `POST <mount>/issue/<role>` |
| `SSH_CERTIFICATE` | `POST <mount>/sign/<role>` |
| `APPROLE_SECRET_ID` | `POST <mount>/role/<role>/secret-id` with response wrapping |
| custom plugin token | `POST <mount>/creds/<role>` |
| network rotation | `POST <mount>/rotate/<role>` |
| revoke | `PUT sys/leases/revoke` |

## Health and Mapping Checks

Backend endpoints:

```text
GET /health/vault
GET /health/vault/mappings
```

CLI health check:

```bash
VAULT_ADDR=http://127.0.0.1:8200 ./scripts/check-real-vault-health.sh
```

## Current Lab Vault Access

The current lab Vault nodes are private. Browser or backend access from a laptop requires a tunnel or an AWS deployment inside the VPC.

Example tunnel when Bastion is reachable:

```bash
ssh -i ~/.ssh/lab.pem -L 8200:192.0.2.202:8200 ubuntu@<bastion-public-ip>
```

Then:

```bash
VAULT_ADDR=http://127.0.0.1:8200 ./scripts/check-real-vault-health.sh
```

Production should not depend on a single Vault node IP. Use a stable internal endpoint such as an internal NLB, private DNS, or an approved service discovery endpoint.

## Secret Handling

- Real Vault responses are reduced to lease ID, TTL, expiry, masked display value, and redacted metadata.
- Plaintext issued credentials are not persisted.
- The application does not log Vault tokens or issued secret values.
- Root tokens must not be used in runtime configuration.
