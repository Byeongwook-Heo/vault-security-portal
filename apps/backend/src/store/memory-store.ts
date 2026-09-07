import type {
  AccessRequest,
  AuditEvent,
  CredentialStatus,
  IssuedCredential,
  ManagedUser,
  PortalUser,
  RequestStatus,
  SystemSummary,
  VaultPluginFactoryJob,
  CreateVaultPluginFactoryJobInput,
  UpdateVaultPluginFactoryJobInput
} from "@security-portal/shared";
import { seedSystems, seedUsers } from "./seed";
import type { CreateRequestInput, PortalStore, RequestUpdateFields } from "./types";

export class MemoryStore implements PortalStore {
  private users = new Map(seedUsers.map((user, index) => [user.id, toManagedUser(user, index)]));
  private systems = new Map(seedSystems.map((system) => [system.id, system]));
  private requests = new Map<string, AccessRequest>();
  private credentials = new Map<string, IssuedCredential>();
  private auditEvents = new Map<string, AuditEvent>();
  private factoryJobs = new Map<string, VaultPluginFactoryJob>();

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  async getUserByEmail(email: string): Promise<PortalUser | undefined> {
    return [...this.users.values()].find((user) => user.email === email);
  }

  async getUserById(id: string): Promise<PortalUser | undefined> {
    return this.users.get(id);
  }

  async recordUserLogin(id: string): Promise<void> {
    const user = this.users.get(id);
    if (!user) return;
    this.users.set(id, {
      ...user,
      activeSessions: Math.max(user.activeSessions, 1),
      lastLoginAt: new Date().toISOString()
    });
  }

  async listUsers(): Promise<ManagedUser[]> {
    return [...this.users.values()].sort((a, b) => a.email.localeCompare(b.email));
  }

  async updateUserAccess(
    id: string,
    input: Partial<Pick<ManagedUser, "groups" | "roles" | "status" | "mfaEnabled" | "passwordResetRequired">>
  ): Promise<ManagedUser> {
    const user = this.requireUser(id);
    const next: ManagedUser = {
      ...user,
      groups: input.groups ?? user.groups,
      roles: input.roles ?? user.roles,
      status: input.status ?? user.status,
      mfaEnabled: input.mfaEnabled ?? user.mfaEnabled,
      passwordResetRequired: input.passwordResetRequired ?? user.passwordResetRequired
    };
    this.users.set(id, next);
    return next;
  }

  async markUserPasswordReset(id: string): Promise<ManagedUser> {
    return this.updateUserAccess(id, { passwordResetRequired: true });
  }

  async listSystems(user: PortalUser): Promise<SystemSummary[]> {
    if (user.roles.includes("vault-admin") || user.roles.includes("auditor")) {
      return [...this.systems.values()];
    }
    return [...this.systems.values()].filter((system) => user.groups.includes(system.ownerGroup));
  }

  async getSystem(id: string): Promise<SystemSummary | undefined> {
    return this.systems.get(id);
  }

  async createRequest(input: CreateRequestInput): Promise<AccessRequest> {
    const system = this.requireSystem(input.systemId);
    const now = new Date().toISOString();
    const request: AccessRequest = {
      id: crypto.randomUUID(),
      requesterId: input.requester.id,
      requesterEmail: input.requester.email,
      systemId: system.id,
      systemName: system.name,
      requestType: input.requestType,
      status: "pending",
      reason: input.reason,
      riskLevel: input.riskLevel,
      ttl: input.ttl,
      payload: input.payload,
      approvalRequired: true,
      createdAt: now
    };
    this.requests.set(request.id, request);
    return request;
  }

  async listRequests(): Promise<AccessRequest[]> {
    return [...this.requests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRequest(id: string): Promise<AccessRequest | undefined> {
    return this.requests.get(id);
  }

  async updateRequestStatus(
    id: string,
    status: RequestStatus,
    actor: PortalUser,
    fields: RequestUpdateFields = {}
  ): Promise<AccessRequest> {
    const request = this.requireRequest(id);
    const next: AccessRequest = {
      ...request,
      ...fields,
      status,
      approvedBy: status === "approved" ? actor.email : request.approvedBy,
      rejectedBy: status === "rejected" ? actor.email : request.rejectedBy
    };
    this.requests.set(id, next);
    return next;
  }

  async createCredential(input: Omit<IssuedCredential, "id" | "createdAt">): Promise<IssuedCredential> {
    const credential: IssuedCredential = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.credentials.set(credential.id, credential);
    return credential;
  }

  async listCredentials(): Promise<IssuedCredential[]> {
    return [...this.credentials.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getCredential(id: string): Promise<IssuedCredential | undefined> {
    return this.credentials.get(id);
  }

  async markCredentialRevoked(id: string): Promise<IssuedCredential> {
    const credential = this.credentials.get(id);
    if (!credential) {
      throw new Error("Credential not found");
    }
    const next: IssuedCredential = {
      ...credential,
      status: "revoked" satisfies CredentialStatus,
      revokedAt: new Date().toISOString()
    };
    this.credentials.set(id, next);
    return next;
  }

  async markCredentialRevokeFailed(id: string): Promise<IssuedCredential> {
    const credential = this.credentials.get(id);
    if (!credential) {
      throw new Error("Credential not found");
    }
    const next: IssuedCredential = {
      ...credential,
      status: "revoke_failed" satisfies CredentialStatus
    };
    this.credentials.set(id, next);
    return next;
  }

  async createAuditEvent(input: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> {
    const event: AuditEvent = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.auditEvents.set(event.id, event);
    return event;
  }

  async listAuditEvents(): Promise<AuditEvent[]> {
    return [...this.auditEvents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createFactoryJob(input: CreateVaultPluginFactoryJobInput): Promise<VaultPluginFactoryJob> {
    const now = new Date().toISOString();
    const job: VaultPluginFactoryJob = {
      id: crypto.randomUUID(),
      ownerId: input.owner.id,
      ownerEmail: input.owner.email,
      templateId: input.templateId,
      pluginName: input.pluginName,
      historyTitle: input.historyTitle,
      historyNote: input.historyNote,
      status: input.status ?? "draft",
      stage: input.stage ?? "design",
      progress: input.progress ?? 0,
      snapshot: input.snapshot ?? {},
      events: input.events ?? [],
      approval: { status: "not-requested" },
      deployment: {
        mode: input.deployment?.mode ?? "full",
        environment: input.deployment?.environment ?? "dev",
        scheduledFor: input.deployment?.scheduledFor,
        rollbackReady: input.deployment?.rollbackReady ?? false
      },
      createdAt: now,
      updatedAt: now
    };
    this.factoryJobs.set(job.id, job);
    return job;
  }

  async listFactoryJobs(ownerId?: string): Promise<VaultPluginFactoryJob[]> {
    return [...this.factoryJobs.values()]
      .filter((job) => !ownerId || job.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getFactoryJob(id: string): Promise<VaultPluginFactoryJob | undefined> {
    return this.factoryJobs.get(id);
  }

  async updateFactoryJob(
    id: string,
    input: UpdateVaultPluginFactoryJobInput,
    options: { expectedUpdatedAt?: string } = {}
  ): Promise<VaultPluginFactoryJob> {
    const current = this.factoryJobs.get(id);
    if (!current) throw new Error("Factory job not found");
    if (options.expectedUpdatedAt && current.updatedAt !== options.expectedUpdatedAt) {
      throw new Error("Factory job changed while saving");
    }
    const next: VaultPluginFactoryJob = {
      ...current,
      ...input,
      progress: Math.max(0, Math.min(100, input.progress ?? current.progress)),
      updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString()
    };
    this.factoryJobs.set(id, next);
    return next;
  }

  async deleteFactoryJob(id: string): Promise<VaultPluginFactoryJob> {
    const current = this.factoryJobs.get(id);
    if (!current) throw new Error("Factory job not found");
    this.factoryJobs.delete(id);
    return current;
  }

  private requireSystem(id: string): SystemSummary {
    const system = this.systems.get(id);
    if (!system) {
      throw new Error("System not found");
    }
    return system;
  }

  private requireUser(id: string): ManagedUser {
    const user = this.users.get(id);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  private requireRequest(id: string): AccessRequest {
    const request = this.requests.get(id);
    if (!request) {
      throw new Error("Request not found");
    }
    return request;
  }
}

function toManagedUser(user: PortalUser, index: number): ManagedUser {
  return {
    ...user,
    status: "active",
    authMode: "mock",
    mfaEnabled: user.roles.includes("vault-admin") || user.roles.includes("auditor"),
    passwordResetRequired: false,
    activeSessions: index === 0 ? 1 : 0,
    createdAt: new Date(Date.now() - (index + 4) * 24 * 60 * 60 * 1000).toISOString()
  };
}
