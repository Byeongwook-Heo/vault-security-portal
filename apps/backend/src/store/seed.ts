import type { PortalUser, SystemSummary } from "@security-portal/shared";

export const seedUsers: PortalUser[] = [
  {
    id: "user-developer",
    email: "developer@example.com",
    displayName: "Developer User",
    groups: ["app-tango", "app-data"],
    roles: ["developer"]
  },
  {
    id: "user-approver",
    email: "approver@example.com",
    displayName: "Security Approver",
    groups: ["security-approvers"],
    roles: ["security-approver"]
  },
  {
    id: "user-admin",
    email: "admin@example.com",
    displayName: "Vault Admin",
    groups: ["security-approvers", "platform-admins"],
    roles: ["vault-admin", "app-owner"]
  },
  {
    id: "user-auditor",
    email: "auditor@example.com",
    displayName: "Audit User",
    groups: ["audit"],
    roles: ["auditor"]
  }
];

export const seedSystems: SystemSummary[] = [
  {
    id: "system-tango-ec",
    name: "TANGO-EC",
    description: "Enterprise commerce application handling customer-facing order workflows.",
    environment: "prod",
    ownerGroup: "app-tango",
    allowedRequestTypes: ["DB_CREDENTIAL", "PKI_CERTIFICATE", "CUSTOM_GITLAB_TOKEN", "CUSTOM_JENKINS_TOKEN"],
    vaultNamespace: "platform/payments",
    vaultMountMappings: [
      {
        id: "map-tango-gitlab",
        mountPath: "gitlab-token/",
        roleName: "tango-ec-maintainer",
        requestType: "CUSTOM_GITLAB_TOKEN",
        displayName: "GitLab project maintainer token",
        enabled: true
      },
      {
        id: "map-tango-db",
        mountPath: "database/",
        roleName: "tango-ec-readwrite",
        requestType: "DB_CREDENTIAL",
        displayName: "Temporary PostgreSQL credential",
        enabled: true
      },
      {
        id: "map-tango-pki",
        mountPath: "pki-int/",
        roleName: "tango-ec-service",
        requestType: "PKI_CERTIFICATE",
        displayName: "Internal service certificate",
        enabled: true
      }
    ]
  },
  {
    id: "system-tap-td",
    name: "TAP-TD",
    description: "Telemetry and data transformation service for internal platform teams.",
    environment: "staging",
    ownerGroup: "app-data",
    allowedRequestTypes: ["CUSTOM_KAFKA_ACCESS", "CUSTOM_LEGACY_API_TOKEN", "KV_READ"],
    vaultNamespace: "platform/data",
    vaultMountMappings: [
      {
        id: "map-tap-kafka",
        mountPath: "kafka-access/",
        roleName: "tap-td-producer",
        requestType: "CUSTOM_KAFKA_ACCESS",
        displayName: "Kafka producer ACL and client certificate",
        enabled: true
      },
      {
        id: "map-tap-legacy",
        mountPath: "legacy-api-token/",
        roleName: "tap-td-readonly",
        requestType: "CUSTOM_LEGACY_API_TOKEN",
        displayName: "Legacy API readonly token",
        enabled: true
      },
      {
        id: "map-tap-kv-read",
        mountPath: "kv/",
        roleName: "tap-td/runtime/config",
        requestType: "KV_READ",
        displayName: "Runtime KV config read",
        enabled: true
      }
    ]
  },
  {
    id: "system-data-platform",
    name: "Data Platform",
    description: "Shared analytics and reporting platform.",
    environment: "prod",
    ownerGroup: "app-data",
    allowedRequestTypes: ["CUSTOM_KAFKA_ACCESS", "DB_CREDENTIAL", "KV_WRITE"],
    vaultNamespace: "platform/data",
    vaultMountMappings: [
      {
        id: "map-data-db",
        mountPath: "database/",
        roleName: "data-platform-analyst",
        requestType: "DB_CREDENTIAL",
        displayName: "Analyst read credential",
        enabled: true
      },
      {
        id: "map-data-kv-write",
        mountPath: "kv/",
        roleName: "data-platform/app-config",
        requestType: "KV_WRITE",
        displayName: "Application KV config registration",
        enabled: true
      }
    ]
  },
  {
    id: "system-payment-api",
    name: "Payment API",
    description: "Payment processing API requiring short-lived credentials and certificates.",
    environment: "prod",
    ownerGroup: "app-payments",
    allowedRequestTypes: ["PKI_CERTIFICATE", "NETWORK_DEVICE_ROTATION", "APPROLE_SECRET_ID"],
    vaultNamespace: "platform/payments",
    vaultMountMappings: [
      {
        id: "map-payment-network",
        mountPath: "network-rotation/",
        roleName: "payment-fw-rotation",
        requestType: "NETWORK_DEVICE_ROTATION",
        displayName: "Firewall credential rotation",
        enabled: true
      },
      {
        id: "map-payment-pki",
        mountPath: "pki-int/",
        roleName: "payment-api-service",
        requestType: "PKI_CERTIFICATE",
        displayName: "Payment API service certificate",
        enabled: true
      },
      {
        id: "map-payment-approle",
        mountPath: "auth/approle/",
        roleName: "payment-api",
        requestType: "APPROLE_SECRET_ID",
        displayName: "Wrapped AppRole SecretID",
        enabled: true
      }
    ]
  }
];
