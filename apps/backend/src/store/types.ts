import type {
  AccessRequest,
  AuditEvent,
  IssuedCredential,
  ManagedUser,
  PortalUser,
  RequestStatus,
  SystemSummary,
  VaultPluginFactoryJob,
  CreateVaultPluginFactoryJobInput,
  UpdateVaultPluginFactoryJobInput
} from "@security-portal/shared";

export interface CreateRequestInput {
  requester: PortalUser;
  systemId: string;
  requestType: AccessRequest["requestType"];
  reason: string;
  ttl: string;
  payload: Record<string, unknown>;
  riskLevel: AccessRequest["riskLevel"];
}

export type RequestUpdateFields = Partial<
  Pick<AccessRequest, "approvedAt" | "rejectedAt" | "executedAt" | "expiresAt" | "ttl" | "payload">
>;

export interface PortalStore {
  initialize(): Promise<void>;
  getUserByEmail(email: string): Promise<PortalUser | undefined>;
  getUserById(id: string): Promise<PortalUser | undefined>;
  recordUserLogin(id: string): Promise<void>;
  listUsers(): Promise<ManagedUser[]>;
  updateUserAccess(
    id: string,
    input: Partial<Pick<ManagedUser, "groups" | "roles" | "status" | "mfaEnabled" | "passwordResetRequired">>
  ): Promise<ManagedUser>;
  markUserPasswordReset(id: string): Promise<ManagedUser>;
  listSystems(user: PortalUser): Promise<SystemSummary[]>;
  getSystem(id: string): Promise<SystemSummary | undefined>;
  createRequest(input: CreateRequestInput): Promise<AccessRequest>;
  listRequests(): Promise<AccessRequest[]>;
  getRequest(id: string): Promise<AccessRequest | undefined>;
  updateRequestStatus(
    id: string,
    status: RequestStatus,
    actor: PortalUser,
    fields?: RequestUpdateFields
  ): Promise<AccessRequest>;
  createCredential(input: Omit<IssuedCredential, "id" | "createdAt">): Promise<IssuedCredential>;
  listCredentials(): Promise<IssuedCredential[]>;
  getCredential(id: string): Promise<IssuedCredential | undefined>;
  markCredentialRevoked(id: string): Promise<IssuedCredential>;
  markCredentialRevokeFailed(id: string): Promise<IssuedCredential>;
  createAuditEvent(input: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent>;
  listAuditEvents(): Promise<AuditEvent[]>;
  createFactoryJob(input: CreateVaultPluginFactoryJobInput): Promise<VaultPluginFactoryJob>;
  listFactoryJobs(ownerId?: string): Promise<VaultPluginFactoryJob[]>;
  getFactoryJob(id: string): Promise<VaultPluginFactoryJob | undefined>;
  updateFactoryJob(
    id: string,
    input: UpdateVaultPluginFactoryJobInput,
    options?: { expectedUpdatedAt?: string }
  ): Promise<VaultPluginFactoryJob>;
  deleteFactoryJob(id: string): Promise<VaultPluginFactoryJob>;
}
