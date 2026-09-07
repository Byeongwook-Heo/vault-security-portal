import type {
  AccessRequest,
  AuditEvent,
  IssuedCredential,
  ManagedUser,
  PortalUser,
  RequestStatus,
  RequestType,
  SystemSummary,
  VaultPluginFactoryJob,
  CreateVaultPluginFactoryJobInput,
  UpdateVaultPluginFactoryJobInput
} from "@security-portal/shared";
import { Pool } from "pg";
import { seedSystems, seedUsers } from "./seed";
import type { CreateRequestInput, PortalStore, RequestUpdateFields } from "./types";

export class PostgresStore implements PortalStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    const { connectionString, sslRequired } = normalizeDatabaseUrl(databaseUrl);
    this.pool = new Pool({
      connectionString,
      ssl: sslRequired ? { rejectUnauthorized: false } : undefined
    });
  }

  async initialize(): Promise<void> {
    await this.migrate();
    await this.seed();
  }

  async getUserByEmail(email: string): Promise<PortalUser | undefined> {
    const result = await this.pool.query("select * from users where email = $1", [email]);
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async getUserById(id: string): Promise<PortalUser | undefined> {
    const result = await this.pool.query("select * from users where id = $1", [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async recordUserLogin(id: string): Promise<void> {
    await this.pool.query(
      "update users set last_login_at = now(), active_sessions = greatest(active_sessions, 1) where id = $1",
      [id]
    );
  }

  async listUsers(): Promise<ManagedUser[]> {
    const result = await this.pool.query("select * from users order by email asc");
    return result.rows.map(mapUser);
  }

  async updateUserAccess(
    id: string,
    input: Partial<Pick<ManagedUser, "groups" | "roles" | "status" | "mfaEnabled" | "passwordResetRequired">>
  ): Promise<ManagedUser> {
    const current = await this.getManagedUser(id);
    if (!current) {
      throw new Error("User not found");
    }
    const next = {
      groups: input.groups ?? current.groups,
      roles: input.roles ?? current.roles,
      status: input.status ?? current.status,
      mfaEnabled: input.mfaEnabled ?? current.mfaEnabled,
      passwordResetRequired: input.passwordResetRequired ?? current.passwordResetRequired
    };

    await this.pool.query(
      `update users set
        groups_json = $2,
        roles_json = $3,
        status = $4,
        mfa_enabled = $5,
        password_reset_required = $6
       where id = $1`,
      [
        id,
        JSON.stringify(next.groups),
        JSON.stringify(next.roles),
        next.status,
        next.mfaEnabled,
        next.passwordResetRequired
      ]
    );

    if (input.groups) {
      await this.pool.query("delete from user_groups where user_id = $1", [id]);
      for (const group of input.groups) {
        await this.pool.query("insert into groups (id, name) values ($1,$2) on conflict do nothing", [
          group,
          group
        ]);
        await this.pool.query("insert into user_groups (user_id, group_id) values ($1,$2) on conflict do nothing", [
          id,
          group
        ]);
      }
    }

    const updated = await this.getManagedUser(id);
    if (!updated) {
      throw new Error("User not found");
    }
    return updated;
  }

  async markUserPasswordReset(id: string): Promise<ManagedUser> {
    return this.updateUserAccess(id, { passwordResetRequired: true });
  }

  async listSystems(user: PortalUser): Promise<SystemSummary[]> {
    const systems = await this.fetchSystems();
    if (user.roles.includes("vault-admin") || user.roles.includes("auditor")) {
      return systems;
    }
    return systems.filter((system) => user.groups.includes(system.ownerGroup));
  }

  async getSystem(id: string): Promise<SystemSummary | undefined> {
    return (await this.fetchSystems()).find((system) => system.id === id);
  }

  async createRequest(input: CreateRequestInput): Promise<AccessRequest> {
    const system = await this.getSystem(input.systemId);
    if (!system) {
      throw new Error("System not found");
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `insert into requests (
        id, requester_id, requester_email, system_id, system_name, request_type, status, reason,
        risk_level, ttl, payload_json, approval_required, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        input.requester.id,
        input.requester.email,
        system.id,
        system.name,
        input.requestType,
        "pending",
        input.reason,
        input.riskLevel,
        input.ttl,
        JSON.stringify(input.payload),
        true,
        now
      ]
    );
    const request = await this.getRequest(id);
    if (!request) {
      throw new Error("Failed to create request");
    }
    return request;
  }

  async listRequests(): Promise<AccessRequest[]> {
    const result = await this.pool.query("select * from requests order by created_at desc");
    return result.rows.map(mapRequest);
  }

  async getRequest(id: string): Promise<AccessRequest | undefined> {
    const result = await this.pool.query("select * from requests where id = $1", [id]);
    return result.rows[0] ? mapRequest(result.rows[0]) : undefined;
  }

  async updateRequestStatus(
    id: string,
    status: RequestStatus,
    actor: PortalUser,
    fields: RequestUpdateFields = {}
  ): Promise<AccessRequest> {
    await this.pool.query(
      `update requests set
        status = $2,
        approved_by = case when $2 = 'approved' then $3 else approved_by end,
        rejected_by = case when $2 = 'rejected' then $3 else rejected_by end,
        approved_at = coalesce($4, approved_at),
        rejected_at = coalesce($5, rejected_at),
        executed_at = coalesce($6, executed_at),
        expires_at = coalesce($7, expires_at),
        ttl = coalesce($8, ttl),
        payload_json = coalesce($9::jsonb, payload_json)
       where id = $1`,
      [
        id,
        status,
        actor.email,
        fields.approvedAt ?? null,
        fields.rejectedAt ?? null,
        fields.executedAt ?? null,
        fields.expiresAt ?? null,
        fields.ttl ?? null,
        fields.payload ? JSON.stringify(fields.payload) : null
      ]
    );
    const request = await this.getRequest(id);
    if (!request) {
      throw new Error("Request not found");
    }
    return request;
  }

  async createCredential(input: Omit<IssuedCredential, "id" | "createdAt">): Promise<IssuedCredential> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `insert into issued_credentials (
        id, request_id, system_id, system_name, request_type, vault_mount, vault_role, vault_lease_id,
        ttl, expires_at, status, masked_display_value, metadata_json, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        input.requestId,
        input.systemId,
        input.systemName,
        input.requestType,
        input.vaultMount,
        input.vaultRole,
        input.vaultLeaseId,
        input.ttl,
        input.expiresAt,
        input.status,
        input.maskedDisplayValue,
        JSON.stringify(input.metadata),
        now
      ]
    );
    const credential = await this.getCredential(id);
    if (!credential) {
      throw new Error("Failed to create credential");
    }
    return credential;
  }

  async listCredentials(): Promise<IssuedCredential[]> {
    const result = await this.pool.query("select * from issued_credentials order by created_at desc");
    return result.rows.map(mapCredential);
  }

  async getCredential(id: string): Promise<IssuedCredential | undefined> {
    const result = await this.pool.query("select * from issued_credentials where id = $1", [id]);
    return result.rows[0] ? mapCredential(result.rows[0]) : undefined;
  }

  async markCredentialRevoked(id: string): Promise<IssuedCredential> {
    await this.pool.query(
      "update issued_credentials set status = 'revoked', revoked_at = $2 where id = $1",
      [id, new Date().toISOString()]
    );
    const credential = await this.getCredential(id);
    if (!credential) {
      throw new Error("Credential not found");
    }
    return credential;
  }

  async markCredentialRevokeFailed(id: string): Promise<IssuedCredential> {
    await this.pool.query("update issued_credentials set status = 'revoke_failed' where id = $1", [id]);
    const credential = await this.getCredential(id);
    if (!credential) {
      throw new Error("Credential not found");
    }
    return credential;
  }

  async createAuditEvent(input: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> {
    const id = crypto.randomUUID();
    await this.pool.query(
      `insert into audit_events (
        id, actor_id, actor_email, action, target_type, target_id, result, metadata_json, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        input.actorId,
        input.actorEmail,
        input.action,
        input.targetType,
        input.targetId,
        input.result,
        JSON.stringify(input.metadata),
        new Date().toISOString()
      ]
    );
    const events = await this.listAuditEvents();
    const event = events.find((item) => item.id === id);
    if (!event) {
      throw new Error("Failed to create audit event");
    }
    return event;
  }

  async listAuditEvents(): Promise<AuditEvent[]> {
    const result = await this.pool.query("select * from audit_events order by created_at desc");
    return result.rows.map(mapAuditEvent);
  }

  async createFactoryJob(input: CreateVaultPluginFactoryJobInput): Promise<VaultPluginFactoryJob> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const approval = { status: "not-requested" as const };
    const deployment = {
      mode: input.deployment?.mode ?? "full",
      environment: input.deployment?.environment ?? "dev",
      scheduledFor: input.deployment?.scheduledFor,
      rollbackReady: input.deployment?.rollbackReady ?? false
    };
    await this.pool.query(
      `insert into factory_jobs (
        id, owner_id, owner_email, template_id, plugin_name, history_title, history_note, status, stage, progress,
        snapshot_json, events_json, approval_json, deployment_json, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id,
        input.owner.id,
        input.owner.email,
        input.templateId ?? null,
        input.pluginName,
        input.historyTitle ?? null,
        input.historyNote ?? null,
        input.status ?? "draft",
        input.stage ?? "design",
        input.progress ?? 0,
        JSON.stringify(input.snapshot ?? {}),
        JSON.stringify(input.events ?? []),
        JSON.stringify(approval),
        JSON.stringify(deployment),
        now,
        now
      ]
    );
    const job = await this.getFactoryJob(id);
    if (!job) throw new Error("Failed to create Factory job");
    return job;
  }

  async listFactoryJobs(ownerId?: string): Promise<VaultPluginFactoryJob[]> {
    const result = ownerId
      ? await this.pool.query("select * from factory_jobs where owner_id = $1 order by updated_at desc limit 50", [ownerId])
      : await this.pool.query("select * from factory_jobs order by updated_at desc limit 100");
    return result.rows.map(mapFactoryJob);
  }

  async getFactoryJob(id: string): Promise<VaultPluginFactoryJob | undefined> {
    const result = await this.pool.query("select * from factory_jobs where id = $1", [id]);
    return result.rows[0] ? mapFactoryJob(result.rows[0]) : undefined;
  }

  async updateFactoryJob(
    id: string,
    input: UpdateVaultPluginFactoryJobInput,
    options: { expectedUpdatedAt?: string } = {}
  ): Promise<VaultPluginFactoryJob> {
    const current = await this.getFactoryJob(id);
    if (!current) throw new Error("Factory job not found");
    const next = {
      templateId: input.templateId ?? current.templateId,
      pluginName: input.pluginName ?? current.pluginName,
      historyTitle: input.historyTitle ?? current.historyTitle,
      historyNote: input.historyNote ?? current.historyNote,
      status: input.status ?? current.status,
      stage: input.stage ?? current.stage,
      progress: Math.max(0, Math.min(100, input.progress ?? current.progress)),
      snapshot: input.snapshot ?? current.snapshot,
      events: input.events ?? current.events,
      approval: input.approval ?? current.approval,
      deployment: input.deployment ?? current.deployment
    };
    const nextUpdatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
    const expectedUpdatedAtClause = options.expectedUpdatedAt
      ? "and date_trunc('milliseconds', updated_at) = $14::timestamptz"
      : "";
    const result = await this.pool.query(
      `update factory_jobs set
        template_id = $2,
        plugin_name = $3,
        history_title = $4,
        history_note = $5,
        status = $6,
        stage = $7,
        progress = $8,
        snapshot_json = $9,
        events_json = $10,
        approval_json = $11,
        deployment_json = $12,
        updated_at = $13
       where id = $1 ${expectedUpdatedAtClause}
       returning *`,
      [
        id,
        next.templateId ?? null,
        next.pluginName,
        next.historyTitle ?? null,
        next.historyNote ?? null,
        next.status,
        next.stage,
        next.progress,
        JSON.stringify(next.snapshot),
        JSON.stringify(next.events),
        JSON.stringify(next.approval),
        JSON.stringify(next.deployment),
        nextUpdatedAt,
        ...(options.expectedUpdatedAt ? [options.expectedUpdatedAt] : [])
      ]
    );
    if (!result.rows[0]) {
      if (options.expectedUpdatedAt) throw new Error("Factory job changed while saving");
      throw new Error("Factory job not found");
    }
    return mapFactoryJob(result.rows[0]);
  }

  async deleteFactoryJob(id: string): Promise<VaultPluginFactoryJob> {
    const result = await this.pool.query("delete from factory_jobs where id = $1 returning *", [id]);
    if (!result.rows[0]) throw new Error("Factory job not found");
    return mapFactoryJob(result.rows[0]);
  }

  private async fetchSystems(): Promise<SystemSummary[]> {
    const systemsResult = await this.pool.query("select * from systems order by name asc");
    const mappingsResult = await this.pool.query("select * from system_vault_mappings order by display_name asc");
    return systemsResult.rows.map((row) => {
      const mappings = mappingsResult.rows.filter((mapping) => mapping.system_id === row.id);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        environment: row.environment,
        ownerGroup: row.owner_group,
        allowedRequestTypes: row.allowed_request_types,
        vaultNamespace: row.vault_namespace,
        vaultMountMappings: mappings.map((mapping) => ({
          id: mapping.id,
          mountPath: mapping.mount_path,
          roleName: mapping.role_name,
          requestType: mapping.request_type,
          displayName: mapping.display_name,
          enabled: mapping.enabled
        }))
      } satisfies SystemSummary;
    });
  }

  private async migrate(): Promise<void> {
    await this.pool.query(`
      create table if not exists users (
        id text primary key,
        email text unique not null,
        display_name text not null,
        groups_json jsonb not null default '[]',
        roles_json jsonb not null default '[]',
        created_at timestamptz not null default now()
      );

      alter table users add column if not exists status text not null default 'active';
      alter table users add column if not exists auth_mode text not null default 'mock';
      alter table users add column if not exists mfa_enabled boolean not null default false;
      alter table users add column if not exists password_reset_required boolean not null default false;
      alter table users add column if not exists active_sessions integer not null default 0;
      alter table users add column if not exists last_login_at timestamptz;

      create table if not exists groups (
        id text primary key,
        name text unique not null
      );

      create table if not exists user_groups (
        user_id text not null references users(id),
        group_id text not null references groups(id),
        primary key (user_id, group_id)
      );

      create table if not exists systems (
        id text primary key,
        name text not null,
        description text not null,
        owner_group text not null,
        environment text not null,
        vault_namespace text not null,
        allowed_request_types jsonb not null default '[]',
        created_at timestamptz not null default now()
      );

      create table if not exists system_vault_mappings (
        id text primary key,
        system_id text not null references systems(id),
        mount_path text not null,
        role_name text not null,
        request_type text not null,
        display_name text not null,
        enabled boolean not null default true
      );

      create table if not exists requests (
        id text primary key,
        requester_id text not null,
        requester_email text not null,
        system_id text not null,
        system_name text not null,
        request_type text not null,
        status text not null,
        reason text not null,
        risk_level text not null,
        ttl text not null,
        payload_json jsonb not null default '{}',
        approval_required boolean not null default true,
        approved_by text,
        approved_at timestamptz,
        rejected_by text,
        rejected_at timestamptz,
        executed_at timestamptz,
        expires_at timestamptz,
        created_at timestamptz not null default now()
      );

      create table if not exists issued_credentials (
        id text primary key,
        request_id text not null,
        system_id text not null,
        system_name text not null,
        request_type text not null,
        vault_mount text not null,
        vault_role text not null,
        vault_lease_id text not null,
        ttl text not null,
        expires_at timestamptz not null,
        status text not null,
        masked_display_value text not null,
        metadata_json jsonb not null default '{}',
        created_at timestamptz not null default now(),
        revoked_at timestamptz
      );

      create table if not exists audit_events (
        id text primary key,
        actor_id text not null,
        actor_email text not null,
        action text not null,
        target_type text not null,
        target_id text not null,
        result text not null,
        metadata_json jsonb not null default '{}',
        created_at timestamptz not null default now()
      );

      create table if not exists notifications (
        id text primary key,
        request_id text not null,
        channel text not null,
        recipient text not null,
        status text not null,
        payload_json jsonb not null default '{}',
        created_at timestamptz not null default now()
      );

      create table if not exists factory_jobs (
        id text primary key,
        owner_id text not null,
        owner_email text not null,
        template_id text,
        plugin_name text not null,
        history_title text,
        history_note text,
        status text not null,
        stage text not null,
        progress integer not null default 0,
        snapshot_json jsonb not null default '{}',
        events_json jsonb not null default '[]',
        approval_json jsonb not null default '{"status":"not-requested"}',
        deployment_json jsonb not null default '{"mode":"full","environment":"dev","rollbackReady":false}',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists factory_jobs_owner_updated_idx on factory_jobs(owner_id, updated_at desc);

      alter table factory_jobs add column if not exists history_title text;
      alter table factory_jobs add column if not exists history_note text;
    `);
  }

  private async seed(): Promise<void> {
    const userCount = await this.pool.query("select count(*)::int as count from users");
    if (userCount.rows[0]?.count > 0) {
      return;
    }

    for (const user of seedUsers) {
      await this.pool.query(
        "insert into users (id, email, display_name, groups_json, roles_json) values ($1,$2,$3,$4,$5)",
        [user.id, user.email, user.displayName, JSON.stringify(user.groups), JSON.stringify(user.roles)]
      );
      for (const group of user.groups) {
        await this.pool.query("insert into groups (id, name) values ($1,$2) on conflict do nothing", [
          group,
          group
        ]);
        await this.pool.query("insert into user_groups (user_id, group_id) values ($1,$2) on conflict do nothing", [
          user.id,
          group
        ]);
      }
    }

    for (const system of seedSystems) {
      await this.pool.query(
        `insert into systems
          (id, name, description, owner_group, environment, vault_namespace, allowed_request_types)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          system.id,
          system.name,
          system.description,
          system.ownerGroup,
          system.environment,
          system.vaultNamespace,
          JSON.stringify(system.allowedRequestTypes)
        ]
      );
      for (const mapping of system.vaultMountMappings) {
        await this.pool.query(
          `insert into system_vault_mappings
            (id, system_id, mount_path, role_name, request_type, display_name, enabled)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            mapping.id,
            system.id,
            mapping.mountPath,
            mapping.roleName,
            mapping.requestType,
            mapping.displayName,
            mapping.enabled
          ]
        );
      }
    }
  }

  private async getManagedUser(id: string): Promise<ManagedUser | undefined> {
    const result = await this.pool.query("select * from users where id = $1", [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }
}

function normalizeDatabaseUrl(databaseUrl: string): { connectionString: string; sslRequired: boolean } {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");
  const sslRequired = sslMode === "require";
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return { connectionString: url.toString(), sslRequired };
}

function mapUser(row: Record<string, any>): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    groups: row.groups_json,
    roles: row.roles_json,
    status: row.status ?? "active",
    authMode: row.auth_mode ?? "mock",
    mfaEnabled: Boolean(row.mfa_enabled),
    passwordResetRequired: Boolean(row.password_reset_required),
    activeSessions: Number(row.active_sessions ?? 0),
    lastLoginAt: row.last_login_at?.toISOString?.() ?? row.last_login_at ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined
  };
}

function mapRequest(row: Record<string, any>): AccessRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    requesterEmail: row.requester_email,
    systemId: row.system_id,
    systemName: row.system_name,
    requestType: row.request_type as RequestType,
    status: row.status,
    reason: row.reason,
    riskLevel: row.risk_level,
    ttl: row.ttl,
    payload: row.payload_json ?? {},
    approvalRequired: row.approval_required,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at?.toISOString?.() ?? row.approved_at ?? undefined,
    rejectedBy: row.rejected_by ?? undefined,
    rejectedAt: row.rejected_at?.toISOString?.() ?? row.rejected_at ?? undefined,
    executedAt: row.executed_at?.toISOString?.() ?? row.executed_at ?? undefined,
    expiresAt: row.expires_at?.toISOString?.() ?? row.expires_at ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at
  };
}

function mapCredential(row: Record<string, any>): IssuedCredential {
  return {
    id: row.id,
    requestId: row.request_id,
    systemId: row.system_id,
    systemName: row.system_name,
    requestType: row.request_type as RequestType,
    vaultMount: row.vault_mount,
    vaultRole: row.vault_role,
    vaultLeaseId: row.vault_lease_id,
    ttl: row.ttl,
    expiresAt: row.expires_at?.toISOString?.() ?? row.expires_at,
    status: row.status,
    maskedDisplayValue: row.masked_display_value,
    metadata: row.metadata_json ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    revokedAt: row.revoked_at?.toISOString?.() ?? row.revoked_at ?? undefined
  };
}

function mapAuditEvent(row: Record<string, any>): AuditEvent {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    result: row.result,
    metadata: row.metadata_json ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at
  };
}

function mapFactoryJob(row: Record<string, any>): VaultPluginFactoryJob {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    templateId: row.template_id ?? undefined,
    pluginName: row.plugin_name,
    historyTitle: row.history_title ?? undefined,
    historyNote: row.history_note ?? undefined,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress ?? 0),
    snapshot: row.snapshot_json ?? {},
    events: row.events_json ?? [],
    approval: row.approval_json ?? { status: "not-requested" },
    deployment: row.deployment_json ?? {
      mode: "full",
      environment: "dev",
      rollbackReady: false
    },
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}
