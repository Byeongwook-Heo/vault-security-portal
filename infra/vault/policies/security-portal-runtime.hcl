path "sys/internal/ui/mounts/*" {
  capabilities = ["read"]
}

path "sys/leases/revoke" {
  capabilities = ["update"]
}

path "factory-lab/*" {
  capabilities = ["create", "update", "read", "list", "delete"]
}

path "auth/factory-lab/*" {
  capabilities = ["read"]
}
