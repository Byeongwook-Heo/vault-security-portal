# Local Development

Phase 1 supports local development with mock Vault.

```bash
pnpm install
pnpm build
pnpm test
```

With Docker running:

```bash
docker compose up --build
```

Open:

```text
http://localhost:3000
```

The backend seeds:

- `developer@example.com`
- `approver@example.com`
- `admin@example.com`
- `auditor@example.com`

Systems:

- TANGO-EC
- TAP-TD
- Data Platform
- Payment API

Phase 2 will add real Vault mode against an existing Vault endpoint.
