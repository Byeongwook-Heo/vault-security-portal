import type {
  AccessRequest,
  BulkCredentialActionResult,
  BulkRequestResult,
  IssuedCredential,
  PortalUser,
  RequestType
} from "@security-portal/shared";
import type { PortalStore } from "../store/types";
import { redact } from "../utils/redact";
import type { VaultClient } from "../vault/vault-client";

export class WorkflowService {
  constructor(
    private readonly store: PortalStore,
    private readonly vault: VaultClient
  ) {}

  async createRequest(input: {
    actor: PortalUser;
    systemId: string;
    requestType: RequestType;
    reason: string;
    ttl: string;
    payload: Record<string, unknown>;
    riskLevel?: AccessRequest["riskLevel"];
  }): Promise<AccessRequest> {
    const system = (await this.store.listSystems(input.actor)).find((item) => item.id === input.systemId);
    if (!system) {
      throw new Error("Forbidden");
    }
    if (!system.allowedRequestTypes.includes(input.requestType)) {
      throw new Error("Request type is not allowed for this system");
    }
    const request = await this.store.createRequest({
      requester: input.actor,
      systemId: input.systemId,
      requestType: input.requestType,
      reason: input.reason,
      ttl: input.ttl,
      payload: redact(input.payload),
      riskLevel: input.riskLevel ?? "medium"
    });
    await this.audit(input.actor, "request.created", "request", request.id, "success", {
      request_type: request.requestType,
      system_id: request.systemId
    });
    return request;
  }

  async createRequests(
    actor: PortalUser,
    inputs: Array<{
      systemId: string;
      requestType: RequestType;
      reason: string;
      ttl: string;
      payload: Record<string, unknown>;
      riskLevel?: AccessRequest["riskLevel"];
    }>
  ): Promise<BulkRequestResult> {
    const created: AccessRequest[] = [];
    const failures: BulkRequestResult["failures"] = [];
    for (const [index, input] of inputs.entries()) {
      try {
        created.push(await this.createRequest({ actor, ...input }));
      } catch (error) {
        failures.push({ index, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { created, failures };
  }

  async approveRequest(
    actor: PortalUser,
    requestId: string,
    options: { ttl?: string; note?: string } = {}
  ): Promise<AccessRequest> {
    requireRole(actor, ["security-approver", "vault-admin", "app-owner"]);
    const current = await this.requireRequestInStatus(requestId, "pending");
    const payload = {
      ...current.payload,
      approval_type: options.note?.trim() ? "conditional" : "standard",
      ...(options.note?.trim() ? { approval_condition: options.note.trim() } : {})
    };
    const request = await this.store.updateRequestStatus(requestId, "approved", actor, {
      approvedAt: new Date().toISOString(),
      ttl: options.ttl ?? current.ttl,
      payload
    });
    await this.audit(actor, "request.approved", "request", request.id, "success", {
      requester: request.requesterEmail,
      approved_ttl: request.ttl,
      approval_condition: options.note?.trim() || undefined
    });
    return request;
  }

  async rejectRequest(actor: PortalUser, requestId: string, reason?: string): Promise<AccessRequest> {
    requireRole(actor, ["security-approver", "vault-admin", "app-owner"]);
    const current = await this.requireRequestInStatus(requestId, "pending");
    const request = await this.store.updateRequestStatus(requestId, "rejected", actor, {
      rejectedAt: new Date().toISOString(),
      payload: {
        ...current.payload,
        ...(reason?.trim() ? { rejection_reason: reason.trim() } : {})
      }
    });
    await this.audit(actor, "request.rejected", "request", request.id, "success", {
      requester: request.requesterEmail,
      rejection_reason: reason?.trim() || undefined
    });
    return request;
  }

  async executeRequest(actor: PortalUser, requestId: string): Promise<IssuedCredential> {
    const request = await this.store.getRequest(requestId);
    if (!request) {
      throw new Error("Request not found");
    }
    if (request.status !== "approved") {
      throw new Error("Only approved requests can be executed");
    }
    requireOwnerOrRole(actor, request.requesterId, ["security-approver", "vault-admin", "app-owner"]);
    const system = await this.store.getSystem(request.systemId);
    if (!system) {
      throw new Error("System not found");
    }
    const result = await this.vault.issueCredential(request, system);
    const mapping = system.vaultMountMappings.find((item) => item.requestType === request.requestType && item.enabled);
    const credential = await this.store.createCredential({
      requestId: request.id,
      systemId: system.id,
      systemName: system.name,
      requestType: request.requestType,
      vaultMount: mapping?.mountPath ?? String(result.metadata.vault_mount ?? "mock/"),
      vaultRole: mapping?.roleName ?? String(result.metadata.vault_role ?? "mock-role"),
      vaultLeaseId: result.leaseId,
      ttl: result.ttl,
      expiresAt: result.expiresAt,
      status: "active",
      maskedDisplayValue: result.maskedDisplayValue,
      metadata: redact(result.metadata)
    });
    await this.store.updateRequestStatus(request.id, "executed", actor, {
      executedAt: new Date().toISOString(),
      expiresAt: result.expiresAt
    });
    await this.audit(actor, "request.executed", "request", request.id, "success", {
      lease_id: result.leaseId,
      credential_id: credential.id
    });
    return credential;
  }

  async revokeCredential(actor: PortalUser, credentialId: string): Promise<IssuedCredential> {
    const credential = await this.store.getCredential(credentialId);
    if (!credential) {
      throw new Error("Credential not found");
    }
    if (credential.status !== "active" && credential.status !== "revoke_failed") {
      throw new Error("Only active or failed credentials can be revoked");
    }
    const request = await this.store.getRequest(credential.requestId);
    if (!request) {
      throw new Error("Request not found");
    }
    requireOwnerOrRole(actor, request.requesterId, ["security-approver", "vault-admin", "app-owner"]);
    const result = await this.vault.revokeLease(credential.vaultLeaseId);
    if (!result.revoked) {
      await this.store.markCredentialRevokeFailed(credential.id);
      await this.audit(actor, "credential.revoke_failed", "credential", credential.id, "failure", result.detail);
      throw new Error("Vault lease revoke failed");
    }
    const revoked = await this.store.markCredentialRevoked(credential.id);
    await this.audit(actor, "credential.revoked", "credential", credential.id, "success", {
      lease_id: credential.vaultLeaseId
    });
    return revoked;
  }

  async revokeCredentials(actor: PortalUser, credentialIds: string[]): Promise<BulkCredentialActionResult> {
    const revoked: IssuedCredential[] = [];
    const failures: BulkCredentialActionResult["failures"] = [];
    for (const credentialId of [...new Set(credentialIds)]) {
      try {
        revoked.push(await this.revokeCredential(actor, credentialId));
      } catch (error) {
        failures.push({ credentialId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { revoked, failures };
  }

  private async audit(
    actor: PortalUser,
    action: string,
    targetType: string,
    targetId: string,
    result: "success" | "failure",
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.store.createAuditEvent({
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      targetType,
      targetId,
      result,
      metadata: redact(metadata)
    });
  }

  private async requireRequestInStatus(requestId: string, status: AccessRequest["status"]): Promise<AccessRequest> {
    const request = await this.store.getRequest(requestId);
    if (!request) {
      throw new Error("Request not found");
    }
    if (request.status !== status) {
      throw new Error(`Only ${status} requests can be updated`);
    }
    return request;
  }
}

function requireRole(user: PortalUser, roles: PortalUser["roles"]): void {
  if (!roles.some((role) => user.roles.includes(role))) {
    throw new Error("Forbidden");
  }
}

function requireOwnerOrRole(user: PortalUser, ownerId: string, roles: PortalUser["roles"]): void {
  if (user.id !== ownerId && !roles.some((role) => user.roles.includes(role))) {
    throw new Error("Forbidden");
  }
}
