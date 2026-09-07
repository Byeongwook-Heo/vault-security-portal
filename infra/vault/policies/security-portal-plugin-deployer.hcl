path "sys/plugins/catalog/*" {
  capabilities = ["create", "update", "read", "list", "delete", "sudo"]
}

path "sys/mounts" {
  capabilities = ["read", "list"]
}

path "sys/mounts/factory-lab/*" {
  capabilities = ["create", "update", "read", "delete", "sudo"]
}

path "sys/auth" {
  capabilities = ["read", "list"]
}

path "sys/auth/factory-lab/*" {
  capabilities = ["create", "update", "read", "delete", "sudo"]
}
