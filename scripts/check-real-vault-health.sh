#!/usr/bin/env bash
set -euo pipefail

if [ -z "${VAULT_ADDR:-}" ]; then
  echo "VAULT_ADDR is required" >&2
  exit 2
fi

headers=()
if [ -n "${VAULT_TOKEN:-}" ]; then
  headers+=("-H" "X-Vault-Token: ${VAULT_TOKEN}")
fi
if [ -n "${VAULT_NAMESPACE:-}" ]; then
  headers+=("-H" "X-Vault-Namespace: ${VAULT_NAMESPACE}")
fi

tmp="$(mktemp)"
code="$(curl -sS -o "$tmp" -w "%{http_code}" "${headers[@]}" "${VAULT_ADDR%/}/v1/sys/health" || true)"

jq -n \
  --arg code "$code" \
  --slurpfile body "$tmp" \
  '{
    http_status: ($code | tonumber? // $code),
    initialized: ($body[0].initialized // null),
    sealed: ($body[0].sealed // null),
    standby: ($body[0].standby // null),
    performance_standby: ($body[0].performance_standby // null),
    version: ($body[0].version // null),
    cluster_name: ($body[0].cluster_name // null)
  }'

rm -f "$tmp"
