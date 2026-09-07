import type { VaultPluginSource, VaultPluginType } from "@security-portal/shared";

export type FactoryCatalogTier = "priority" | "conditional" | "lab";

export interface FactoryExpansionTemplate {
  id: string;
  name: string;
  displayName: string;
  pluginType: VaultPluginType;
  source: Extract<VaultPluginSource, "community" | "partner">;
  repository: string;
  sourceUrl?: string;
  description: string;
  target: string;
  aliases: string[];
  catalogTier: FactoryCatalogTier;
}

export const factoryExpansionReservedTargets = [
  "acme",
  "ad",
  "approle",
  "artifactory",
  "azure",
  "couchbase",
  "elasticsearch",
  "gcp",
  "github-actions",
  "gitlab",
  "jenkins",
  "jwt",
  "kafka",
  "kerberos",
  "kubernetes",
  "ldap",
  "minio",
  "mongodbatlas",
  "openldap",
  "oracle",
  "pki-external-ca",
  "postgres",
  "redis",
  "slack",
  "snowflake",
  "spiffe",
  "spire",
  "tfe",
  "u2f",
  "venafi-pki"
] as const;

export const factoryExpansionTemplates: FactoryExpansionTemplate[] = [
  {
    id: "expansion-github-secrets",
    name: "vault-plugin-secrets-github",
    displayName: "GitHub App Secrets",
    pluginType: "secret",
    source: "community",
    repository: "martinbaillie/vault-plugin-secrets-github",
    description: "Mint short-lived, finely scoped GitHub App installation tokens.",
    target: "github",
    aliases: ["github app", "github token"],
    catalogTier: "priority"
  },
  {
    id: "expansion-github-pat-rotation",
    name: "vault-plugin-secrets-github-pat-rotation",
    displayName: "GitHub PAT Rotation",
    pluginType: "secret",
    source: "community",
    repository: "Byeongwook-Heo/vault-security-portal",
    sourceUrl: "https://github.com/Byeongwook-Heo/vault-security-portal",
    description:
      "Validate and rotate operator-supplied GitHub personal access tokens, with optional fine-grained PAT organization-access revocation.",
    target: "github-pat",
    aliases: [
      "github pat",
      "personal access token",
      "pat rotation",
      "fine-grained pat",
      "classic pat",
      "github token rotation",
      "PAT 로테이션"
    ],
    catalogTier: "conditional"
  },
  {
    id: "expansion-sectigo-pki",
    name: "sectigo-vault-pki",
    displayName: "Sectigo SCM PKI",
    pluginType: "secret",
    source: "partner",
    repository: "Sectigo Certificate Manager Vault connector",
    sourceUrl: "https://docs.sectigo.com/scm/sectigo-hashicorp-vault-integration/overview",
    description: "Enroll, retrieve, renew, replace, and revoke certificates through Sectigo SCM.",
    target: "sectigo-pki",
    aliases: ["sectigo", "scm", "certificate lifecycle"],
    catalogTier: "priority"
  },
  {
    id: "expansion-digicert-pki",
    name: "digicert-vault-pki",
    displayName: "DigiCert TLM PKI",
    pluginType: "secret",
    source: "partner",
    repository: "DigiCert Trust Lifecycle Manager Vault plugin",
    sourceUrl: "https://www.digicert.com/integrations/hashicorp-vault",
    description: "Manage certificate enrollment, retrieval, and revocation through DigiCert TLM.",
    target: "digicert-pki",
    aliases: ["digicert", "tlm", "certificate lifecycle"],
    catalogTier: "priority"
  },
  {
    id: "expansion-onepassword-secrets",
    name: "vault-plugin-secrets-onepassword",
    displayName: "1Password Connect Secrets",
    pluginType: "secret",
    source: "community",
    repository: "1Password/vault-plugin-secrets-onepassword",
    description: "Retrieve, create, and delete 1Password items through 1Password Connect.",
    target: "onepassword",
    aliases: ["1password", "one password", "connect"],
    catalogTier: "priority"
  },
  {
    id: "expansion-keycloak-secrets",
    name: "vault-plugin-secrets-keycloak",
    displayName: "Keycloak Client Secrets",
    pluginType: "secret",
    source: "community",
    repository: "Serviceware/vault-plugin-secrets-keycloak",
    description: "Retrieve Keycloak client secrets across configured realms.",
    target: "keycloak",
    aliases: ["keycloak client", "realm"],
    catalogTier: "priority"
  },
  {
    id: "expansion-netbox-secrets",
    name: "vault-plugin-secrets-netbox",
    displayName: "NetBox API Tokens",
    pluginType: "secret",
    source: "community",
    repository: "ljb2of3/vault-plugin-secrets-netbox",
    description: "Generate short-lived NetBox API tokens with Vault leases.",
    target: "netbox",
    aliases: ["netbox token", "dcim"],
    catalogTier: "priority"
  },
  {
    id: "expansion-nexus-secrets",
    name: "vault-plugin-secrets-nexus-repository",
    displayName: "Nexus Repository Users",
    pluginType: "secret",
    source: "community",
    repository: "manhtukhang/vault-plugin-secrets-nexus-repository",
    description: "Create and revoke Nexus Repository users with predefined roles.",
    target: "nexus",
    aliases: ["nexus repository", "sonatype"],
    catalogTier: "priority"
  },
  {
    id: "expansion-grafana-secrets",
    name: "vault-plugin-secrets-grafana",
    displayName: "Grafana Access Tokens",
    pluginType: "secret",
    source: "community",
    repository: "Boostport/vault-plugin-secrets-grafana",
    description: "Generate Grafana Cloud and self-hosted Grafana access tokens.",
    target: "grafana",
    aliases: ["grafana cloud", "grafana token"],
    catalogTier: "priority"
  },
  {
    id: "expansion-openai-secrets",
    name: "vault-plugin-secrets-openai",
    displayName: "OpenAI Project Secrets",
    pluginType: "secret",
    source: "community",
    repository: "gitrgoliveira/vault-plugin-secrets-openai",
    description: "Create, rotate, and revoke OpenAI project service-account API keys.",
    target: "openai",
    aliases: ["openai api", "openai project"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-salesforce-secrets",
    name: "vault-plugin-secrets-salesforce",
    displayName: "Salesforce OAuth Tokens",
    pluginType: "secret",
    source: "community",
    repository: "DarthVaderRC/vault-plugin-secrets-salesforce",
    description: "Broker Salesforce OAuth access tokens through supported grant flows.",
    target: "salesforce",
    aliases: ["salesforce oauth", "salesforce token"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-solace-secrets",
    name: "solace-vault-plugin",
    displayName: "Solace Password Rotation",
    pluginType: "secret",
    source: "community",
    repository: "aviforge/solace-vault-plugin",
    description: "Rotate Solace CLI user passwords through a Vault secrets engine.",
    target: "solace",
    aliases: ["solace cli", "solace password"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-proxmox-secrets",
    name: "vault-plugin-secrets-proxmox",
    displayName: "Proxmox API Tokens",
    pluginType: "secret",
    source: "community",
    repository: "mollstam/vault-plugin-secrets-proxmox",
    description: "Mint and revoke Proxmox VE API tokens.",
    target: "proxmox",
    aliases: ["proxmox ve", "proxmox token"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-splunk-secrets",
    name: "vault-plugin-splunk",
    displayName: "Splunk Temporary Users",
    pluginType: "secret",
    source: "community",
    repository: "splunk/vault-plugin-splunk",
    description: "Create temporary Splunk administrators and rotate root credentials.",
    target: "splunk",
    aliases: ["splunk admin", "splunk user"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-argocd-secrets",
    name: "vault-plugin-argocd-tokens",
    displayName: "Argo CD Tokens",
    pluginType: "secret",
    source: "community",
    repository: "splunk/vault-plugin-argocd-tokens",
    description: "Issue Argo CD account and project-role tokens.",
    target: "argocd",
    aliases: ["argo cd", "argocd token"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-dockerhub-secrets",
    name: "vault-plugin-secrets-dockerhub",
    displayName: "Docker Hub Access Tokens",
    pluginType: "secret",
    source: "community",
    repository: "hoeg/vault-plugin-secrets-dockerhub",
    description: "Create dynamic Docker Hub access tokens.",
    target: "dockerhub",
    aliases: ["docker hub", "docker token"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-tailscale-secrets",
    name: "vault-plugin-secrets-tailscale",
    displayName: "Tailscale Auth Keys",
    pluginType: "secret",
    source: "community",
    repository: "bloominlabs/vault-plugin-secrets-tailscale",
    description: "Create Tailscale authentication keys through Vault.",
    target: "tailscale",
    aliases: ["tailscale auth", "tailscale key"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-datadog-secrets",
    name: "vault-plugin-secrets-datadog",
    displayName: "Datadog Credentials",
    pluginType: "secret",
    source: "community",
    repository: "rizkybiz/vault-plugin-secrets-datadog",
    description: "Manage Datadog credentials through a Vault secrets engine.",
    target: "datadog",
    aliases: ["datadog api", "datadog credential"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-ibmcloud-secrets",
    name: "vault-plugin-secrets-ibmcloud",
    displayName: "IBM Cloud Credentials",
    pluginType: "secret",
    source: "community",
    repository: "ibm-cloud-security/vault-plugin-secrets-ibmcloud",
    description: "Generate IBM Cloud credentials for IBM-specific environments.",
    target: "ibmcloud",
    aliases: ["ibm cloud", "ibm credential"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-ory-auth",
    name: "vault-plugin-auth-ory",
    displayName: "Ory Kratos and Keto Auth",
    pluginType: "auth",
    source: "community",
    repository: "comnoco/vault-plugin-auth-ory",
    description: "Authenticate Ory Kratos sessions and authorize Ory Keto relations.",
    target: "ory",
    aliases: ["ory kratos", "ory keto"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-clickhouse-database",
    name: "vault-plugin-database-clickhouse",
    displayName: "ClickHouse Database",
    pluginType: "database",
    source: "community",
    repository: "ContentSquare/vault-plugin-database-clickhouse",
    description: "Manage dynamic ClickHouse SQL users through the database secrets engine.",
    target: "clickhouse",
    aliases: ["click house", "clickhouse database"],
    catalogTier: "conditional"
  },
  {
    id: "expansion-qdrant-secrets",
    name: "vault-plugin-secrets-qdrant",
    displayName: "Qdrant Role JWTs",
    pluginType: "secret",
    source: "community",
    repository: "migrx-io/vault-plugin-secrets-qdrant",
    description: "Issue role-based JWT credentials for Qdrant.",
    target: "qdrant",
    aliases: ["qdrant jwt", "qdrant token"],
    catalogTier: "lab"
  },
  {
    id: "expansion-oauth-token-exchange",
    name: "vault-plugin-secrets-oauth-token-exchange",
    displayName: "OAuth Token Exchange",
    pluginType: "secret",
    source: "community",
    repository: "joatmon08/vault-plugin-secrets-oauth-token-exchange",
    description: "Exchange OAuth tokens through an experimental Vault secrets engine.",
    target: "oauth-token-exchange",
    aliases: ["oauth exchange", "token exchange"],
    catalogTier: "lab"
  },
  {
    id: "expansion-cloudflare-secrets",
    name: "vault-plugin-secrets-cloudflare",
    displayName: "Cloudflare API Tokens",
    pluginType: "secret",
    source: "community",
    repository: "bloominlabs/vault-plugin-secrets-cloudflare",
    description: "Create Cloudflare API tokens and rotate the root token.",
    target: "cloudflare",
    aliases: ["cloudflare api", "cloudflare token"],
    catalogTier: "lab"
  },
  {
    id: "expansion-openstack-secrets",
    name: "vault-plugin-secrets-openstack",
    displayName: "OpenStack Credentials",
    pluginType: "secret",
    source: "community",
    repository: "opentelekomcloud/vault-plugin-secrets-openstack",
    description: "Generate credentials for compatible OpenStack environments.",
    target: "openstack",
    aliases: ["open stack", "openstack credential"],
    catalogTier: "lab"
  },
  {
    id: "expansion-chef-auth",
    name: "vault-auth-plugin-chef",
    displayName: "Chef Client Auth",
    pluginType: "auth",
    source: "community",
    repository: "criteo/vault-auth-plugin-chef",
    description: "Authenticate legacy Chef node and client identities to Vault.",
    target: "chef",
    aliases: ["chef node", "chef client"],
    catalogTier: "lab"
  },
  {
    id: "expansion-vsphere-auth",
    name: "vault-plugin-auth-vsphere",
    displayName: "vSphere VM Auth",
    pluginType: "auth",
    source: "community",
    repository: "martezr/vault-plugin-auth-vsphere",
    description: "Authenticate vSphere virtual machines through a vAuth service.",
    target: "vsphere",
    aliases: ["vmware", "vsphere vm", "vauth"],
    catalogTier: "lab"
  },
  {
    id: "expansion-attest-auth",
    name: "vault-auth-plugin-attest",
    displayName: "TDX and TPM Attested Auth",
    pluginType: "auth",
    source: "community",
    repository: "flashbots/vault-auth-plugin-attest",
    description: "Authenticate workloads using TDX or TPM2 attestation evidence.",
    target: "attest",
    aliases: ["tdx", "tpm", "attestation"],
    catalogTier: "lab"
  },
  {
    id: "expansion-aerospike-database",
    name: "vault-plugin-database-aerospike",
    displayName: "Aerospike Database",
    pluginType: "database",
    source: "partner",
    repository: "aerospike-community/vault-plugin-database-aerospike",
    description: "Generate and rotate dynamic or static Aerospike database users.",
    target: "aerospike",
    aliases: ["aero spike", "aerospike database"],
    catalogTier: "lab"
  },
  {
    id: "expansion-arangodb-database",
    name: "vault-plugin-database-arangodb",
    displayName: "ArangoDB Database",
    pluginType: "database",
    source: "community",
    repository: "eplightning/vault-plugin-database-arangodb",
    description: "Manage ArangoDB credentials through a custom database plugin.",
    target: "arangodb",
    aliases: ["arango", "arango database"],
    catalogTier: "lab"
  },
  {
    id: "expansion-eventstoredb-database",
    name: "vault-plugin-database-eventstoredb",
    displayName: "EventStoreDB Database",
    pluginType: "database",
    source: "community",
    repository: "megakid/vault-plugin-database-eventstoredb",
    description: "Manage EventStoreDB credentials through a custom database plugin.",
    target: "eventstoredb",
    aliases: ["event store", "eventstore database"],
    catalogTier: "lab"
  }
];
