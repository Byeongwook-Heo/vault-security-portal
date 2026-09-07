"use client";

import {
  requestTypes,
  userRoles,
  userStatuses,
  type AccessRequest,
  type AuditEvent,
  type BulkCredentialActionResult,
  type BulkRequestResult,
  type IssuedCredential,
  type ManagedUser,
  type PortalUser,
  type RequestType,
  type UserRole,
  type UserStatus,
  type SystemSummary,
  type VaultPluginApplyResult,
  type VaultPluginAutoRepairResult,
  type VaultPluginCatalogRepairInspection,
  type VaultPluginCatalogRepairResult,
  type VaultPluginFactoryJob,
  type VaultPluginGenerateResult,
  type VaultPluginGeneratedFile,
  type VaultPluginMountInspectionResult,
  type VaultPluginMountRemovalResult,
  type VaultPluginRollbackResult,
  type VaultPluginRequirementField,
  type VaultPluginRequirements,
  type VaultPluginRequirementsInterview,
  type VaultPluginTemplate,
  type VaultPluginType,
  type VaultHealthStatus,
  type VaultInventory,
  type VaultLiveStatus,
  type VaultMappingHealth,
  type VaultReconciliationCheck,
  type VaultReconciliationItem,
  type VaultReconciliationReport
} from "@security-portal/shared";
import Link from "next/link";
import { type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  Boxes,
  CalendarClock,
  CheckCircle2,
  CircleStop,
  CircleGauge,
  ClipboardCopy,
  ClipboardCheck,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileDiff,
  Files,
  GitCompare,
  HeartPulse,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LogOut,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
  Moon,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  PlugZap,
  RefreshCw,
  Rocket,
  ScrollText,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Upload,
  Undo2,
  UserCheck,
  Users,
  Workflow,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from "lucide-react";
import { SavedViewControls, usePortalFilters } from "./portal-list-tools";

type View =
  | "dashboard"
  | "secrets"
  | "systems"
  | "requests"
  | "approvals"
  | "credentials"
  | "audit"
  | "health"
  | "plugins"
  | "users"
  | "admin";
type Language = "en" | "ko";
type Theme = "light" | "dark";
type DashboardStats = {
  systems: number;
  secretSurfaces: number;
  pending: number;
  active: number;
  failures: number;
  expiringSoon: number;
};
type VaultHealthResponse = VaultHealthStatus;
type GlobalSearchItem = {
  id: string;
  category: "system" | "request" | "credential";
  title: string;
  detail: string;
  href: string;
  keywords: string;
};
type PortalTask = {
  id: string;
  kind: "approval" | "request" | "expiry" | "failure";
  title: string;
  detail: string;
  href: string;
  dueAt?: string;
};
type PortalToast = {
  id: number;
  message: string;
  tone: "success" | "warning" | "danger" | "info";
};
type PortalAssistantAction = {
  type: "none" | "navigate";
  view?: View;
};
type PortalAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: PortalAssistantAction;
  error?: boolean;
};
type PortalAssistantResult = {
  reply: string;
  action: PortalAssistantAction;
  provider: "ollama" | "rules";
  model?: string;
  fallbackReason?: "disabled" | "misconfigured" | "unavailable" | "invalid-response";
  latencyMs: number;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const portalToastEvent = "security-portal:toast";

function notifyPortal(message: string, tone: PortalToast["tone"] = "info") {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(new CustomEvent(portalToastEvent, { detail: { message, tone } }));
}

const navItems: Array<{ view: View; href: string; icon: LucideIcon; roles?: UserRole[] }> = [
  { view: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { view: "secrets", href: "/secrets", icon: Database },
  { view: "systems", href: "/systems", icon: Boxes },
  { view: "requests", href: "/requests", icon: ClipboardCheck, roles: ["developer", "app-owner", "vault-admin"] },
  { view: "approvals", href: "/approvals", icon: ShieldCheck, roles: ["security-approver", "app-owner", "vault-admin"] },
  { view: "credentials", href: "/credentials", icon: KeyRound, roles: ["developer", "app-owner", "vault-admin"] },
  { view: "audit", href: "/audit", icon: ScrollText, roles: ["auditor", "vault-admin"] },
  { view: "health", href: "/health", icon: HeartPulse, roles: ["auditor", "vault-admin"] },
  { view: "plugins", href: "/plugins", icon: PlugZap },
  { view: "users", href: "/users", icon: Users, roles: ["vault-admin"] },
  { view: "admin", href: "/admin", icon: Wrench, roles: ["vault-admin"] }
];

function canUseNavItem(roles: UserRole[], item: (typeof navItems)[number]): boolean {
  return !item.roles || item.roles.some((role) => roles.includes(role));
}

function canUseView(roles: UserRole[], view: View): boolean {
  const item = navItems.find((candidate) => candidate.view === view);
  return item ? canUseNavItem(roles, item) : false;
}

const copy = {
  en: {
    brandTitle: "Security Portal",
    brandSubtitle: "Vault-backed self-service",
    topbarSubtitle: "Business workflow first. Vault paths and leases stay in advanced details.",
    languageLabel: "Language",
    loading: "Loading portal data...",
    nav: {
      dashboard: "Dashboard",
      secrets: "Secret Inventory",
      systems: "My Systems",
      requests: "Secret Request",
      approvals: "Approval Inbox",
      credentials: "Active Credentials",
      audit: "Audit Reports",
      health: "Platform Health",
      plugins: "Vault Plugin Factory",
      users: "User Management",
      admin: "Admin"
    },
    login: {
      eyebrow: "Vault-based workflow portal",
      title: "Security Self-Service Portal",
      description:
        "This test portal uses mock sign-in while Vault operations run through the connected private Vault cluster. Enterprise SSO remains adapter-ready."
    },
    dashboard: {
      title: "Security operations overview",
      description:
        "Short-lived credential activity, approval backlog, and Vault-backed secret surfaces across assigned systems.",
      modeLabel: "Current mode",
      modeValue: "Mock Vault",
      metrics: {
        systems: "My systems",
        mapped: "mapped secret surfaces",
        pending: "Pending approvals",
        waiting: "waiting for review",
        active: "Active credentials",
        expiring: "expire within 24h",
        failures: "Revocation failures",
        operator: "requires operator action"
      },
      posture: "Credential posture",
      activeIssued: "Active issued secrets",
      mappedRoles: "Mapped Vault roles",
      pendingApprovals: "Pending approvals",
      latest: "Latest issued secret",
      noIssued: "No issued credential yet.",
      recentIssuance: "Recent issuance history",
      recentWorkflow: "Recent workflow events",
      pendingQueue: "Pending request queue",
      distribution: "Secret type distribution",
      lifecycle: "Lifecycle posture",
      inventory: "Issued secret inventory",
      surfaces: "Vault-backed secret surfaces"
    },
    secrets: {
      title: "Vault Dependency Explorer",
      description: "Trace Vault relationships across namespaces, systems, mounts, roles, policies, and issued leases.",
      issued: "Issued",
      active: "Active",
      mapped: "Mapped",
      distribution: "Secret type distribution",
      lifecycle: "Lifecycle posture",
      pending: "Pending",
      revoked: "Revoked",
      failed: "Failed",
      noIssued: "No issued secrets yet.",
      inventory: "Issued secret inventory",
      surfaces: "Vault-backed secret surfaces",
      nodes: "Nodes",
      edges: "Edges",
      leases: "Leases",
      namespaces: "Namespaces",
      mounts: "Mounts",
      systems: "Systems",
      vaultCore: "Vault core",
      topology: "Dependency explorer",
      namespacePlane: "Namespace plane",
      leaseOrbit: "Lease orbit",
      pathFocus: "Primary dependency paths"
    },
    systems: {
      empty: "No systems assigned.",
      owner: "Owner group",
      allowed: "Allowed requests",
      advanced: "Advanced Vault details"
    },
    request: {
      title: "Request Wizard",
      targetSystem: "Target system",
      requestType: "Request type",
      reason: "Business reason",
      submit: "Submit request",
      defaultReason: "Temporary access for release validation"
    },
    approvals: {
      empty: "No requests yet.",
      advanced: "Advanced Vault details",
      approve: "Approve",
      reject: "Reject",
      execute: "Execute"
    },
    credentials: {
      empty: "No issued credentials.",
      expires: "expires",
      advanced: "Advanced Vault details",
      revoke: "Revoke"
    },
    audit: {
      title: "Business workflow audit"
    },
    admin: {
      health: "Vault integration health",
      catalog: "Plugin catalog",
      mappings: "System-to-Vault mappings",
      inspection: "Vault mapping inspection",
      yes: "yes",
      no: "no",
      unknown: "unknown"
    },
    table: {
      noData: "No data.",
      system: "System",
      type: "Type",
      status: "Status",
      ttl: "TTL",
      action: "Action",
      actor: "Actor",
      target: "Target",
      result: "Result",
      requester: "Requester",
      risk: "Risk",
      secretType: "Secret type",
      maskedValue: "Masked value",
      expires: "Expires",
      lease: "Lease",
      env: "Env",
      namespace: "Namespace",
      mount: "Mount",
      role: "Role",
      requestType: "Request type",
      time: "Time",
      mode: "Mode",
      healthy: "Healthy",
      version: "Version",
      cluster: "Cluster",
      plugin: "Plugin",
      reachable: "Reachable"
    }
  },
  ko: {
    brandTitle: "보안 포털",
    brandSubtitle: "Vault 기반 셀프서비스",
    topbarSubtitle: "업무 흐름을 먼저 보여주고, Vault 경로와 lease 정보는 상세 정보에서 확인합니다.",
    languageLabel: "언어",
    loading: "포털 데이터를 불러오는 중...",
    nav: {
      dashboard: "대시보드",
      secrets: "Secret 전체 현황",
      systems: "내 시스템",
      requests: "Secret 요청",
      approvals: "승인함",
      credentials: "활성 Credential",
      audit: "감사 리포트",
      health: "플랫폼 상태",
      plugins: "Vault Plugin Factory",
      users: "사용자 관리",
      admin: "관리"
    },
    login: {
      eyebrow: "Vault 기반 워크플로우 포털",
      title: "보안 셀프서비스 포털",
      description:
        "테스트 포털은 Mock 로그인을 사용하지만 Vault 작업은 연결된 프라이빗 Vault 클러스터에서 실행됩니다. Enterprise SSO는 어댑터 연동을 지원합니다."
    },
    dashboard: {
      title: "보안 운영 대시보드",
      description: "담당 시스템의 단기 Credential 발급, 승인 대기, Vault 기반 Secret Surface 상태를 한눈에 확인합니다.",
      modeLabel: "현재 모드",
      modeValue: "Mock Vault",
      metrics: {
        systems: "내 시스템",
        mapped: "개의 Secret Surface 매핑",
        pending: "승인 대기",
        waiting: "검토 대기 중",
        active: "활성 Credential",
        expiring: "개가 24시간 내 만료",
        failures: "폐기 실패",
        operator: "운영자 확인 필요"
      },
      posture: "Credential 상태",
      activeIssued: "활성 발급 Secret",
      mappedRoles: "매핑된 Vault Role",
      pendingApprovals: "승인 대기",
      latest: "최근 발급 Secret",
      noIssued: "아직 발급된 Credential이 없습니다.",
      recentIssuance: "최근 발급 이력",
      recentWorkflow: "최근 워크플로우 이벤트",
      pendingQueue: "승인 대기 큐",
      distribution: "Secret 유형 분포",
      lifecycle: "라이프사이클 상태",
      inventory: "발급 Secret 목록",
      surfaces: "Vault 기반 Secret Surface"
    },
    secrets: {
      title: "Vault Dependency Explorer",
      description: "Namespace, 시스템, Mount, Role, Policy, 발급 Lease의 Vault 의존 관계를 탐색합니다.",
      issued: "전체 발급",
      active: "활성",
      mapped: "매핑",
      distribution: "Secret 유형 분포",
      lifecycle: "라이프사이클 상태",
      pending: "대기",
      revoked: "폐기",
      failed: "실패",
      noIssued: "아직 발급된 Secret이 없습니다.",
      inventory: "발급 Secret 목록",
      surfaces: "Vault 기반 Secret Surface",
      nodes: "노드",
      edges: "연결",
      leases: "Lease",
      namespaces: "Namespace",
      mounts: "Mount",
      systems: "시스템",
      vaultCore: "Vault Core",
      topology: "Dependency Explorer",
      namespacePlane: "Namespace Plane",
      leaseOrbit: "Lease Orbit",
      pathFocus: "주요 의존 경로"
    },
    systems: {
      empty: "할당된 시스템이 없습니다.",
      owner: "소유 그룹",
      allowed: "허용 요청",
      advanced: "Vault 상세 정보"
    },
    request: {
      title: "요청 마법사",
      targetSystem: "대상 시스템",
      requestType: "요청 유형",
      reason: "업무 사유",
      submit: "요청 제출",
      defaultReason: "릴리스 검증을 위한 임시 접근"
    },
    approvals: {
      empty: "요청이 없습니다.",
      advanced: "Vault 상세 정보",
      approve: "승인",
      reject: "반려",
      execute: "실행"
    },
    credentials: {
      empty: "발급된 Credential이 없습니다.",
      expires: "만료",
      advanced: "Vault 상세 정보",
      revoke: "폐기"
    },
    audit: {
      title: "업무 워크플로우 감사"
    },
    admin: {
      health: "Vault 연동 상태",
      catalog: "Plugin 카탈로그",
      mappings: "시스템-Vault 매핑",
      inspection: "Vault 매핑 점검",
      yes: "예",
      no: "아니오",
      unknown: "알 수 없음"
    },
    table: {
      noData: "데이터가 없습니다.",
      system: "시스템",
      type: "유형",
      status: "상태",
      ttl: "TTL",
      action: "작업",
      actor: "사용자",
      target: "대상",
      result: "결과",
      requester: "요청자",
      risk: "위험도",
      secretType: "Secret 유형",
      maskedValue: "마스킹 값",
      expires: "만료",
      lease: "Lease",
      env: "환경",
      namespace: "Namespace",
      mount: "Mount",
      role: "Role",
      requestType: "요청 유형",
      time: "시간",
      mode: "모드",
      healthy: "정상",
      version: "버전",
      cluster: "클러스터",
      plugin: "Plugin",
      reachable: "연결"
    }
  }
} satisfies Record<Language, {
  brandTitle: string;
  brandSubtitle: string;
  topbarSubtitle: string;
  languageLabel: string;
  loading: string;
  nav: Record<View, string>;
  login: Record<"eyebrow" | "title" | "description", string>;
  dashboard: Record<string, string | Record<string, string>>;
  secrets: Record<string, string>;
  systems: Record<string, string>;
  request: Record<string, string>;
  approvals: Record<string, string>;
  credentials: Record<string, string>;
  audit: Record<string, string>;
  admin: Record<string, string>;
  table: Record<string, string>;
}>;

type Copy = (typeof copy)[Language];

export default function PortalShell({ view }: { view: View }) {
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [user, setUser] = useState<PortalUser | null>(null);
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [credentials, setCredentials] = useState<IssuedCredential[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [vaultHealth, setVaultHealth] = useState<VaultHealthResponse | null>(null);
  const [mappingHealth, setMappingHealth] = useState<VaultMappingHealth[]>([]);
  const [vaultInventory, setVaultInventory] = useState<VaultInventory | null>(null);
  const [vaultReconciliation, setVaultReconciliation] = useState<VaultReconciliationReport | null>(null);
  const [vaultSyncedAt, setVaultSyncedAt] = useState<string | null>(null);
  const [vaultSyncing, setVaultSyncing] = useState(false);
  const [vaultSyncError, setVaultSyncError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [portalAssistantOpen, setPortalAssistantOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [toast, setToast] = useState<PortalToast | null>(null);
  const vaultSyncInFlight = useRef(false);
  const t = copy[language];

  function setPortalLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("security-portal-language", nextLanguage);
      document.documentElement.lang = nextLanguage;
    }
  }

  function setPortalTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("security-portal-theme", nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    }
  }

  function setPortalSidebarCollapsed(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("security-portal-sidebar-collapsed", String(collapsed));
    }
  }

  const applyVaultStatus = useCallback((status: VaultLiveStatus) => {
    setVaultHealth(status.health);
    setMappingHealth(status.mappings);
    setVaultInventory(status.inventory ?? null);
    setVaultReconciliation(status.reconciliation ?? null);
    setVaultSyncedAt(status.syncedAt);
    setVaultSyncError(null);
  }, []);

  const refreshVaultStatus = useCallback(async (forceRefresh = false, showActivity = true) => {
    if (vaultSyncInFlight.current) return false;
    vaultSyncInFlight.current = true;
    if (showActivity) setVaultSyncing(true);
    try {
      const status = await api<VaultLiveStatus>(`/vault/status${forceRefresh ? "?refresh=true" : ""}`);
      applyVaultStatus(status);
      return true;
    } catch (err) {
      setVaultSyncError(err instanceof Error ? err.message : "Unable to synchronize Vault status");
      return false;
    } finally {
      vaultSyncInFlight.current = false;
      if (showActivity) setVaultSyncing(false);
    }
  }, [applyVaultStatus]);

  async function refresh() {
    setError(null);
    if (!user) {
      setLoading(true);
    }
    try {
      const me = await api<{ user: PortalUser }>("/auth/me");
      setUser(me.user);
      const [systemsResponse, requestsResponse, credentialsResponse, auditResponse] = await Promise.all([
        api<{ systems: SystemSummary[] }>("/systems"),
        api<{ requests: AccessRequest[] }>("/requests"),
        api<{ credentials: IssuedCredential[] }>("/credentials"),
        api<{ auditEvents: AuditEvent[] }>("/audit-events")
      ]);
      setSystems(systemsResponse.systems);
      setRequests(requestsResponse.requests);
      setCredentials(credentialsResponse.credentials);
      setAuditEvents(auditResponse.auditEvents);

      await refreshVaultStatus(false, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load portal data";
      if (message.includes("401")) {
        setUser(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshVaultStatus(false, false);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshVaultStatus(false, false);
      }
    }, 15_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshVaultStatus(false, false);
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshVaultStatus, user?.id]);

  useEffect(() => {
    const storedLanguage =
      typeof window !== "undefined" ? window.localStorage.getItem("security-portal-language") : null;
    if (storedLanguage === "en" || storedLanguage === "ko") {
      setLanguage(storedLanguage);
      document.documentElement.lang = storedLanguage;
    }

    const storedTheme = typeof window !== "undefined" ? window.localStorage.getItem("security-portal-theme") : null;
    const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme: Theme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : prefersDark ? "dark" : "light";
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;

    setSidebarCollapsed(window.localStorage.getItem("security-portal-sidebar-collapsed") === "true");
  }, []);

  useEffect(() => {
    function showPortalToast(event: Event) {
      const detail = (event as CustomEvent<Omit<PortalToast, "id">>).detail;
      if (!detail?.message) return;
      setToast({ ...detail, id: Date.now() });
    }

    window.addEventListener(portalToastEvent, showPortalToast);
    return () => window.removeEventListener(portalToastEvent, showPortalToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => current?.id === toast.id ? null : current);
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setMobileNavOpen(false);
    setGlobalSearchOpen(false);
    setTaskCenterOpen(false);
    setPortalAssistantOpen(false);
    setMobileToolsOpen(false);
  }, [view]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        setGlobalSearchOpen(false);
        setTaskCenterOpen(false);
        setPortalAssistantOpen(false);
        setMobileToolsOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setTaskCenterOpen(false);
        setMobileToolsOpen(false);
        setGlobalSearchOpen(true);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.toggle("navDrawerOpen", mobileNavOpen);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("navDrawerOpen");
    };
  }, [mobileNavOpen]);

  async function login(email: string) {
    setError(null);
    setLoading(true);
    try {
      await api("/auth/mock-login", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
      setLoading(false);
    }
  }

  async function logout() {
    setError(null);
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setSystems([]);
      setRequests([]);
      setCredentials([]);
      setAuditEvents([]);
      setVaultHealth(null);
      setMappingHealth([]);
      setVaultInventory(null);
      setVaultReconciliation(null);
      setVaultSyncedAt(null);
      setVaultSyncError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out");
    }
  }

  const stats = useMemo(
    () => ({
      systems: systems.length,
      secretSurfaces: systems.reduce((count, system) => count + system.vaultMountMappings.length, 0),
      pending: requests.filter((request) => request.status === "pending").length,
      active: credentials.filter((credential) => credential.status === "active").length,
      failures: credentials.filter((credential) => credential.status === "revoke_failed").length,
      expiringSoon: credentials.filter((credential) => {
        if (credential.status !== "active") return false;
        const expiresAt = new Date(credential.expiresAt).getTime();
        return expiresAt > Date.now() && expiresAt - Date.now() < 24 * 60 * 60 * 1000;
      }).length
    }),
    [systems, requests, credentials]
  );

  const globalSearchItems = useMemo<GlobalSearchItem[]>(() => {
    const requestView = user && canUseView(user.roles, "approvals")
      ? "approvals"
      : "requests";
    const credentialView = user && canUseView(user.roles, "credentials") ? "credentials" : "secrets";
    return [
      ...systems.map((system) => ({
        id: `system-${system.id}`,
        category: "system" as const,
        title: system.name,
        detail: `${system.environment} · ${system.ownerGroup} · ${system.vaultNamespace}`,
        href: `/systems?q=${encodeURIComponent(system.name)}`,
        keywords: `${system.name} ${system.description} ${system.environment} ${system.ownerGroup} ${system.vaultNamespace}`.toLowerCase()
      })),
      ...requests.map((request) => ({
        id: `request-${request.id}`,
        category: "request" as const,
        title: request.systemName,
        detail: `${request.requestType} · ${request.status} · ${request.requesterEmail}`,
        href: `/${requestView}?q=${encodeURIComponent(request.systemName)}&status=${request.status}`,
        keywords: `${request.systemName} ${request.requestType} ${request.status} ${request.requesterEmail} ${request.reason}`.toLowerCase()
      })),
      ...credentials.map((credential) => ({
        id: `credential-${credential.id}`,
        category: "credential" as const,
        title: credential.systemName,
        detail: `${credential.requestType} · ${credential.status} · ${shortId(credential.vaultLeaseId)}`,
        href: `/${credentialView}?q=${encodeURIComponent(credential.systemName)}&status=${credential.status}`,
        keywords: `${credential.systemName} ${credential.requestType} ${credential.status} ${credential.vaultMount} ${credential.vaultRole} ${credential.vaultLeaseId}`.toLowerCase()
      }))
    ];
  }, [credentials, requests, systems, user]);

  const portalTasks = useMemo<PortalTask[]>(() => {
    if (!user) return [];
    const canReview = canUseView(user.roles, "approvals");
    const canOpenCredentials = canUseView(user.roles, "credentials");
    const requestRoute = canReview ? "/approvals" : "/requests";
    const credentialRoute = canOpenCredentials ? "/credentials" : "/secrets";
    const requestTasks = requests
      .filter((request) => request.status === "pending" && (canReview || request.requesterId === user.id))
      .map((request) => {
        const slaHours = request.riskLevel === "high" ? 1 : request.riskLevel === "medium" ? 4 : 8;
        return {
          id: `request-${request.id}`,
          kind: canReview ? ("approval" as const) : ("request" as const),
          title: request.systemName,
          detail: `${request.requestType} · ${request.riskLevel}`,
          href: `${requestRoute}?q=${encodeURIComponent(request.systemName)}&status=pending`,
          dueAt: new Date(new Date(request.createdAt).getTime() + slaHours * 60 * 60 * 1000).toISOString()
        };
      });
    const credentialTasks = credentials.flatMap<PortalTask>((credential) => {
      if (credential.status === "revoke_failed") {
        return [
          {
            id: `failure-${credential.id}`,
            kind: "failure",
            title: credential.systemName,
            detail: `${credential.requestType} · ${localize(t, "Revoke retry required", "폐기 재시도 필요")}`,
            href: `${credentialRoute}?q=${encodeURIComponent(credential.systemName)}&status=revoke_failed`
          }
        ];
      }
      const expiresAt = new Date(credential.expiresAt).getTime();
      if (credential.status === "active" && expiresAt > Date.now() && expiresAt - Date.now() <= 24 * 60 * 60 * 1000) {
        return [
          {
            id: `expiry-${credential.id}`,
            kind: "expiry",
            title: credential.systemName,
            detail: `${credential.requestType} · ${localize(t, "Expires soon", "만료 임박")}`,
            href: `${credentialRoute}?q=${encodeURIComponent(credential.systemName)}&status=active`,
            dueAt: credential.expiresAt
          }
        ];
      }
      return [];
    });
    const reconciliationTasks = user.roles.includes("vault-admin")
      ? (vaultReconciliation?.items ?? [])
          .filter((item) => item.status === "drift")
          .slice(0, 8)
          .map<PortalTask>((item) => ({
            id: `vault-drift-${item.id}`,
            kind: "failure",
            title: item.systemName ?? item.pluginName ?? item.title,
            detail: localize(t, `Vault drift · ${item.title}`, `Vault 불일치 · ${item.title}`),
            href: `/admin#${reconciliationAnchor(item.id)}`
          }))
      : [];
    return [...reconciliationTasks, ...credentialTasks, ...requestTasks]
      .sort((left, right) => (left.dueAt ?? "").localeCompare(right.dueAt ?? ""))
      .slice(0, 30);
  }, [credentials, requests, t, user, vaultReconciliation]);

  if (!user) {
    return (
      <LoginScreen
        onLogin={login}
        error={error}
        language={language}
        loading={loading}
        setLanguage={setPortalLanguage}
        setTheme={setPortalTheme}
        theme={theme}
        t={t}
      />
    );
  }

  const visibleNavItems = navItems.filter((item) => canUseNavItem(user.roles, item));
  const canAccessView = visibleNavItems.some((item) => item.view === view);
  const vaultStatusTone = vaultSyncError ? "danger" : vaultHealth?.healthy ? "success" : vaultHealth ? "danger" : "neutral";
  const vaultStatusLabel = vaultSyncError
    ? localize(t, "Vault sync delayed", "Vault 동기화 지연")
    : vaultHealth
      ? vaultHealth.healthy
        ? localize(t, "Vault connected · Live", "Vault 연결됨 · Live")
        : localize(t, "Vault needs attention", "Vault 확인 필요")
      : localize(t, "Checking Vault status", "Vault 상태 확인 중");

  const ToastIcon = toast?.tone === "success" ? CheckCircle2 : toast?.tone === "info" ? Activity : AlertTriangle;

  function openPortalAssistant() {
    setGlobalSearchOpen(false);
    setTaskCenterOpen(false);
    setMobileToolsOpen(false);
    if (view === "plugins") {
      window.requestAnimationFrame(() => {
        const input = document.getElementById("factory-chat-input");
        input?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "center"
        });
        input?.focus({ preventScroll: true });
      });
      return;
    }
    setPortalAssistantOpen(true);
  }

  return (
    <div className={`shell view-${view}${mobileNavOpen ? " navOpen" : ""}${sidebarCollapsed ? " sidebarCollapsed" : ""}`} data-view={view}>
      <aside className={mobileNavOpen ? "sidebar open" : "sidebar"} aria-label={localize(t, "Primary navigation", "주요 메뉴")}>
        <div className="sidebarHeader">
          <Link href="/dashboard" className="brand" aria-label="Go to dashboard">
            <span className="brandMark">V</span>
            <div>
              <strong>Vault</strong>
              <small>{t.brandTitle}</small>
            </div>
          </Link>
          <button
            aria-controls="portal-navigation"
            aria-expanded={mobileNavOpen}
            aria-label={localize(t, mobileNavOpen ? "Close navigation" : "Open navigation", mobileNavOpen ? "메뉴 닫기" : "메뉴 열기")}
            className="mobileNavToggle"
            onClick={() => setMobileNavOpen((current) => !current)}
            title={localize(t, mobileNavOpen ? "Close navigation" : "Open navigation", mobileNavOpen ? "메뉴 닫기" : "메뉴 열기")}
            type="button"
          >
            <X aria-hidden="true" size={20} strokeWidth={2} />
          </button>
        </div>
        <nav id="portal-navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.view}
                href={item.href}
                className={view === item.view ? "active" : ""}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
                <span>{t.nav[item.view]}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebarFooter">
          <span className={`sidebarStatusDot ${vaultStatusTone}`} aria-hidden="true" />
          <div>
            <strong>Vault</strong>
            <small>{vaultStatusLabel}</small>
          </div>
        </div>
        <button
          aria-label={localize(t, sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar", sidebarCollapsed ? "Sidebar 펼치기" : "Sidebar 접기")}
          aria-pressed={sidebarCollapsed}
          className="sidebarCollapseButton"
          onClick={() => setPortalSidebarCollapsed(!sidebarCollapsed)}
          title={localize(t, sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar", sidebarCollapsed ? "Sidebar 펼치기" : "Sidebar 접기")}
          type="button"
        >
          {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" size={16} /> : <PanelLeftClose aria-hidden="true" size={16} />}
          <span>{localize(t, sidebarCollapsed ? "Expand" : "Collapse", sidebarCollapsed ? "펼치기" : "접기")}</span>
        </button>
      </aside>

      <button
        aria-hidden={!mobileNavOpen}
        aria-label={localize(t, "Close navigation", "메뉴 닫기")}
        className="navBackdrop"
        onClick={() => setMobileNavOpen(false)}
        tabIndex={mobileNavOpen ? 0 : -1}
        type="button"
      />

      <main className="main">
        <header className="topbar">
          <div className="topbarTitle">
            <button
              aria-controls="portal-navigation"
              aria-expanded={mobileNavOpen}
              aria-label={localize(t, "Open navigation", "메뉴 열기")}
              className="mobileNavTrigger iconButton"
              onClick={() => setMobileNavOpen(true)}
              title={localize(t, "Open navigation", "메뉴 열기")}
              type="button"
            >
              <Menu aria-hidden="true" size={20} />
            </button>
            <div>
              <h1>{t.nav[view]}</h1>
              <StatusIndicator label={vaultStatusLabel} tone={vaultStatusTone} />
            </div>
          </div>
          <div className="topbarTools">
            <a
              aria-label={localize(t, "Open Vault UI in a new tab", "새 탭에서 Vault UI 열기")}
              className="topbarAction vaultUiLink desktopUtility"
              href="/ui/"
              rel="noopener noreferrer"
              target="_blank"
              title={localize(t, "Open Vault UI", "Vault UI 열기")}
            >
              <ExternalLink aria-hidden="true" size={17} />
              <span>Vault UI</span>
            </a>
            <button
              aria-controls={view === "plugins" ? "factory-chat-input" : "portal-ai-drawer"}
              aria-expanded={view === "plugins" ? undefined : portalAssistantOpen}
              aria-haspopup={view === "plugins" ? undefined : "dialog"}
              aria-label={view === "plugins"
                ? localize(t, "Focus the Factory AI chat", "Factory AI 채팅으로 이동")
                : localize(t, "Open AI Assistant", "AI Assistant 열기")}
              className="topbarAction portalAssistantTrigger"
              onClick={openPortalAssistant}
              title={view === "plugins"
                ? localize(t, "Factory AI chat", "Factory AI 채팅")
                : "AI Assistant"}
              type="button"
            >
              <MessageSquare aria-hidden="true" size={17} />
              <span>AI</span>
            </button>
            <button
              aria-expanded={globalSearchOpen}
              aria-haspopup="dialog"
              aria-label={localize(t, "Search systems, requests, and credentials", "시스템, 요청, Credential 통합 검색")}
              className="topbarAction globalSearchTrigger desktopUtility"
              onClick={() => {
                setTaskCenterOpen(false);
                setPortalAssistantOpen(false);
                setMobileToolsOpen(false);
                setGlobalSearchOpen(true);
              }}
              title={localize(t, "Global search", "통합 검색")}
              type="button"
            >
              <Search aria-hidden="true" size={18} />
              <span>{localize(t, "Search", "검색")}</span>
              <kbd>⌘K</kbd>
            </button>
            <button
              aria-expanded={taskCenterOpen}
              aria-haspopup="dialog"
              aria-label={localize(t, "Open my work queue", "내 작업함 열기")}
              className="iconButton topbarAction taskCenterTrigger desktopUtility"
              onClick={() => {
                setGlobalSearchOpen(false);
                setPortalAssistantOpen(false);
                setMobileToolsOpen(false);
                setTaskCenterOpen(true);
              }}
              title={localize(t, "My work queue", "내 작업함")}
              type="button"
            >
              <Bell aria-hidden="true" size={18} />
              <span className="topbarActionLabel">{localize(t, "Work", "작업")}</span>
              {portalTasks.length ? <span className="actionBadge">{Math.min(portalTasks.length, 99)}</span> : null}
            </button>
            <div className="languageSwitch desktopUtility" aria-label={t.languageLabel}>
              <button aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setPortalLanguage("en")}>
                EN
              </button>
              <button aria-pressed={language === "ko"} className={language === "ko" ? "active" : ""} onClick={() => setPortalLanguage("ko")}>
                한글
              </button>
            </div>
            <button
              aria-label={localize(t, theme === "light" ? "Use dark theme" : "Use light theme", theme === "light" ? "다크 테마 사용" : "라이트 테마 사용")}
              className="iconButton themeToggle"
              onClick={() => setPortalTheme(theme === "light" ? "dark" : "light")}
              title={localize(t, theme === "light" ? "Use dark theme" : "Use light theme", theme === "light" ? "다크 테마 사용" : "라이트 테마 사용")}
              type="button"
            >
              {theme === "light" ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
            </button>
            <div className="mobileTools">
              <button
                aria-controls="mobile-utility-menu"
                aria-expanded={mobileToolsOpen}
                aria-haspopup="menu"
                aria-label={localize(t, "Open portal tools", "포탈 도구 열기")}
                className="iconButton mobileToolsTrigger"
                onClick={() => setMobileToolsOpen((current) => !current)}
                title={localize(t, "Portal tools", "포탈 도구")}
                type="button"
              >
                <MoreHorizontal aria-hidden="true" size={19} />
              </button>
              {mobileToolsOpen ? (
                <>
                  <button
                    aria-label={localize(t, "Close portal tools", "포탈 도구 닫기")}
                    className="mobileToolsBackdrop"
                    onClick={() => setMobileToolsOpen(false)}
                    type="button"
                  />
                  <div className="mobileToolsMenu" id="mobile-utility-menu" role="menu">
                    <div className="mobileToolsIdentity">
                      <span className="userAvatar" aria-hidden="true">{(user?.displayName ?? "V").slice(0, 1).toUpperCase()}</span>
                      <span>
                        <strong>{user?.displayName ?? t.loading}</strong>
                        <small>{user?.roles.join(", ")}</small>
                      </span>
                    </div>
                    <a href="/ui/" onClick={() => setMobileToolsOpen(false)} rel="noopener noreferrer" role="menuitem" target="_blank">
                      <ExternalLink aria-hidden="true" size={17} />
                      <span>{localize(t, "Open Vault UI", "Vault UI 열기")}</span>
                    </a>
                    <button
                      onClick={() => {
                        setMobileToolsOpen(false);
                        setTaskCenterOpen(false);
                        setPortalAssistantOpen(false);
                        setGlobalSearchOpen(true);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Search aria-hidden="true" size={17} />
                      <span>{localize(t, "Global search", "통합 검색")}</span>
                    </button>
                    <button
                      onClick={() => {
                        setMobileToolsOpen(false);
                        setGlobalSearchOpen(false);
                        setPortalAssistantOpen(false);
                        setTaskCenterOpen(true);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Bell aria-hidden="true" size={17} />
                      <span>{localize(t, "My work queue", "내 작업함")}</span>
                      {portalTasks.length ? <em>{Math.min(portalTasks.length, 99)}</em> : null}
                    </button>
                    <div aria-label={t.languageLabel} className="mobileToolsLanguage" role="group">
                      <button aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setPortalLanguage("en")} type="button">EN</button>
                      <button aria-pressed={language === "ko"} className={language === "ko" ? "active" : ""} onClick={() => setPortalLanguage("ko")} type="button">한글</button>
                    </div>
                    <button className="mobileLogout" onClick={() => void logout()} role="menuitem" type="button">
                      <LogOut aria-hidden="true" size={17} />
                      <span>{localize(t, "Sign out", "로그아웃")}</span>
                    </button>
                  </div>
                </>
              ) : null}
            </div>
            <div className="userBadge desktopUtility">
              <span className="userAvatar" aria-hidden="true">{(user?.displayName ?? "V").slice(0, 1).toUpperCase()}</span>
              <div>
                <span>{user?.displayName ?? t.loading}</span>
                <small>{user?.roles.join(", ")}</small>
              </div>
              <button
                aria-label={localize(t, "Sign out", "로그아웃")}
                className="iconButton"
                onClick={() => void logout()}
                title={localize(t, "Sign out", "로그아웃")}
                type="button"
              >
                <LogOut aria-hidden="true" size={17} />
              </button>
            </div>
          </div>
        </header>

        {globalSearchOpen ? (
          <GlobalSearchDialog
            items={globalSearchItems}
            onClose={() => setGlobalSearchOpen(false)}
            t={t}
          />
        ) : null}
        {taskCenterOpen ? (
          <TaskCenterDrawer
            onClose={() => setTaskCenterOpen(false)}
            tasks={portalTasks}
            t={t}
          />
        ) : null}
        {portalAssistantOpen && view !== "plugins" ? (
          <PortalAssistantDrawer
            key={`${language}-${view}`}
            language={language}
            onClose={() => setPortalAssistantOpen(false)}
            t={t}
            vaultStatusLabel={vaultStatusLabel}
            vaultStatusTone={vaultStatusTone}
            view={view}
          />
        ) : null}

        {error ? <PortalState detail={error} kind="error" title={localize(t, "Unable to load this view", "화면을 불러오지 못했습니다")} /> : null}
        {loading ? <PortalState kind="loading" title={t.loading} /> : null}
        {!loading && !canAccessView ? (
          <PortalState
            action={{ href: "/dashboard", label: localize(t, "Return to dashboard", "Dashboard로 이동") }}
            detail={localize(t, "Your current role does not include this workspace.", "현재 역할에는 이 업무 화면의 접근 권한이 없습니다.")}
            kind="permission"
            title={localize(t, "Access restricted", "접근 권한이 없습니다")}
          />
        ) : null}

        <div className="pageSurface" key={view}>
        {!loading && canAccessView && view === "dashboard" ? (
          <Dashboard
            currentUser={user}
            t={t}
            stats={stats}
            systems={systems}
            requests={requests}
            credentials={credentials}
            auditEvents={auditEvents}
            mappingHealth={mappingHealth}
            vaultHealth={vaultHealth}
          />
        ) : null}
        {!loading && canAccessView && view === "secrets" ? (
          <SecretInventory t={t} systems={systems} requests={requests} credentials={credentials} mappingHealth={mappingHealth} />
        ) : null}
        {!loading && canAccessView && view === "systems" ? <Systems t={t} systems={systems} mappingHealth={mappingHealth} /> : null}
        {!loading && canAccessView && view === "requests" ? (
          <RequestForm currentUser={user} requests={requests} t={t} systems={systems} onChanged={refresh} />
        ) : null}
        {!loading && canAccessView && view === "approvals" ? (
          <Approvals t={t} currentUser={user} requests={requests} auditEvents={auditEvents} onChanged={refresh} />
        ) : null}
        {!loading && canAccessView && view === "credentials" ? (
          <Credentials t={t} currentUser={user} credentials={credentials} requests={requests} onChanged={refresh} />
        ) : null}
        {!loading && canAccessView && view === "audit" ? <Audit t={t} events={auditEvents} /> : null}
        {!loading && canAccessView && view === "health" ? (
          <PlatformHealth
            t={t}
            vaultHealth={vaultHealth}
            mappingHealth={mappingHealth}
            inventory={vaultInventory}
            reconciliation={vaultReconciliation}
            syncedAt={vaultSyncedAt}
            syncing={vaultSyncing}
            syncError={vaultSyncError}
            onRefresh={() => void refreshVaultStatus(true)}
          />
        ) : null}
        {!loading && canAccessView && view === "plugins" ? <PluginFactory t={t} currentUser={user} onChanged={refresh} /> : null}
        {!loading && canAccessView && view === "users" ? (
          <UserManagement t={t} currentUser={user} systems={systems} auditEvents={auditEvents} onChanged={refresh} />
        ) : null}
        {!loading && canAccessView && view === "admin" ? (
          <Admin
            t={t}
            systems={systems}
            vaultHealth={vaultHealth}
            mappingHealth={mappingHealth}
            inventory={vaultInventory}
            reconciliation={vaultReconciliation}
            syncedAt={vaultSyncedAt}
            syncing={vaultSyncing}
            syncError={vaultSyncError}
            onRefresh={() => void refreshVaultStatus(true)}
          />
        ) : null}
        </div>
        {toast ? (
          <div aria-live="polite" className={`portalToast ${toast.tone}`} role={toast.tone === "danger" ? "alert" : "status"}>
            <ToastIcon aria-hidden="true" size={18} />
            <span>{toast.message}</span>
            <button aria-label={localize(t, "Dismiss notification", "알림 닫기")} onClick={() => setToast(null)} type="button">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function PortalOverlay({
  children,
  className = "",
  onDismiss
}: {
  children: ReactNode;
  className?: string;
  onDismiss: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(overlayRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(overlayRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div className={`portalOverlay ${className}`} onMouseDown={(event) => event.target === event.currentTarget && onDismiss()} ref={overlayRef}>
      {children}
    </div>,
    document.body
  );
}

function GlobalSearchDialog({
  t,
  items,
  onClose
}: {
  t: Copy;
  items: GlobalSearchItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const inputRef = useRef<HTMLInputElement>(null);
  const results = deferredQuery
    ? items.filter((item) => `${item.title} ${item.detail} ${item.keywords}`.toLowerCase().includes(deferredQuery)).slice(0, 18)
    : items.slice(0, 9);
  const labels: Record<GlobalSearchItem["category"], string> = {
    system: localize(t, "System", "시스템"),
    request: localize(t, "Request", "요청"),
    credential: "Credential"
  };
  const icons: Record<GlobalSearchItem["category"], LucideIcon> = {
    system: Boxes,
    request: ClipboardCheck,
    credential: KeyRound
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <PortalOverlay onDismiss={onClose}>
      <section aria-label={localize(t, "Global search", "통합 검색")} aria-modal="true" className="globalSearchDialog" role="dialog">
        <div className="globalSearchInput">
          <Search aria-hidden="true" size={19} />
          <input
            aria-label={localize(t, "Search portal resources", "포탈 리소스 검색")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={localize(t, "Search system, request, credential", "시스템, 요청, Credential 검색")}
            ref={inputRef}
            value={query}
          />
          <button aria-label={localize(t, "Close search", "검색 닫기")} className="iconButton" onClick={onClose} title={localize(t, "Close", "닫기")} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="globalSearchResults">
          {results.map((item) => {
            const Icon = icons[item.category];
            return (
              <Link href={item.href} key={item.id} onClick={onClose}>
                <span className={`searchResultIcon ${item.category}`}><Icon aria-hidden="true" size={17} /></span>
                <span>
                  <small>{labels[item.category]}</small>
                  <strong>{item.title}</strong>
                  <em>{item.detail}</em>
                </span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            );
          })}
          {results.length === 0 ? (
            <div className="empty compact">{localize(t, "No matching resource.", "일치하는 리소스가 없습니다.")}</div>
          ) : null}
        </div>
      </section>
    </PortalOverlay>
  );
}

function TaskCenterDrawer({
  t,
  tasks,
  onClose
}: {
  t: Copy;
  tasks: PortalTask[];
  onClose: () => void;
}) {
  return (
    <PortalOverlay className="taskOverlay" onDismiss={onClose}>
      <aside aria-label={localize(t, "My work queue", "내 작업함")} aria-modal="true" className="taskCenterDrawer" role="dialog">
        <header>
          <div>
            <span>{localize(t, "Work queue", "업무 대기열")}</span>
            <h2>{localize(t, "My work queue", "내 작업함")}</h2>
          </div>
          <div className="taskDrawerHeaderActions">
            <strong>{tasks.length}</strong>
            <button aria-label={localize(t, "Close work queue", "작업함 닫기")} className="iconButton" onClick={onClose} title={localize(t, "Close", "닫기")} type="button">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </header>
        <div className="taskList">
          {tasks.map((task) => (
            <Link className={`taskItem ${task.kind}`} href={task.href} key={task.id} onClick={onClose}>
              <span className="taskTone" />
              <span>
                <small>{taskKindLabel(task.kind, t)}</small>
                <strong>{task.title}</strong>
                <em>{task.detail}</em>
              </span>
              <span className="taskSla">{task.dueAt ? formatTaskSla(task.dueAt, t) : localize(t, "Action", "조치")}</span>
            </Link>
          ))}
          {tasks.length === 0 ? (
            <div className="empty">{localize(t, "No action is waiting for you.", "현재 처리할 작업이 없습니다.")}</div>
          ) : null}
        </div>
      </aside>
    </PortalOverlay>
  );
}

function PortalAssistantDrawer({
  language,
  onClose,
  t,
  vaultStatusLabel,
  vaultStatusTone,
  view
}: {
  language: Language;
  onClose: () => void;
  t: Copy;
  vaultStatusLabel: string;
  vaultStatusTone: "danger" | "success" | "neutral";
  view: View;
}) {
  const initialMessage = portalAssistantWelcome(view, t);
  const [messages, setMessages] = useState<PortalAssistantMessage[]>([
    { id: "welcome", role: "assistant", content: initialMessage }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const examples = portalAssistantExamples(view, t);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({
      top: list.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  }, [busy, messages]);

  function resetConversation() {
    setMessages([{ id: `welcome-${Date.now()}`, role: "assistant", content: initialMessage }]);
    setInput("");
    setBusy(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submitPrompt(prompt: string) {
    const content = prompt.trim();
    if (!content || busy) return;
    const userMessage: PortalAssistantMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    try {
      const response = await api<{ result: PortalAssistantResult }>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          locale: language,
          view,
          messages: nextMessages.slice(-20).map((message) => ({ role: message.role, content: message.content }))
        })
      });
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response.result.reply,
          action: response.result.action
        }
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: err instanceof Error
            ? localize(t, `I could not answer this request: ${err.message}`, `요청에 답변하지 못했습니다: ${err.message}`)
            : localize(t, "I could not answer this request.", "요청에 답변하지 못했습니다."),
          error: true
        }
      ]);
    } finally {
      setBusy(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(input);
  }

  return (
    <PortalOverlay className="assistantOverlay" onDismiss={onClose}>
      <aside aria-label="AI Assistant" aria-modal="true" className="portalAssistantDrawer" id="portal-ai-drawer" role="dialog">
        <header className="portalAssistantHeader">
          <div className="portalAssistantIdentity">
            <span className="portalAssistantMark" aria-hidden="true"><MessageSquare size={17} /></span>
            <div>
              <small>{t.nav[view]}</small>
              <h2>AI Assistant</h2>
            </div>
          </div>
          <div className="portalAssistantHeaderActions">
            <span className={`assistantLiveStatus ${vaultStatusTone}`} title={vaultStatusLabel}>
              <span aria-hidden="true" />
              {localize(t, "Read only", "읽기 전용")}
            </span>
            <button
              aria-label={localize(t, "Start a new conversation", "새 대화 시작")}
              className="iconButton"
              onClick={resetConversation}
              title={localize(t, "New conversation", "새 대화")}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={16} />
            </button>
            <button
              aria-label={localize(t, "Close AI Assistant", "AI Assistant 닫기")}
              className="iconButton"
              onClick={onClose}
              title={localize(t, "Close", "닫기")}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </header>

        <div aria-live="polite" className="portalAssistantMessages" ref={messageListRef}>
          {messages.map((message) => {
            const actionItem = message.action?.type === "navigate" && message.action.view && message.action.view !== view
              ? navItems.find((item) => item.view === message.action?.view)
              : undefined;
            return (
              <article className={`portalAssistantMessage ${message.role}${message.error ? " error" : ""}`} key={message.id}>
                <span>{message.role === "assistant" ? "AI" : localize(t, "You", "나")}</span>
                <p>{message.content}</p>
                {actionItem ? (
                  <Link className="assistantNavigationAction" href={actionItem.href} onClick={onClose}>
                    {localize(t, `Open ${t.nav[actionItem.view]}`, `${t.nav[actionItem.view]} 열기`)}
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                ) : null}
              </article>
            );
          })}
          {busy ? (
            <div className="portalAssistantThinking" role="status">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <em>{localize(t, "Reviewing this view", "현재 화면 확인 중")}</em>
            </div>
          ) : null}
        </div>

        <div className="portalAssistantComposerArea">
          {messages.length === 1 ? (
            <div aria-label={localize(t, "Suggested questions", "추천 질문")} className="portalAssistantExamples">
              {examples.map((example) => (
                <button disabled={busy} key={example} onClick={() => void submitPrompt(example)} type="button">
                  {example}
                </button>
              ))}
            </div>
          ) : null}
          <form className="portalAssistantComposer" onSubmit={handleSubmit}>
            <textarea
              aria-label={localize(t, "Ask about this portal view", "현재 화면에 대해 질문")}
              disabled={busy}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || !input.trim()) return;
                event.preventDefault();
                void submitPrompt(input);
              }}
              placeholder={localize(t, "Ask about this view", "현재 화면에 대해 질문하세요")}
              ref={inputRef}
              rows={2}
              value={input}
            />
            <button
              aria-label={localize(t, "Send message", "메시지 전송")}
              className="iconButton"
              disabled={busy || !input.trim()}
              title={localize(t, "Send", "전송")}
              type="submit"
            >
              <Send aria-hidden="true" size={17} />
            </button>
          </form>
        </div>
      </aside>
    </PortalOverlay>
  );
}

function LoginScreen({
  onLogin,
  error,
  language,
  loading,
  setLanguage,
  setTheme,
  theme,
  t
}: {
  onLogin: (email: string) => Promise<void>;
  error: string | null;
  language: Language;
  loading: boolean;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  theme: Theme;
  t: Copy;
}) {
  const users = ["developer@example.com", "approver@example.com", "admin@example.com", "auditor@example.com"];
  return (
    <main className="login">
      <section>
        <div className="loginTopline">
          <div className="loginBrandLockup">
            <span className="brandMark" aria-hidden="true">V</span>
            <div>
              <strong>Vault</strong>
              <small>{t.login.eyebrow}</small>
            </div>
          </div>
          <div className="loginControls">
            <div className="languageSwitch compact" aria-label={t.languageLabel}>
              <button aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>
                EN
              </button>
              <button aria-pressed={language === "ko"} className={language === "ko" ? "active" : ""} onClick={() => setLanguage("ko")}>
                한글
              </button>
            </div>
            <button
              aria-label={localize(t, theme === "light" ? "Use dark theme" : "Use light theme", theme === "light" ? "다크 테마 사용" : "라이트 테마 사용")}
              className="iconButton themeToggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={localize(t, theme === "light" ? "Use dark theme" : "Use light theme", theme === "light" ? "다크 테마 사용" : "라이트 테마 사용")}
              type="button"
            >
              {theme === "light" ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
            </button>
          </div>
        </div>
        <h1>{t.login.title}</h1>
        <p>{t.login.description}</p>
        {loading ? <PortalState compact kind="loading" title={t.loading} /> : null}
        {error ? <PortalState compact detail={error} kind="error" title={localize(t, "Sign-in failed", "로그인에 실패했습니다")} /> : null}
        <div className="loginGrid">
          {users.map((email) => (
            <button key={email} disabled={loading} onClick={() => void onLogin(email)}>
              {email}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusIndicator({ label, tone }: { label: string; tone: "success" | "danger" | "neutral" }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? AlertTriangle : CircleGauge;
  return (
    <span className={`statusIndicator status-${tone}`}>
      <Icon aria-hidden="true" size={14} strokeWidth={2.2} />
      <span>{label}</span>
    </span>
  );
}

function PortalState({
  action,
  compact = false,
  detail,
  kind,
  title
}: {
  action?: { href: string; label: string };
  compact?: boolean;
  detail?: string;
  kind: "loading" | "error" | "empty" | "permission";
  title: string;
}) {
  const Icon = kind === "loading" ? LoaderCircle : kind === "error" ? AlertTriangle : kind === "permission" ? ShieldAlert : Inbox;
  return (
    <div aria-live={kind === "error" ? "assertive" : "polite"} className={`portalState ${kind}${compact ? " compact" : ""}`} role={kind === "error" ? "alert" : "status"}>
      <span className="portalStateIcon">
        <Icon aria-hidden="true" className={kind === "loading" ? "spin" : ""} size={compact ? 18 : 21} />
      </span>
      <div>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
        {action ? (
          <Link className="portalStateAction" href={action.href}>
            {action.label}
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Dashboard({
  t,
  currentUser,
  stats,
  systems,
  requests,
  credentials,
  auditEvents,
  mappingHealth,
  vaultHealth
}: {
  t: Copy;
  currentUser: PortalUser;
  stats: DashboardStats;
  systems: SystemSummary[];
  requests: AccessRequest[];
  credentials: IssuedCredential[];
  auditEvents: AuditEvent[];
  mappingHealth: VaultMappingHealth[];
  vaultHealth: VaultHealthResponse | null;
}) {
  const recentCredential = credentials[0];
  const secretSurfaces = systems.flatMap((system) =>
    system.vaultMountMappings.map((mapping) => ({
      systemName: system.name,
      namespace: system.vaultNamespace,
      environment: system.environment,
      ...mapping
    }))
  );
  const active = credentials.filter((credential) => credential.status === "active");
  const revoked = credentials.filter((credential) => credential.status === "revoked");
  const pending = requests.filter((request) => request.status === "pending");
  const failed = credentials.filter((credential) => credential.status === "revoke_failed");
  const typeCounts = credentials.reduce<Record<string, number>>((acc, credential) => {
    acc[credential.requestType] = (acc[credential.requestType] ?? 0) + 1;
    return acc;
  }, {});
  const maxTypeCount = Math.max(...Object.values(typeCounts), 1);
  const requestCountsBySystem = requests.reduce<Record<string, number>>((acc, request) => {
    acc[request.systemName] = (acc[request.systemName] ?? 0) + 1;
    return acc;
  }, {});
  const maxSystemRequestCount = Math.max(...Object.values(requestCountsBySystem), 1);
  const systemsByName = new Map(systems.map((system) => [system.name, system]));
  const highRiskRequests = requests
    .map((request) => {
      const system = systemsByName.get(request.systemName);
      return {
        request,
        risk: scoreRisk({
          requestType: request.requestType,
          ttl: request.ttl,
          environment: system?.environment ?? "dev",
          scope: String(request.payload.scope ?? request.payload.permission ?? request.payload.project ?? ""),
          riskLevel: request.riskLevel
        })
      };
    })
    .filter(({ risk }) => risk.level === "high")
    .slice(0, 5);
  const recentSecurityEvents = auditEvents
    .filter((event) => /approve|reject|revoke|expire|execute/i.test(event.action))
    .slice(0, 3);
  const hasOperationalData = credentials.length > 0 || requests.length > 0 || recentSecurityEvents.length > 0;
  const pendingHref = canUseView(currentUser.roles, "approvals") ? "/approvals?status=pending&sort=oldest" : "/requests?status=pending&sort=oldest";
  const credentialsHref = canUseView(currentUser.roles, "credentials") ? "/credentials" : "/secrets";
  const mappingHref = canUseView(currentUser.roles, "health") ? "/health" : "/systems";
  const unreachableMappings = mappingHealth.filter((mapping) => !mapping.reachable).length;
  const pendingHighRisk = highRiskRequests.filter(({ request }) => request.status === "pending").length;
  const attentionItems: Array<{
    id: string;
    count: number;
    title: string;
    detail: string;
    href: string;
    icon: LucideIcon;
    tone: "critical" | "warning" | "notice";
  }> = [
    {
      id: "revoke-failures",
      count: failed.length,
      title: localize(t, "Revoke failures", "폐기 실패"),
      detail: localize(t, "Retry failed revocations before reviewing routine work.", "일반 작업보다 먼저 실패한 폐기를 재시도하세요."),
      href: `${credentialsHref}?status=revoke_failed`,
      icon: ShieldAlert,
      tone: "critical" as const
    },
    {
      id: "high-risk",
      count: pendingHighRisk,
      title: localize(t, "High-risk approvals", "High Risk 승인"),
      detail: localize(t, "Review scope, TTL, and requester evidence.", "Scope, TTL, 요청 근거를 우선 검토하세요."),
      href: pendingHref,
      icon: AlertTriangle,
      tone: "warning" as const
    },
    {
      id: "mapping-health",
      count: unreachableMappings,
      title: localize(t, "Vault mapping issues", "Vault Mapping 문제"),
      detail: localize(t, "Mapped targets do not match the live Vault inventory.", "Portal Mapping과 실제 Vault Inventory가 일치하지 않습니다."),
      href: mappingHref,
      icon: HeartPulse,
      tone: "warning" as const
    },
    {
      id: "expiring-soon",
      count: stats.expiringSoon,
      title: localize(t, "Credentials expiring soon", "Credential 만료 임박"),
      detail: localize(t, "Credentials expire within the next 24 hours.", "24시간 이내 만료되는 Credential입니다."),
      href: `${credentialsHref}?status=active`,
      icon: CalendarClock,
      tone: "notice" as const
    }
  ].filter((item) => item.count > 0);
  const attentionTotal = attentionItems.reduce((total, item) => total + item.count, 0);

  return (
    <div className="stack dashboardPage">
      <section className="overviewPanel">
        <div>
          <h2>{t.dashboard.title}</h2>
          <p>{t.dashboard.description}</p>
        </div>
        <div className="overviewAside">
          <span>{t.dashboard.modeLabel}</span>
          <strong>
            {vaultHealth?.mode === "real"
              ? localize(t, "Real Vault", "실제 Vault")
              : vaultHealth?.mode === "mock"
                ? t.dashboard.modeValue
                : localize(t, "Checking Vault", "Vault 확인 중")}
          </strong>
        </div>
      </section>
      <section className="dashboardCommandCenter">
        <header className="dashboardCommandHeader">
          <div>
            <h2>{localize(t, "Operational priorities", "우선 확인 항목")}</h2>
            <p>{localize(t, "Items are ordered by operational risk and time sensitivity.", "운영 위험도와 시간 민감도를 기준으로 정렬했습니다.")}</p>
          </div>
          <span className={attentionTotal ? "attentionCount active" : "attentionCount"}>{attentionTotal}</span>
        </header>
        <div className="dashboardCommandBody">
          <div className="attentionList">
            {attentionItems.length ? attentionItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link className={`attentionItem ${item.tone}`} href={item.href} key={item.id}>
                  <span className="attentionIcon"><Icon aria-hidden="true" size={18} /></span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <em>{item.count}</em>
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              );
            }) : (
              <div className="attentionClear">
                <CheckCircle2 aria-hidden="true" size={20} />
                <span>
                  <strong>{localize(t, "No urgent action required", "긴급 조치가 필요하지 않습니다")}</strong>
                  <small>{localize(t, "Continue monitoring live Vault status and routine approvals.", "실시간 Vault 상태와 일반 승인 작업을 계속 확인하세요.")}</small>
                </span>
              </div>
            )}
          </div>
          <aside className="vaultSnapshot" aria-label={localize(t, "Vault snapshot", "Vault 상태 요약")}>
            <div>
              <span>{localize(t, "Vault status", "Vault 상태")}</span>
              <strong className={vaultHealth?.healthy ? "healthy" : "unhealthy"}>
                {vaultHealth?.healthy ? localize(t, "Connected", "연결됨") : localize(t, "Check required", "확인 필요")}
              </strong>
            </div>
            <div>
              <span>{localize(t, "Mapped surfaces", "매핑 Surface")}</span>
              <strong>{stats.secretSurfaces}</strong>
            </div>
            <div>
              <span>{localize(t, "Assigned systems", "담당 시스템")}</span>
              <strong>{stats.systems}</strong>
            </div>
          </aside>
        </div>
      </section>
      <div className="metrics">
        <Metric
          label={localize(t, "Total secrets", "전체 Secret")}
          value={credentials.length}
          href="/secrets"
          detail={localize(t, `${stats.secretSurfaces} mapped surfaces`, `${stats.secretSurfaces}개 Surface 매핑`)}
        />
        <Metric
          label={t.dashboard.metrics.active}
          value={stats.active}
          href={`${credentialsHref}?status=active`}
          detail={
            t === copy.ko
              ? `${stats.expiringSoon}${t.dashboard.metrics.expiring}`
              : `${stats.expiringSoon} ${t.dashboard.metrics.expiring}`
          }
        />
        <Metric href={pendingHref} label={t.dashboard.metrics.pending} value={stats.pending} detail={t.dashboard.metrics.waiting} />
        <Metric href={`${credentialsHref}?status=revoke_failed`} label={t.dashboard.metrics.failures} value={stats.failures} detail={t.dashboard.metrics.operator} tone="risk" />
      </div>
      {!hasOperationalData ? (
        <section className="dashboardStartState">
          <span className="dashboardStartIcon"><KeyRound aria-hidden="true" size={20} /></span>
          <div>
            <h2>{localize(t, "Start your first governed Secret workflow", "첫 Secret 워크플로우를 시작하세요")}</h2>
            <p>{localize(t, "Create a request to begin approval, issuance, and lifecycle tracking in one flow.", "요청을 생성하면 승인, 발급, Lifecycle 추적을 하나의 흐름으로 시작할 수 있습니다.")}</p>
          </div>
          <Link className="primary dashboardStartAction" href="/requests">
            {localize(t, "Create Secret request", "Secret 요청 생성")}
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </section>
      ) : (
        <>
      <div className="dashboardGrid dashboardPrimaryGrid">
        <section className="insightPanel">
          <h2>{t.dashboard.posture}</h2>
          <div className="postureRows">
            <PostureRow label={t.dashboard.activeIssued} value={stats.active} max={Math.max(credentials.length, 1)} />
            <PostureRow label={t.dashboard.mappedRoles} value={stats.secretSurfaces} max={Math.max(stats.secretSurfaces, 1)} />
            <PostureRow label={t.dashboard.pendingApprovals} value={stats.pending} max={Math.max(requests.length, 1)} />
          </div>
        </section>
        <section className="insightPanel">
          <h2>{t.dashboard.latest}</h2>
          {recentCredential ? (
            <div className="latestSecret">
              <span className={`statusDot ${recentCredential.status}`} />
              <div>
                <strong>{recentCredential.systemName}</strong>
                <p>{recentCredential.requestType}</p>
              </div>
              <code>{recentCredential.maskedDisplayValue}</code>
            </div>
          ) : (
            <div className="empty compact">{t.dashboard.noIssued}</div>
          )}
        </section>
      </div>
      <details className="dashboardDetails">
        <summary>
          <span>
            <strong>{localize(t, "Operational analytics and records", "운영 분석 및 상세 기록")}</strong>
            <small>{localize(t, "Distribution, lifecycle, risk, issuance, and inventory", "분포, Lifecycle, Risk, 발급 및 Inventory")}</small>
          </span>
          <span className="dashboardDetailsCount">{credentials.length + requests.length + recentSecurityEvents.length}</span>
          <ArrowRight aria-hidden="true" className="dashboardDetailsChevron" size={16} />
        </summary>
        <div className="dashboardDetailsContent">
      <div className="dashboardGrid">
        <section className="insightPanel">
          <h2>{t.dashboard.distribution}</h2>
          {Object.entries(typeCounts).length === 0 ? (
            <div className="empty compact">{t.secrets.noIssued}</div>
          ) : (
            <div className="postureRows">
              {Object.entries(typeCounts).map(([type, count]) => (
                <PostureRow key={type} label={type} value={count} max={maxTypeCount} />
              ))}
            </div>
          )}
        </section>
        <section className="insightPanel">
          <h2>{t.dashboard.lifecycle}</h2>
          <div className="lifecycleGrid">
            <MiniStat label={t.secrets.active} value={active.length} tone="good" />
            <MiniStat label={t.secrets.pending} value={pending.length} />
            <MiniStat label={t.secrets.revoked} value={revoked.length} />
            <MiniStat label={t.secrets.failed} value={failed.length} tone="risk" />
          </div>
        </section>
      </div>
      <div className="dashboardGrid">
        <section className="insightPanel">
          <h2>{localize(t, "Requests by system", "시스템별 요청량")}</h2>
          <div className="postureRows">
            {Object.entries(requestCountsBySystem).length === 0 ? (
              <div className="empty compact">{t.table.noData}</div>
            ) : (
              Object.entries(requestCountsBySystem).map(([systemName, count]) => (
                <PostureRow key={systemName} label={systemName} value={count} max={maxSystemRequestCount} />
              ))
            )}
          </div>
        </section>
        <section className="insightPanel">
          <h2>{localize(t, "High-risk requests", "위험도 높은 요청")}</h2>
          {highRiskRequests.length === 0 ? (
            <div className="empty compact">{localize(t, "No high-risk request currently queued.", "현재 고위험 요청이 없습니다.")}</div>
          ) : (
            <div className="riskRequestList">
              {highRiskRequests.map(({ request, risk }) => (
                <div key={request.id} className="riskRequestItem">
                  <div>
                    <strong>{request.systemName}</strong>
                    <span>
                      {request.requestType} / {request.ttl}
                    </span>
                  </div>
                  <RiskBadge risk={risk} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <Table
        title={t.dashboard.recentIssuance}
        columns={[t.table.system, t.table.type, t.table.status, t.table.ttl]}
        rows={credentials.slice(0, 6).map((credential) => [
          credential.systemName,
          credential.requestType,
          credential.status,
          credential.ttl
        ])}
        emptyLabel={t.table.noData}
        emptyAction={{ href: "/requests", label: localize(t, "Request a Secret", "Secret 요청") }}
      />
      <Table
        title={localize(t, "Recent approval / reject / revoke events", "최근 승인/반려/폐기 이벤트")}
        columns={[t.table.action, t.table.actor, t.table.target, t.table.result]}
        rows={recentSecurityEvents.map((event) => [event.action, event.actorEmail, event.targetType, event.result])}
        emptyLabel={t.table.noData}
      />
      <Table
        title={t.dashboard.pendingQueue}
        columns={[t.table.system, t.table.type, t.table.requester, t.table.risk]}
        rows={requests
          .filter((request) => request.status === "pending")
          .map((request) => [request.systemName, request.requestType, request.requesterEmail, request.riskLevel])}
        emptyLabel={t.table.noData}
        emptyAction={{ href: "/requests", label: localize(t, "Create request", "요청 생성") }}
      />
      <section className="tablePanel">
        <h2>{t.dashboard.inventory}</h2>
        {credentials.length === 0 ? (
          <div className="empty compact">{t.secrets.noIssued}</div>
        ) : (
          <table className="responsiveTable">
            <thead>
              <tr>
                <th>{t.table.system}</th>
                <th>{t.table.secretType}</th>
                <th>{t.table.status}</th>
                <th>{t.table.maskedValue}</th>
                <th>{t.table.ttl}</th>
                <th>{t.table.expires}</th>
                <th>{t.table.lease}</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((credential) => (
                <tr key={credential.id}>
                  <td data-label={t.table.system}>{credential.systemName}</td>
                  <td data-label={t.table.secretType}>{credential.requestType}</td>
                  <td data-label={t.table.status}>
                    <span className={`statusBadge ${credential.status}`}>{credential.status}</span>
                  </td>
                  <td data-label={t.table.maskedValue}>
                    <code>{credential.maskedDisplayValue}</code>
                  </td>
                  <td data-label={t.table.ttl}>{credential.ttl}</td>
                  <td data-label={t.table.expires}>{formatDate(credential.expiresAt)}</td>
                  <td className="monoCell" data-label={t.table.lease}>{shortId(credential.vaultLeaseId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Table
        title={t.dashboard.surfaces}
        columns={[t.table.system, t.table.env, t.table.namespace, t.table.mount, t.table.role, t.table.requestType]}
        rows={secretSurfaces.map((surface) => [
          surface.systemName,
          surface.environment,
          surface.namespace,
          surface.mountPath,
          surface.roleName,
          surface.requestType
        ])}
        emptyLabel={t.table.noData}
      />
        </div>
      </details>
        </>
      )}
    </div>
  );
}

function SecretInventory({
  t,
  systems,
  requests,
  credentials,
  mappingHealth
}: {
  t: Copy;
  systems: SystemSummary[];
  requests: AccessRequest[];
  credentials: IssuedCredential[];
  mappingHealth: VaultMappingHealth[];
}) {
  const secretSurfaces = useMemo(() => buildSecretSurfaces(systems), [systems]);
  const active = credentials.filter((credential) => credential.status === "active");
  const pending = requests.filter((request) => request.status === "pending");
  const namespaces = Array.from(new Set(systems.map((system) => system.vaultNamespace)));
  const mapModel = useMemo(
    () => buildDependencyMapModel(systems, secretSurfaces, credentials),
    [credentials, secretSurfaces, systems]
  );
  const [selectedNodeId, setSelectedNodeId] = useState("vault");
  const [dependencyQuery, setDependencyQuery] = useState("");
  const [dependencyEnvironment, setDependencyEnvironment] = useState("all");
  const [dependencyKind, setDependencyKind] = useState("all");
  const [dependencyStatus, setDependencyStatus] = useState("all");
  const [dependencyRisk, setDependencyRisk] = useState("all");
  const [dependencyView, setDependencyView] = useState<"graph" | "tree">("graph");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mapScale, setMapScale] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapDragging, setMapDragging] = useState(false);
  const mapDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const mountGroups = secretSurfaces.reduce<Record<string, number>>((acc, surface) => {
    acc[surface.mountPath] = (acc[surface.mountPath] ?? 0) + 1;
    return acc;
  }, {});
  const liveMappings = mappingHealth.filter((mapping) => mapping.reachable).length;
  const mountHealth = useMemo(
    () => new Map(mappingHealth.map((mapping) => [normalizePortalMount(mapping.mountPath), mapping.reachable])),
    [mappingHealth]
  );
  const highRiskSurfaceIds = useMemo(() => new Set(
    secretSurfaces.filter((surface) => {
      const credential = credentials.find(
        (item) => item.systemName === surface.systemName && item.requestType === surface.requestType
      );
      const request = credential
        ? requests.find((item) => item.id === credential.requestId)
        : requests.find(
            (item) => item.systemName === surface.systemName && item.requestType === surface.requestType
          );
      return scoreRisk({
        requestType: surface.requestType,
        environment: surface.environment,
        ttl: credential?.ttl ?? request?.ttl ?? "1h",
        scope: `${surface.roleName} ${surface.displayName}`,
        riskLevel: request?.riskLevel
      }).level === "high";
    }).map((surface) => surface.id)
  ), [credentials, requests, secretSurfaces]);
  const nodeStates = useMemo(() => new Map(
    mapModel.nodes.map((node) => [
      node.id,
      dependencyNodeState(node, secretSurfaces, credentials, mountHealth)
    ])
  ), [credentials, mapModel.nodes, mountHealth, secretSurfaces]);
  const highRiskNodeIds = useMemo(() => new Set(
    mapModel.nodes
      .filter((node) => getRelatedSurfaces(node, secretSurfaces).some((surface) => highRiskSurfaceIds.has(surface.id)))
      .map((node) => node.id)
  ), [highRiskSurfaceIds, mapModel.nodes, secretSurfaces]);
  const directlyMatchingNodeIds = useMemo(() => {
    const query = dependencyQuery.trim().toLowerCase();
    return new Set(mapModel.nodes.filter((node) => {
      const relatedSurfaces = getRelatedSurfaces(node, secretSurfaces);
      const matchesQuery = !query || `${node.label} ${node.sublabel} ${node.kind}`.toLowerCase().includes(query);
      const matchesEnvironment = dependencyEnvironment === "all" || relatedSurfaces.some(
        (surface) => surface.environment === dependencyEnvironment
      );
      const matchesKind = dependencyKind === "all" || node.kind === dependencyKind;
      const state = nodeStates.get(node.id) ?? "neutral";
      const matchesStatus = dependencyStatus === "all" || state === dependencyStatus;
      const matchesRisk = dependencyRisk === "all" || highRiskNodeIds.has(node.id);
      return matchesQuery && matchesEnvironment && matchesKind && matchesStatus && matchesRisk;
    }).map((node) => node.id));
  }, [dependencyEnvironment, dependencyKind, dependencyQuery, dependencyRisk, dependencyStatus, highRiskNodeIds, mapModel.nodes, nodeStates, secretSurfaces]);
  const visibleNodeIds = useMemo(
    () => dependencyNodesWithAncestors(mapModel, directlyMatchingNodeIds),
    [directlyMatchingNodeIds, mapModel]
  );
  const visibleNodes = mapModel.nodes.filter((node) => visibleNodeIds.has(node.id));
  const firstVisibleNodeId = visibleNodes[0]?.id ?? "vault";
  const visibleEdges = mapModel.edges.filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to));
  const selectedNode =
    mapModel.nodes.find((node) => node.id === selectedNodeId) ?? mapModel.nodes[0] ?? {
      id: "vault",
      kind: "vault" as const,
      label: "Vault",
      sublabel: "Enterprise core",
      x: 50,
      y: 10
    };
  const selectedBranch = useMemo(
    () => dependencySelectedBranch(mapModel, selectedNode.id),
    [mapModel, selectedNode.id]
  );
  const selectedPath = useMemo(
    () => dependencyPathToNode(mapModel, selectedNode.id),
    [mapModel, selectedNode.id]
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const useMobileView = () => {
      if (media.matches) {
        setDependencyView("tree");
        setInspectorOpen(false);
      }
    };
    useMobileView();
    media.addEventListener("change", useMobileView);
    return () => media.removeEventListener("change", useMobileView);
  }, []);

  useEffect(() => {
    if (visibleNodeIds.has(selectedNodeId)) return;
    setSelectedNodeId(firstVisibleNodeId);
  }, [firstVisibleNodeId, selectedNodeId, visibleNodeIds]);

  function selectDependencyNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setInspectorOpen(true);
  }

  function resetDependencyViewport() {
    setMapScale(1);
    setMapPan({ x: 0, y: 0 });
  }

  function resetDependencyFilters() {
    setDependencyQuery("");
    setDependencyEnvironment("all");
    setDependencyKind("all");
    setDependencyStatus("all");
    setDependencyRisk("all");
  }

  function handleMapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    mapDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mapPan.x,
      originY: mapPan.y
    };
    setMapDragging(true);
  }

  function handleMapPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = mapDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setMapPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    });
  }

  function finishMapDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (mapDragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    mapDragRef.current = null;
    setMapDragging(false);
  }

  return (
    <div className="dependencyStack">
      <section className="dependencyIntro dependencyExplorerIntro">
        <div>
          <h2>{t.secrets.title}</h2>
          <p>{t.secrets.description}</p>
        </div>
        <div className="dependencySummary" aria-label={localize(t, "Dependency summary", "의존 관계 요약")}>
          <span><strong>{mapModel.nodes.length}</strong>{t.secrets.nodes}</span>
          <span><strong>{mapModel.edges.length}</strong>{t.secrets.edges}</span>
          <span><strong>{liveMappings}</strong>{localize(t, "Live mounts", "Live Mount")}</span>
          <span><strong>{credentials.length}</strong>{t.secrets.leases}</span>
        </div>
      </section>

      <section className="dependencyExplorer" aria-label={t.secrets.topology}>
        <header className="dependencyExplorerToolbar">
          <label className="dependencySearch">
            <Search aria-hidden="true" size={17} />
            <input
              aria-label={localize(t, "Search dependency nodes", "의존 관계 노드 검색")}
              onChange={(event) => setDependencyQuery(event.target.value)}
              placeholder={localize(t, "Search node, mount, role", "노드, Mount, Role 검색")}
              value={dependencyQuery}
            />
          </label>
          <div className="dependencyFilters">
            <label>
              <span>{localize(t, "Environment", "환경")}</span>
              <select onChange={(event) => setDependencyEnvironment(event.target.value)} value={dependencyEnvironment}>
                <option value="all">{localize(t, "All", "전체")}</option>
                <option value="dev">dev</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </select>
            </label>
            <label>
              <span>{localize(t, "Type", "유형")}</span>
              <select onChange={(event) => setDependencyKind(event.target.value)} value={dependencyKind}>
                <option value="all">{localize(t, "All", "전체")}</option>
                <option value="namespace">Namespace</option>
                <option value="system">{localize(t, "System", "시스템")}</option>
                <option value="surface">Mount / Role</option>
                <option value="credential">Credential</option>
              </select>
            </label>
            <label>
              <span>{localize(t, "Status", "상태")}</span>
              <select onChange={(event) => setDependencyStatus(event.target.value)} value={dependencyStatus}>
                <option value="all">{localize(t, "All", "전체")}</option>
                <option value="live">Live</option>
                <option value="issue">{localize(t, "Issue", "문제")}</option>
              </select>
            </label>
            <label>
              <span>{localize(t, "Risk", "위험도")}</span>
              <select onChange={(event) => setDependencyRisk(event.target.value)} value={dependencyRisk}>
                <option value="all">{localize(t, "All", "전체")}</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <div className="dependencyToolbarActions">
            <div className="dependencyViewSwitch" aria-label={localize(t, "Explorer view", "Explorer 보기")} role="group">
              <button
                aria-pressed={dependencyView === "graph"}
                className={dependencyView === "graph" ? "active" : ""}
                onClick={() => setDependencyView("graph")}
                type="button"
              >
                <Workflow aria-hidden="true" size={15} />
                Graph
              </button>
              <button
                aria-pressed={dependencyView === "tree"}
                className={dependencyView === "tree" ? "active" : ""}
                onClick={() => setDependencyView("tree")}
                type="button"
              >
                <ListChecks aria-hidden="true" size={15} />
                Tree
              </button>
            </div>
            {dependencyView === "graph" ? (
              <div className="dependencyZoomControls">
                <button
                  aria-label={localize(t, "Zoom out", "축소")}
                  disabled={mapScale <= 0.8}
                  onClick={() => setMapScale((current) => Math.max(0.8, Number((current - 0.1).toFixed(1))))}
                  title={localize(t, "Zoom out", "축소")}
                  type="button"
                >
                  <ZoomOut aria-hidden="true" size={16} />
                </button>
                <span>{Math.round(mapScale * 100)}%</span>
                <button
                  aria-label={localize(t, "Zoom in", "확대")}
                  disabled={mapScale >= 1.4}
                  onClick={() => setMapScale((current) => Math.min(1.4, Number((current + 0.1).toFixed(1))))}
                  title={localize(t, "Zoom in", "확대")}
                  type="button"
                >
                  <ZoomIn aria-hidden="true" size={16} />
                </button>
                <button
                  aria-label={localize(t, "Fit graph", "전체 보기")}
                  onClick={resetDependencyViewport}
                  title={localize(t, "Fit graph", "전체 보기")}
                  type="button"
                >
                  <Maximize2 aria-hidden="true" size={16} />
                </button>
              </div>
            ) : null}
            <button
              aria-label={localize(t, inspectorOpen ? "Close inspector" : "Open inspector", inspectorOpen ? "Inspector 닫기" : "Inspector 열기")}
              aria-pressed={inspectorOpen}
              className="dependencyInspectorToggle"
              onClick={() => setInspectorOpen((current) => !current)}
              title={localize(t, inspectorOpen ? "Close inspector" : "Open inspector", inspectorOpen ? "Inspector 닫기" : "Inspector 열기")}
              type="button"
            >
              {inspectorOpen ? <PanelRightClose aria-hidden="true" size={17} /> : <PanelRightOpen aria-hidden="true" size={17} />}
            </button>
          </div>
        </header>

        <div className={`dependencyExplorerBody${inspectorOpen ? " inspectorOpen" : ""}`}>
          <div className="dependencyWorkspace">
            {dependencyView === "graph" ? (
              <div
                className={`dependencyMapViewport${mapDragging ? " dragging" : ""}`}
                data-testid="vault-dependency-map"
                onPointerCancel={finishMapDrag}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={finishMapDrag}
              >
                {visibleNodes.length ? (
                  <div
                    className="dependencyCanvasStage"
                    style={{ transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapScale})` }}
                  >
                    <svg className="dependencyLines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      {visibleEdges.map((edge) => {
                        const from = mapModel.nodes.find((node) => node.id === edge.from);
                        const to = mapModel.nodes.find((node) => node.id === edge.to);
                        if (!from || !to) return null;
                        const midY = (from.y + to.y) / 2;
                        const edgeKey = `${edge.from}-${edge.to}`;
                        return (
                          <path
                            key={edgeKey}
                            className={`dependencyLine ${edge.tone}${selectedBranch.edgeKeys.has(edgeKey) ? " active" : " dimmed"}`}
                            d={`M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`}
                          />
                        );
                      })}
                    </svg>
                    <div className="dependencyLanes" aria-hidden="true">
                      <span>{t.secrets.vaultCore}</span>
                      <span>{t.secrets.namespaces}</span>
                      <span>{t.secrets.systems}</span>
                      <span>{t.secrets.mounts} / Role</span>
                      <span>{t.secrets.leases}</span>
                    </div>
                    {visibleNodes.map((node) => {
                      const Icon = dependencyNodeIcon(node.kind);
                      const state = nodeStates.get(node.id) ?? "neutral";
                      const pathState = selectedBranch.nodeIds.has(node.id) ? "related" : "dimmed";
                      return (
                        <button
                          aria-pressed={node.id === selectedNode.id}
                          className={`dependencyNode ${node.kind} ${state} ${pathState}${node.id === selectedNode.id ? " selected" : ""}`}
                          key={node.id}
                          onClick={() => selectDependencyNode(node.id)}
                          style={{ left: `${node.x}%`, top: `${node.y}%` }}
                          title={`${node.label} — ${node.sublabel}`}
                          type="button"
                        >
                          <span className="dependencyNodeIcon"><Icon aria-hidden="true" size={16} /></span>
                          <span className="dependencyNodeCopy">
                            <strong>{node.label}</strong>
                            <small>{node.sublabel}</small>
                          </span>
                          <i className={`dependencyNodeState ${state}`} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dependencyEmpty">
                    <PackageSearch aria-hidden="true" size={22} />
                    <strong>{localize(t, "No matching dependency", "일치하는 의존 관계가 없습니다")}</strong>
                    <button onClick={resetDependencyFilters} type="button">{localize(t, "Reset filters", "필터 초기화")}</button>
                  </div>
                )}
                <footer className="dependencyMapFooter" aria-label={localize(t, "Map legend", "Map 범례")}>
                  <span><i className="legendLine vault" />{t.secrets.vaultCore}</span>
                  <span><i className="legendLine namespace" />Namespace</span>
                  <span><i className="legendLine system" />Mount / Role</span>
                  <span><i className="legendLine lease" />Lease</span>
                  <span><i className="legendState live" />Live</span>
                  <span><i className="legendState issue" />{localize(t, "Issue", "문제")}</span>
                </footer>
              </div>
            ) : (
              <div className="dependencyTreeView" data-testid="vault-dependency-tree">
                {visibleNodes.length ? dependencyNodeKinds.map((kind) => {
                  const nodes = visibleNodes.filter((node) => node.kind === kind);
                  if (!nodes.length) return null;
                  return (
                    <section key={kind}>
                      <header>
                        <h3>{dependencyKindLabel(t, kind)}</h3>
                        <span>{nodes.length}</span>
                      </header>
                      <div>
                        {nodes.map((node) => {
                          const Icon = dependencyNodeIcon(node.kind);
                          const state = nodeStates.get(node.id) ?? "neutral";
                          return (
                            <button
                              aria-pressed={node.id === selectedNode.id}
                              className={`${state}${node.id === selectedNode.id ? " selected" : ""}`}
                              key={node.id}
                              onClick={() => selectDependencyNode(node.id)}
                              type="button"
                            >
                              <span className="dependencyNodeIcon"><Icon aria-hidden="true" size={16} /></span>
                              <span>
                                <strong>{node.label}</strong>
                                <small>{node.sublabel}</small>
                              </span>
                              <i className={`dependencyNodeState ${state}`} aria-hidden="true" />
                              <ArrowRight aria-hidden="true" size={15} />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                }) : (
                  <div className="dependencyEmpty">
                    <PackageSearch aria-hidden="true" size={22} />
                    <strong>{localize(t, "No matching dependency", "일치하는 의존 관계가 없습니다")}</strong>
                    <button onClick={resetDependencyFilters} type="button">{localize(t, "Reset filters", "필터 초기화")}</button>
                  </div>
                )}
              </div>
            )}
          </div>
          {inspectorOpen ? (
            <DependencyDetail
              credentials={credentials}
              node={selectedNode}
              onClose={() => setInspectorOpen(false)}
              path={selectedPath}
              requests={requests}
              surfaces={secretSurfaces}
              t={t}
            />
          ) : null}
        </div>
      </section>

      <details className="dependencySupport">
        <summary>
          <span>{localize(t, "Vault inventory details", "Vault 인벤토리 상세")}</span>
          <small>{namespaces.length} Namespace · {Object.keys(mountGroups).length} Mount · {active.length} Active</small>
        </summary>
        <div className="dependencyPanels">
          <section className="dependencyPanel">
            <h2>{t.secrets.namespacePlane}</h2>
            <div className="dependencyChipCloud">
              {namespaces.map((namespace) => (
                <span key={namespace}>{namespace}</span>
              ))}
            </div>
          </section>
          <section className="dependencyPanel">
            <h2>{t.secrets.mounts}</h2>
            <div className="dependencyChipCloud">
              {Object.entries(mountGroups).map(([mount, count]) => {
                const live = mountHealth.get(normalizePortalMount(mount));
                return (
                  <span className={live === undefined ? "" : live ? "live" : "missing"} key={mount}>
                    {mount} · {count} · {live === undefined ? localize(t, "Checking", "확인 중") : live ? "Live" : localize(t, "Not mounted", "Mount 없음")}
                  </span>
                );
              })}
            </div>
          </section>
          <section className="dependencyPanel">
            <h2>{t.secrets.leaseOrbit}</h2>
            <div className="dependencyOrbitStats">
              <MiniStat label={t.secrets.active} value={active.length} tone="good" />
              <MiniStat label={t.secrets.pending} value={pending.length} />
              <MiniStat
                label={t.secrets.failed}
                value={credentials.filter((credential) => credential.status === "revoke_failed").length}
                tone="risk"
              />
            </div>
          </section>
          <section className="dependencyPanel wide">
            <h2>{t.secrets.pathFocus}</h2>
            <div className="dependencyPathList">
              {secretSurfaces.slice(0, 6).map((surface) => (
                <div key={`${surface.systemName}-${surface.mountPath}-${surface.roleName}`}>
                  <strong>{surface.systemName}</strong>
                  <span>{surface.namespace} / {surface.mountPath} / {surface.roleName}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

type SecretSurface = {
  id: string;
  systemId: string;
  systemName: string;
  systemDescription: string;
  ownerGroup: string;
  environment: SystemSummary["environment"];
  namespace: string;
  mountPath: string;
  roleName: string;
  requestType: RequestType;
  displayName: string;
  enabled: boolean;
};

type DependencyNode = {
  id: string;
  kind: "vault" | "namespace" | "system" | "surface" | "credential";
  label: string;
  sublabel: string;
  x: number;
  y: number;
  namespace?: string;
  systemName?: string;
  surface?: SecretSurface;
  credential?: IssuedCredential;
};

type DependencyEdge = {
  from: string;
  to: string;
  tone: "vault" | "namespace" | "system" | "lease";
};

type DependencyNodeState = "live" | "issue" | "neutral";

const dependencyNodeKinds: DependencyNode["kind"][] = ["vault", "namespace", "system", "surface", "credential"];

function dependencyNodeIcon(kind: DependencyNode["kind"]): LucideIcon {
  if (kind === "vault") return Shield;
  if (kind === "namespace") return Boxes;
  if (kind === "system") return Database;
  if (kind === "surface") return KeyRound;
  return BadgeCheck;
}

function dependencyKindLabel(t: Copy, kind: DependencyNode["kind"]): string {
  if (kind === "vault") return t.secrets.vaultCore;
  if (kind === "namespace") return t.secrets.namespaces;
  if (kind === "system") return t.secrets.systems;
  if (kind === "surface") return `${t.secrets.mounts} / Role`;
  return t.secrets.leases;
}

function dependencyNodeState(
  node: DependencyNode,
  surfaces: SecretSurface[],
  credentials: IssuedCredential[],
  mountHealth: Map<string, boolean>
): DependencyNodeState {
  if (node.credential) {
    if (node.credential.status === "revoke_failed") return "issue";
    if (node.credential.status === "active") return "live";
  }
  const relatedSurfaces = getRelatedSurfaces(node, surfaces);
  const mountStates = relatedSurfaces
    .map((surface) => mountHealth.get(normalizePortalMount(surface.mountPath)))
    .filter((state): state is boolean => state !== undefined);
  if (mountStates.some((state) => !state)) return "issue";
  if (mountStates.some(Boolean)) return "live";
  if (getRelatedCredentials(node, surfaces, credentials).some((credential) => credential.status === "revoke_failed")) {
    return "issue";
  }
  return "neutral";
}

function dependencyNodesWithAncestors(
  model: { nodes: DependencyNode[]; edges: DependencyEdge[] },
  matchingNodeIds: ReadonlySet<string>
): Set<string> {
  const visible = new Set(matchingNodeIds);
  const visitParent = (nodeId: string) => {
    for (const edge of model.edges) {
      if (edge.to !== nodeId || visible.has(edge.from)) continue;
      visible.add(edge.from);
      visitParent(edge.from);
    }
  };
  for (const nodeId of matchingNodeIds) visitParent(nodeId);
  return visible;
}

function dependencySelectedBranch(
  model: { nodes: DependencyNode[]; edges: DependencyEdge[] },
  selectedNodeId: string
): { nodeIds: Set<string>; edgeKeys: Set<string> } {
  const nodeIds = new Set<string>([selectedNodeId]);
  const edgeKeys = new Set<string>();
  const visitParents = (nodeId: string) => {
    for (const edge of model.edges) {
      if (edge.to !== nodeId) continue;
      edgeKeys.add(`${edge.from}-${edge.to}`);
      if (nodeIds.has(edge.from)) continue;
      nodeIds.add(edge.from);
      visitParents(edge.from);
    }
  };
  const visitChildren = (nodeId: string) => {
    for (const edge of model.edges) {
      if (edge.from !== nodeId) continue;
      edgeKeys.add(`${edge.from}-${edge.to}`);
      if (nodeIds.has(edge.to)) continue;
      nodeIds.add(edge.to);
      visitChildren(edge.to);
    }
  };
  visitParents(selectedNodeId);
  visitChildren(selectedNodeId);
  return { nodeIds, edgeKeys };
}

function dependencyPathToNode(
  model: { nodes: DependencyNode[]; edges: DependencyEdge[] },
  selectedNodeId: string
): DependencyNode[] {
  const path: DependencyNode[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = selectedNodeId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = model.nodes.find((item) => item.id === currentId);
    if (node) path.unshift(node);
    currentId = model.edges.find((edge) => edge.to === currentId)?.from;
  }
  return path;
}

function DependencyDetail({
  t,
  node,
  path,
  onClose,
  surfaces,
  requests,
  credentials
}: {
  t: Copy;
  node: DependencyNode;
  path: DependencyNode[];
  onClose: () => void;
  surfaces: SecretSurface[];
  requests: AccessRequest[];
  credentials: IssuedCredential[];
}) {
  const relatedSurfaces = getRelatedSurfaces(node, surfaces);
  const relatedCredentials = getRelatedCredentials(node, surfaces, credentials);
  const primarySurface = node.surface ?? relatedSurfaces[0];
  const primaryCredential = node.credential ?? relatedCredentials[0];
  const primaryRequest = primaryCredential
    ? requests.find((request) => request.id === primaryCredential.requestId)
    : requests.find(
        (request) =>
          primarySurface &&
          request.systemName === primarySurface.systemName &&
          request.requestType === primarySurface.requestType
      );
  const risk = primarySurface
    ? scoreRisk({
        requestType: primarySurface.requestType,
        environment: primarySurface.environment,
        ttl: primaryCredential?.ttl ?? primaryRequest?.ttl ?? "1h",
        scope: `${primarySurface.roleName} ${primarySurface.displayName}`,
        riskLevel: primaryRequest?.riskLevel
      })
    : null;

  return (
    <aside className="dependencyDetailPanel" aria-label={localize(t, "Dependency inspector", "의존 관계 Inspector")}>
      <header className="dependencyInspectorHeader">
        <div className="detailTopline">
          <span className={`nodeKind ${node.kind}`}>{dependencyKindLabel(t, node.kind)}</span>
          {risk ? <RiskBadge risk={risk} /> : null}
        </div>
        <button
          aria-label={localize(t, "Close inspector", "Inspector 닫기")}
          onClick={onClose}
          title={localize(t, "Close inspector", "Inspector 닫기")}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </header>
      <h2>{node.label}</h2>
      <p>{node.sublabel}</p>

      <nav className="dependencyBreadcrumb" aria-label={localize(t, "Selected dependency path", "선택된 의존 경로")}>
        {path.map((pathNode, index) => (
          <span key={pathNode.id}>
            {index ? <ArrowRight aria-hidden="true" size={12} /> : null}
            <strong>{pathNode.label}</strong>
          </span>
        ))}
      </nav>

      <div className="detailStats">
        <MiniStat label={localize(t, "Mapped roles", "매핑 Role")} value={relatedSurfaces.length} />
        <MiniStat label={localize(t, "Issued", "발급")} value={relatedCredentials.length} />
        <MiniStat
          label={localize(t, "Active", "활성")}
          value={relatedCredentials.filter((credential) => credential.status === "active").length}
          tone="good"
        />
      </div>

      {primarySurface ? (
        <dl className="compactDl">
          <dt>{t.table.system}</dt>
          <dd>{primarySurface.systemName}</dd>
          <dt>{t.table.namespace}</dt>
          <dd>{primarySurface.namespace}</dd>
          <dt>{t.table.mount}</dt>
          <dd>{primarySurface.mountPath}</dd>
          <dt>{t.table.role}</dt>
          <dd>{primarySurface.roleName}</dd>
          <dt>{localize(t, "Policy", "Policy")}</dt>
          <dd>{policyName(primarySurface)}</dd>
          <dt>{t.table.requestType}</dt>
          <dd>{primarySurface.requestType}</dd>
        </dl>
      ) : (
        <div className="empty compact">
          {localize(t, "Select a system, mount, or lease to inspect its Vault relationship.", "시스템, Mount, Lease를 선택하면 Vault 관계를 확인할 수 있습니다.")}
        </div>
      )}

      {primaryCredential ? (
        <div className="selectedCredential">
          <h3>{localize(t, "Selected credential", "선택된 Credential")}</h3>
          <code>{primaryCredential.maskedDisplayValue}</code>
          <dl className="compactDl">
            <dt>{t.table.status}</dt>
            <dd>
              <span className={`statusBadge ${primaryCredential.status}`}>{primaryCredential.status}</span>
            </dd>
            <dt>{t.table.ttl}</dt>
            <dd>{primaryCredential.ttl}</dd>
            <dt>{t.table.expires}</dt>
            <dd>{formatDate(primaryCredential.expiresAt)}</dd>
            <dt>{t.table.lease}</dt>
            <dd>{shortId(primaryCredential.vaultLeaseId)}</dd>
          </dl>
          <LifecycleTimeline steps={credentialLifecycleSteps(t, primaryRequest, primaryCredential)} />
        </div>
      ) : null}

      {risk ? (
        <div className="riskExplanation">
          <strong>{localize(t, "Approval rule explanation", "승인 규칙 설명")}</strong>
          <ul>
            {risk.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

function requestTypeDisplayLabel(type: RequestType): string {
  const labels: Record<RequestType, string> = {
    KV_READ: "KV Read",
    KV_WRITE: "KV Write",
    DB_CREDENTIAL: "Database Credential",
    PKI_CERTIFICATE: "PKI Certificate",
    SSH_CERTIFICATE: "SSH Certificate",
    APPROLE_SECRET_ID: "AppRole SecretID",
    CUSTOM_GITLAB_TOKEN: "GitLab Token",
    CUSTOM_JENKINS_TOKEN: "Jenkins Token",
    CUSTOM_ARTIFACTORY_TOKEN: "Artifactory Token",
    CUSTOM_KAFKA_ACCESS: "Kafka Access",
    CUSTOM_LEGACY_API_TOKEN: "Legacy API Token",
    NETWORK_DEVICE_ROTATION: "Network Device Rotation"
  };
  return labels[type];
}

function localizedSystemDescription(t: Copy, system: SystemSummary): string {
  if (t !== copy.ko) return system.description;
  const descriptions: Record<string, string> = {
    "system-tango-ec": "고객 주문 워크플로우를 처리하는 Enterprise Commerce 애플리케이션입니다.",
    "system-tap-td": "내부 Platform 팀을 위한 Telemetry 및 Data Transformation 서비스입니다.",
    "system-data-platform": "공용 Analytics 및 Reporting Platform입니다.",
    "system-payment-api": "단기 Credential과 Certificate를 사용하는 Payment Processing API입니다."
  };
  return descriptions[system.id] ?? system.description;
}

function Systems({ t, systems, mappingHealth }: { t: Copy; systems: SystemSummary[]; mappingHealth: VaultMappingHealth[] }) {
  const { filters, replace, reset, update } = usePortalFilters({ q: "", environment: "all", sort: "name" });
  const mappingCounts = useMemo(() => {
    const counts = new Map<string, { live: number; total: number }>();
    for (const mapping of mappingHealth) {
      const current = counts.get(mapping.systemId) ?? { live: 0, total: 0 };
      current.total += 1;
      if (mapping.reachable) current.live += 1;
      counts.set(mapping.systemId, current);
    }
    return counts;
  }, [mappingHealth]);
  const filteredSystems = [...systems]
    .filter((system) => {
      const query = filters.q.toLowerCase();
      return (
        (filters.environment === "all" || system.environment === filters.environment) &&
        `${system.name} ${system.description} ${system.ownerGroup} ${system.vaultNamespace}`.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (filters.sort === "environment") return left.environment.localeCompare(right.environment) || left.name.localeCompare(right.name);
      if (filters.sort === "owner") return left.ownerGroup.localeCompare(right.ownerGroup) || left.name.localeCompare(right.name);
      return left.name.localeCompare(right.name);
    });
  return (
    <div className="stack">
      <section className="listToolbar">
        <div className="listFilterGrid">
          <label>
            {localize(t, "Search", "검색")}
            <input onChange={(event) => update("q", event.target.value)} placeholder={localize(t, "System, owner, namespace", "시스템, 소유자, Namespace")} value={filters.q} />
          </label>
          <label>
            {localize(t, "Environment", "환경")}
            <select onChange={(event) => update("environment", event.target.value)} value={filters.environment}>
              <option value="all">{localize(t, "All", "전체")}</option>
              <option value="dev">dev</option>
              <option value="staging">staging</option>
              <option value="prod">prod</option>
            </select>
          </label>
          <label>
            {localize(t, "Sort", "정렬")}
            <select onChange={(event) => update("sort", event.target.value)} value={filters.sort}>
              <option value="name">{localize(t, "Name", "이름")}</option>
              <option value="environment">{localize(t, "Environment", "환경")}</option>
              <option value="owner">{localize(t, "Owner", "소유자")}</option>
            </select>
          </label>
        </div>
        <SavedViewControls filters={filters} labels={savedViewLabels(t)} onApply={(saved) => replace({ ...filters, ...saved })} onReset={reset} scope="systems" />
      </section>
      {filteredSystems.length === 0 ? (
        <div className="empty emptyWithAction">
          <span>{t.systems.empty}</span>
          <button onClick={reset} type="button">{localize(t, "Reset filters", "필터 초기화")}</button>
        </div>
      ) : null}
      <div className="grid">
      {filteredSystems.map((system) => {
        const { live: liveMappings, total: totalMappings } = mappingCounts.get(system.id) ?? { live: 0, total: 0 };
        return (
        <article className="card" key={system.id}>
          <div className="cardHeader">
            <div>
              <h2>{system.name}</h2>
              <p>{localizedSystemDescription(t, system)}</p>
            </div>
            <span className={`pill ${system.environment}`}>{system.environment}</span>
          </div>
          <dl>
            <dt>{t.systems.owner}</dt>
            <dd>{system.ownerGroup}</dd>
            <dt>{t.systems.allowed}</dt>
            <dd>
              <div className="systemTypeChips">
                {system.allowedRequestTypes.map((type) => <span key={type}>{requestTypeDisplayLabel(type)}</span>)}
              </div>
            </dd>
            <dt>{localize(t, "Vault live state", "Vault Live 상태")}</dt>
            <dd>
              <span className={`inlineLiveStatus ${liveMappings === totalMappings && totalMappings > 0 ? "live" : "missing"}`}>
                {liveMappings}/{totalMappings} {localize(t, "mounts available", "Mount 확인")}
              </span>
            </dd>
          </dl>
          <details>
            <summary>{t.systems.advanced}</summary>
            <pre>{JSON.stringify({ namespace: system.vaultNamespace, mappings: system.vaultMountMappings }, null, 2)}</pre>
          </details>
        </article>
        );
      })}
      </div>
    </div>
  );
}

type CsvRequestPreviewRow = {
  rowNumber: number;
  systemName: string;
  requestType: string;
  ttl: string;
  scope: string;
  reason: string;
  error?: string;
  input?: {
    systemId: string;
    requestType: RequestType;
    reason: string;
    ttl: string;
    riskLevel: AccessRequest["riskLevel"];
    payload: Record<string, unknown>;
  };
};

function RequestForm({
  t,
  currentUser,
  systems,
  requests,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser;
  systems: SystemSummary[];
  requests: AccessRequest[];
  onChanged: () => Promise<void>;
}) {
  const [systemId, setSystemId] = useState(systems[0]?.id ?? "");
  const [requestType, setRequestType] = useState<RequestType>(systems[0]?.allowedRequestTypes[0] ?? "CUSTOM_GITLAB_TOKEN");
  const [reason, setReason] = useState(t.request.defaultReason);
  const [ttl, setTtl] = useState("1h");
  const [scope, setScope] = useState("read_api");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvRequestPreviewRow[] | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { filters, replace, reset, update } = usePortalFilters({ q: "", status: "all", risk: "all", sort: "newest" });
  const selectedSystem = systems.find((system) => system.id === systemId);
  const allowedTypes = selectedSystem?.allowedRequestTypes.length ? selectedSystem.allowedRequestTypes : requestTypes;
  const risk = scoreRisk({
    requestType,
    ttl,
    environment: selectedSystem?.environment ?? "dev",
    scope,
    riskLevel: "medium"
  });
  const canReview = currentUser.roles.some((role) => role === "security-approver" || role === "vault-admin" || role === "app-owner");
  const visibleHistory = requests.filter((request) => canReview || request.requesterId === currentUser.id);
  const riskOrder: Record<AccessRequest["riskLevel"], number> = { high: 0, medium: 1, low: 2 };
  const filteredHistory = [...visibleHistory]
    .filter((request) => {
      const query = filters.q.toLowerCase();
      return (
        (filters.status === "all" || request.status === filters.status) &&
        (filters.risk === "all" || request.riskLevel === filters.risk) &&
        `${request.systemName} ${request.requestType} ${request.reason} ${request.requesterEmail}`.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (filters.sort === "oldest") return left.createdAt.localeCompare(right.createdAt);
      if (filters.sort === "risk") return riskOrder[left.riskLevel] - riskOrder[right.riskLevel] || right.createdAt.localeCompare(left.createdAt);
      return right.createdAt.localeCompare(left.createdAt);
    });
  const csvTemplate = buildCsv(
    ["system", "requestType", "ttl", "scope", "reason"],
    [[systems[0]?.name ?? "TANGO-EC", systems[0]?.allowedRequestTypes[0] ?? "CUSTOM_GITLAB_TOKEN", "1h", "read_api", "Release validation"]]
  );

  async function submit() {
    setBusy(true);
    setSubmitError(null);
    setSubmitMessage(null);
    try {
      await api("/requests", {
        method: "POST",
        body: JSON.stringify({
          systemId,
          requestType,
          reason,
          ttl,
          riskLevel: risk.level,
          payload: { project: selectedSystem?.name ?? "unknown", scope, approvalModel: "workflow-wizard" }
        })
      });
      await onChanged();
      setStep(0);
      const message = localize(t, "Request submitted for approval.", "요청을 승인 대기열에 제출했습니다.");
      setSubmitMessage(message);
      notifyPortal(message, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : localize(t, "Unable to submit request.", "요청을 제출하지 못했습니다.");
      setSubmitError(message);
      notifyPortal(message, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function readCsv(file: File) {
    setCsvError(null);
    if (file.size > 1024 * 1024) {
      setCsvError(localize(t, "CSV files must be 1 MB or smaller.", "CSV 파일은 1MB 이하여야 합니다."));
      return;
    }
    const Papa = (await import("papaparse")).default;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim().toLowerCase().replace(/[\s_-]+/g, ""),
      complete: (result) => {
        if (result.errors.length) {
          setCsvError(result.errors[0]?.message ?? localize(t, "Unable to parse CSV.", "CSV를 읽지 못했습니다."));
          return;
        }
        if (result.data.length > 50) {
          setCsvError(localize(t, "A single import can contain up to 50 requests.", "한 번에 최대 50개 요청을 가져올 수 있습니다."));
          return;
        }
        const preview = result.data.map<CsvRequestPreviewRow>((row, index) => {
          const systemToken = row.system?.trim() ?? "";
          const system = systems.find(
            (candidate) => candidate.id.toLowerCase() === systemToken.toLowerCase() || candidate.name.toLowerCase() === systemToken.toLowerCase()
          );
          const requestTypeValue = row.requesttype?.trim().toUpperCase() ?? "";
          const parsedType = requestTypes.includes(requestTypeValue as RequestType) ? (requestTypeValue as RequestType) : undefined;
          const ttlValue = row.ttl?.trim() ?? "";
          const scopeValue = row.scope?.trim() ?? "";
          const reasonValue = row.reason?.trim() ?? "";
          const errors = [
            !system ? localize(t, "Unknown system", "알 수 없는 시스템") : "",
            !parsedType ? localize(t, "Invalid request type", "잘못된 요청 유형") : "",
            system && parsedType && !system.allowedRequestTypes.includes(parsedType)
              ? localize(t, "Type is not allowed for this system", "이 시스템에서 허용되지 않은 유형")
              : "",
            !/^\d+[smhd]$/.test(ttlValue) ? localize(t, "Invalid TTL", "잘못된 TTL") : "",
            reasonValue.length < 3 ? localize(t, "Reason is too short", "요청 사유가 너무 짧음") : ""
          ].filter(Boolean);
          const input = !errors.length && system && parsedType
            ? {
                systemId: system.id,
                requestType: parsedType,
                reason: reasonValue,
                ttl: ttlValue,
                riskLevel: scoreRisk({
                  requestType: parsedType,
                  ttl: ttlValue,
                  environment: system.environment,
                  scope: scopeValue,
                  riskLevel: "medium"
                }).level,
                payload: { project: system.name, scope: scopeValue, approvalModel: "csv-import" }
              }
            : undefined;
          return {
            rowNumber: index + 2,
            systemName: system?.name ?? (systemToken || "-"),
            requestType: requestTypeValue || "-",
            ttl: ttlValue || "-",
            scope: scopeValue || "-",
            reason: reasonValue || "-",
            error: errors.join(" · ") || undefined,
            input
          };
        });
        setCsvPreview(preview);
      }
    });
  }

  async function submitCsv() {
    if (!csvPreview?.length || csvPreview.some((row) => row.error || !row.input)) return;
    setCsvBusy(true);
    setCsvError(null);
    try {
      const response = await api<{ result: BulkRequestResult }>("/requests/bulk", {
        method: "POST",
        body: JSON.stringify({ requests: csvPreview.flatMap((row) => (row.input ? [row.input] : [])) })
      });
      const message = localize(
        t,
        `${response.result.created.length} requests imported${response.result.failures.length ? `, ${response.result.failures.length} failed` : ""}.`,
        `${response.result.created.length}개 요청을 등록했습니다${response.result.failures.length ? `, ${response.result.failures.length}개 실패` : ""}.`
      );
      setSubmitMessage(message);
      notifyPortal(message, response.result.failures.length ? "warning" : "success");
      setCsvPreview(null);
      await onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : localize(t, "Unable to import requests.", "요청을 가져오지 못했습니다.");
      setCsvError(message);
      notifyPortal(message, "danger");
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="stack">
    <section className="formPanel wizardPanel">
      <div className="wizardHeader">
        <div>
          <span className="eyebrow">{localize(t, "Workflow request", "워크플로우 요청")}</span>
          <h2>{t.request.title}</h2>
          <p>
            {localize(
              t,
              "Select the target system, request type, permission scope, TTL, and risk posture before submitting.",
              "대상 시스템, 요청 유형, 권한 범위, TTL, 위험도를 확인한 뒤 요청을 제출합니다."
            )}
          </p>
        </div>
        <div className="requestHeaderTools">
          <RiskBadge risk={risk} />
          <div className="requestBatchActions">
            <a
              aria-label={localize(t, "Download CSV template", "CSV 템플릿 다운로드")}
              className="iconButton"
              download="vault-request-template.csv"
              href={dataDownloadHref("text/csv;charset=utf-8", csvTemplate)}
              title={localize(t, "Download CSV template", "CSV 템플릿 다운로드")}
            >
              <Download aria-hidden="true" size={17} />
            </a>
            <button aria-label={localize(t, "Import request CSV", "요청 CSV 가져오기")} className="iconButton" onClick={() => csvInputRef.current?.click()} title={localize(t, "Import request CSV", "요청 CSV 가져오기")} type="button">
              <Upload aria-hidden="true" size={17} />
            </button>
            <input
              accept=".csv,text/csv"
              className="visuallyHidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readCsv(file);
                event.target.value = "";
              }}
              ref={csvInputRef}
              type="file"
            />
          </div>
        </div>
      </div>

      <div className="wizardSteps" aria-label="Request wizard steps">
        {[
          localize(t, "System", "시스템"),
          localize(t, "Type", "유형"),
          localize(t, "Scope / TTL", "권한 / TTL"),
          localize(t, "Risk confirm", "위험도 확인")
        ].map((label, index) => (
          <button key={label} className={step === index ? "active" : ""} onClick={() => setStep(index)} type="button">
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="wizardPage">
          <label>
            {t.request.targetSystem}
            <select
              value={systemId}
              onChange={(event) => {
                const nextSystem = systems.find((system) => system.id === event.target.value);
                setSystemId(event.target.value);
                setRequestType(nextSystem?.allowedRequestTypes[0] ?? "CUSTOM_GITLAB_TOKEN");
              }}
            >
              {systems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name} / {system.environment}
                </option>
              ))}
            </select>
          </label>
          {selectedSystem ? (
            <div className="selectionSummary">
              <strong>{selectedSystem.name}</strong>
              <span>{selectedSystem.description}</span>
              <code>{selectedSystem.vaultNamespace}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="wizardPage requestTypeGrid">
          {allowedTypes.map((type) => (
            <button
              key={type}
              className={requestType === type ? "selected" : ""}
              onClick={() => setRequestType(type)}
              type="button"
            >
              <strong>{type}</strong>
              <span>{requestTypeDescription(t, type)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="wizardPage twoColumnForm">
          <label>
            {localize(t, "Permission scope", "권한 범위")}
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="read_api">read_api</option>
              <option value="read_write">read_write</option>
              <option value="maintainer">maintainer</option>
              <option value="db_read">db_read</option>
              <option value="db_write">db_write</option>
            </select>
          </label>
          <label>
            TTL
            <select value={ttl} onChange={(event) => setTtl(event.target.value)}>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="8h">8h</option>
              <option value="24h">24h</option>
            </select>
          </label>
          <label className="wideField">
            {t.request.reason}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="wizardPage confirmGrid">
          <div className="selectionSummary">
            <strong>{localize(t, "Request summary", "요청 요약")}</strong>
            <span>{selectedSystem?.name} / {requestType} / {ttl} / {scope}</span>
            <code>{reason}</code>
          </div>
          <div className="riskExplanation">
            <strong>{localize(t, "Risk score and approval rule", "위험도 점수 및 승인 규칙")}</strong>
            <RiskBadge risk={risk} />
            <ul>
              {risk.reasons.map((riskReason) => (
                <li key={riskReason}>{riskReason}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {submitError ? <div className="error">{submitError}</div> : null}
      {submitMessage ? <div className="noticePanel compact">{submitMessage}</div> : null}

      <div className="wizardActions">
        <button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button">
          {localize(t, "Back", "이전")}
        </button>
        {step < 3 ? (
          <button className="primary" disabled={!systemId} onClick={() => setStep((current) => Math.min(3, current + 1))} type="button">
            {localize(t, "Next", "다음")}
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy || !systemId || reason.trim().length < 3}
            onClick={() => void submit()}
            type="button"
          >
            {t.request.submit}
          </button>
        )}
      </div>
    </section>
    <section className="listToolbar">
      <div className="listFilterGrid">
        <label>
          {localize(t, "Search", "검색")}
          <input onChange={(event) => update("q", event.target.value)} placeholder={localize(t, "System, type, reason", "시스템, 유형, 사유")} value={filters.q} />
        </label>
        <label>
          {t.table.status}
          <select onChange={(event) => update("status", event.target.value)} value={filters.status}>
            <option value="all">{localize(t, "All", "전체")}</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="executed">executed</option>
            <option value="expired">expired</option>
          </select>
        </label>
        <label>
          {t.table.risk}
          <select onChange={(event) => update("risk", event.target.value)} value={filters.risk}>
            <option value="all">{localize(t, "All", "전체")}</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
        </label>
        <label>
          {localize(t, "Sort", "정렬")}
          <select onChange={(event) => update("sort", event.target.value)} value={filters.sort}>
            <option value="newest">{localize(t, "Newest first", "최신 순")}</option>
            <option value="oldest">{localize(t, "Oldest first", "오래된 순")}</option>
            <option value="risk">{localize(t, "Highest risk", "고위험 순")}</option>
          </select>
        </label>
      </div>
      <SavedViewControls filters={filters} labels={savedViewLabels(t)} onApply={(saved) => replace({ ...filters, ...saved })} onReset={reset} scope="requests" />
    </section>
    <Table
      columns={[t.table.system, t.table.type, t.table.status, t.table.ttl, t.table.risk, t.table.time]}
      emptyLabel={t.table.noData}
      rows={filteredHistory.map((request) => [request.systemName, request.requestType, request.status, request.ttl, request.riskLevel, formatDate(request.createdAt)])}
      title={localize(t, `Request history (${filteredHistory.length})`, `요청 이력 (${filteredHistory.length})`)}
    />
    {csvPreview ? (
      <PortalOverlay onDismiss={() => setCsvPreview(null)}>
        <section aria-label={localize(t, "CSV request preview", "CSV 요청 미리보기")} aria-modal="true" className="bulkPreviewDialog" role="dialog">
          <header>
            <div>
              <span>{localize(t, "Bulk request", "일괄 요청")}</span>
              <h2>{localize(t, "CSV request preview", "CSV 요청 미리보기")}</h2>
            </div>
            <button aria-label={localize(t, "Close preview", "미리보기 닫기")} className="iconButton" onClick={() => setCsvPreview(null)} title={localize(t, "Close", "닫기")} type="button"><X aria-hidden="true" size={18} /></button>
          </header>
          <div className="bulkPreviewSummary">
            <MiniStat label={localize(t, "Rows", "전체 행")} value={csvPreview.length} />
            <MiniStat label={localize(t, "Ready", "준비됨")} tone="good" value={csvPreview.filter((row) => !row.error).length} />
            <MiniStat label={localize(t, "Errors", "오류")} tone="risk" value={csvPreview.filter((row) => row.error).length} />
          </div>
          <div className="tableScroll bulkPreviewTable">
            <table>
              <thead><tr><th>#</th><th>{t.table.system}</th><th>{t.table.type}</th><th>TTL</th><th>{localize(t, "Scope", "권한")}</th><th>{localize(t, "Validation", "검증")}</th></tr></thead>
              <tbody>
                {csvPreview.map((row) => (
                  <tr className={row.error ? "invalid" : ""} key={row.rowNumber}>
                    <td>{row.rowNumber}</td><td>{row.systemName}</td><td>{row.requestType}</td><td>{row.ttl}</td><td>{row.scope}</td><td>{row.error ?? localize(t, "Ready", "준비됨")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {csvError ? <div className="error">{csvError}</div> : null}
          <footer className="actions">
            <button onClick={() => setCsvPreview(null)} type="button">{localize(t, "Cancel", "취소")}</button>
            <button className="primary" disabled={csvBusy || !csvPreview.length || csvPreview.some((row) => Boolean(row.error))} onClick={() => void submitCsv()} type="button">
              <Upload aria-hidden="true" size={16} />
              {localize(t, "Submit requests", "요청 등록")}
            </button>
          </footer>
        </section>
      </PortalOverlay>
    ) : null}
    {csvError && !csvPreview ? <div className="error">{csvError}</div> : null}
    </div>
  );
}

function Approvals({
  t,
  currentUser,
  requests,
  auditEvents,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser | null;
  requests: AccessRequest[];
  auditEvents: AuditEvent[];
  onChanged: () => Promise<void>;
}) {
  const [ttlOverrides, setTtlOverrides] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [conditionNotes, setConditionNotes] = useState<Record<string, string>>({});
  const [decisionModes, setDecisionModes] = useState<Record<string, "approve" | "conditional" | "reject">>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const { filters, replace, reset, update } = usePortalFilters({ q: "", status: "pending", risk: "all", sort: "oldest" });
  const canReview = currentUser?.roles.some((role) =>
    (["security-approver", "vault-admin", "app-owner"] as UserRole[]).includes(role)
  ) ?? false;
  const riskOrder: Record<AccessRequest["riskLevel"], number> = { high: 0, medium: 1, low: 2 };
  const filteredRequests = [...requests]
    .filter((request) => {
      const query = filters.q.toLowerCase();
      return (
        (filters.status === "all" || request.status === filters.status) &&
        (filters.risk === "all" || request.riskLevel === filters.risk) &&
        `${request.systemName} ${request.requestType} ${request.requesterEmail} ${request.reason}`.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (filters.sort === "newest") return right.createdAt.localeCompare(left.createdAt);
      if (filters.sort === "risk") return riskOrder[left.riskLevel] - riskOrder[right.riskLevel] || left.createdAt.localeCompare(right.createdAt);
      return left.createdAt.localeCompare(right.createdAt);
    });

  async function act(id: string, action: "approve" | "reject" | "execute", conditional = false) {
    setActionError(null);
    setBusyRequestId(id);
    try {
      const body =
        action === "approve"
          ? JSON.stringify({
              ttl: ttlOverrides[id],
              note: conditional ? conditionNotes[id]?.trim() : undefined
            })
          : action === "reject"
            ? JSON.stringify({ reason: rejectReasons[id]?.trim() })
            : undefined;
      await api(`/requests/${id}/${action}`, { method: "POST", body });
      await onChanged();
      const actionLabel = action === "approve"
        ? localize(t, "Request approved.", "요청을 승인했습니다.")
        : action === "reject"
          ? localize(t, "Request rejected.", "요청을 반려했습니다.")
          : localize(t, "Request executed.", "요청을 실행했습니다.");
      notifyPortal(actionLabel, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : localize(t, "Unable to update request.", "요청을 처리하지 못했습니다.");
      setActionError(message);
      notifyPortal(message, "danger");
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <div className="stack">
      <section className="listToolbar">
        <div className="listFilterGrid">
          <label>
            {localize(t, "Search", "검색")}
            <input onChange={(event) => update("q", event.target.value)} placeholder={localize(t, "System, requester, reason", "시스템, 요청자, 사유")} value={filters.q} />
          </label>
          <label>
            {t.table.status}
            <select onChange={(event) => update("status", event.target.value)} value={filters.status}>
              <option value="all">{localize(t, "All", "전체")}</option>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="executed">executed</option>
              <option value="expired">expired</option>
            </select>
          </label>
          <label>
            {t.table.risk}
            <select onChange={(event) => update("risk", event.target.value)} value={filters.risk}>
              <option value="all">{localize(t, "All", "전체")}</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </label>
          <label>
            {localize(t, "Sort", "정렬")}
            <select onChange={(event) => update("sort", event.target.value)} value={filters.sort}>
              <option value="oldest">{localize(t, "Oldest first", "오래된 순")}</option>
              <option value="newest">{localize(t, "Newest first", "최신 순")}</option>
              <option value="risk">{localize(t, "Highest risk", "고위험 순")}</option>
            </select>
          </label>
        </div>
        <SavedViewControls filters={filters} labels={savedViewLabels(t)} onApply={(saved) => replace({ ...filters, ...saved })} onReset={reset} scope="approvals" />
      </section>
      {!canReview ? (
        <div className="noticePanel">
          {localize(
            t,
            "Approval and rejection require the security-approver, app-owner, or vault-admin role.",
            "승인과 반려는 security-approver, app-owner 또는 vault-admin 권한이 필요합니다."
          )}
        </div>
      ) : null}
      {actionError ? <div className="error">{actionError}</div> : null}
      {filteredRequests.length === 0 ? (
        <div className="empty emptyWithAction emptyContextual">
          <span className="emptyContextualIcon"><Inbox aria-hidden="true" size={18} /></span>
          <div>
            <strong>{requests.length === 0 ? localize(t, "No requests have been submitted yet", "아직 등록된 요청이 없습니다") : t.approvals.empty}</strong>
            <small>{requests.length === 0 ? localize(t, "Create a Secret request to begin the approval workflow.", "Secret 요청을 생성하면 승인 워크플로우가 시작됩니다.") : localize(t, "Change or reset the filters to see other requests.", "필터를 변경하거나 초기화해 다른 요청을 확인하세요.")}</small>
          </div>
          {requests.length === 0 ? (
            <Link href="/requests">{localize(t, "Go to Secret requests", "Secret 요청으로 이동")}<ArrowRight aria-hidden="true" size={14} /></Link>
          ) : (
            <button onClick={reset} type="button">{localize(t, "Reset filters", "필터 초기화")}</button>
          )}
        </div>
      ) : null}
      {filteredRequests.map((request) => (
        <article className="card approvalCard" key={request.id}>
          <div className="approvalMain">
            <div>
              <div className="detailTopline">
                <span className={`statusBadge ${request.status}`}>{request.status}</span>
                <RiskBadge
                  risk={scoreRisk({
                    requestType: request.requestType,
                    ttl: ttlOverrides[request.id] ?? request.ttl,
                    environment: request.systemName.toLowerCase().includes("prod") ? "prod" : "dev",
                    scope: String(request.payload.scope ?? ""),
                    riskLevel: request.riskLevel
                  })}
                />
              </div>
              <h2>{request.systemName}</h2>
              <p>{request.reason}</p>
              <small>
                {request.requesterEmail} / {request.requestType} / {request.ttl}
              </small>
            </div>
            {request.status === "pending" ? (
              <div className="approvalControls">
                <div aria-label={localize(t, "Approval decision", "승인 결정")} className="approvalDecisionSwitch" role="group">
                  {(["approve", "conditional", "reject"] as const).map((mode) => {
                    const labels = {
                      approve: localize(t, "Approve", "승인"),
                      conditional: localize(t, "Conditional", "조건부 승인"),
                      reject: localize(t, "Reject", "반려")
                    };
                    const active = (decisionModes[request.id] ?? "approve") === mode;
                    return (
                      <button
                        aria-pressed={active}
                        className={active ? `active ${mode}` : mode}
                        disabled={!canReview}
                        key={mode}
                        onClick={() => setDecisionModes((current) => ({ ...current, [request.id]: mode }))}
                        type="button"
                      >
                        {labels[mode]}
                      </button>
                    );
                  })}
                </div>
                {(decisionModes[request.id] ?? "approve") !== "reject" ? (
                  <label>
                    {localize(t, "Approved TTL", "승인 TTL")}
                    <select
                      disabled={!canReview}
                      value={ttlOverrides[request.id] ?? request.ttl}
                      onChange={(event) =>
                        setTtlOverrides((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                    >
                      <option value={request.ttl}>{request.ttl}</option>
                      <option value="30m">30m</option>
                      <option value="1h">1h</option>
                      <option value="4h">4h</option>
                      <option value="8h">8h</option>
                    </select>
                  </label>
                ) : null}
                {(decisionModes[request.id] ?? "approve") === "conditional" ? (
                  <label>
                    {localize(t, "Approval condition", "승인 조건")}
                    <textarea
                      disabled={!canReview}
                      value={conditionNotes[request.id] ?? ""}
                      placeholder={localize(t, "Example: only during the release window", "예: Release Window에만 허용")}
                      onChange={(event) =>
                        setConditionNotes((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                    />
                  </label>
                ) : null}
                {(decisionModes[request.id] ?? "approve") === "reject" ? (
                  <label>
                    {localize(t, "Reject reason", "반려 사유")}
                    <textarea
                      disabled={!canReview}
                      value={rejectReasons[request.id] ?? ""}
                      placeholder={localize(t, "Enter at least 3 characters", "3자 이상의 반려 사유를 입력하세요")}
                      onChange={(event) =>
                        setRejectReasons((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="approvalFooter">
            <details className="approvalHistory">
              <summary>
                <History aria-hidden="true" size={15} />
                {localize(t, "Approval history", "승인 히스토리")}
              </summary>
              <LifecycleTimeline steps={requestLifecycleSteps(t, request, auditEvents)} compact />
            </details>
            <details className="approvalPayload">
              <summary>{t.approvals.advanced}</summary>
              <pre>
                {JSON.stringify(
                  {
                    payload: request.payload,
                    ttl_override: ttlOverrides[request.id],
                    conditional_approval_note: conditionNotes[request.id],
                    reject_reason: rejectReasons[request.id]
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
          <div className="actions">
            {request.status === "pending" && (decisionModes[request.id] ?? "approve") === "approve" ? (
              <button className="primary" disabled={!canReview || busyRequestId === request.id} onClick={() => void act(request.id, "approve")}>
                <CheckCircle2 aria-hidden="true" size={15} />
                {t.approvals.approve}
              </button>
            ) : null}
            {request.status === "pending" && (decisionModes[request.id] ?? "approve") === "conditional" ? (
              <button
                className="primary"
                disabled={!canReview || busyRequestId === request.id || (conditionNotes[request.id]?.trim().length ?? 0) < 3}
                onClick={() => void act(request.id, "approve", true)}
              >
                <ShieldCheck aria-hidden="true" size={15} />
                {localize(t, "Apply conditional approval", "조건부 승인 적용")}
              </button>
            ) : null}
            {request.status === "pending" && (decisionModes[request.id] ?? "approve") === "reject" ? (
              <button
                className="dangerButton"
                disabled={!canReview || busyRequestId === request.id || (rejectReasons[request.id]?.trim().length ?? 0) < 3}
                onClick={() => void act(request.id, "reject")}
              >
                <X aria-hidden="true" size={15} />
                {t.approvals.reject}
              </button>
            ) : null}
            {request.status === "approved" ? (
              <button
                className="primary"
                disabled={busyRequestId === request.id || (!canReview && request.requesterId !== currentUser?.id)}
                onClick={() => void act(request.id, "execute")}
              >
                <Rocket aria-hidden="true" size={15} />
                {t.approvals.execute}
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function Credentials({
  t,
  currentUser,
  credentials,
  requests,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser | null;
  credentials: IssuedCredential[];
  requests: AccessRequest[];
  onChanged: () => Promise<void>;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingActionIds, setPendingActionIds] = useState<string[]>([]);
  const { filters, replace, reset, update } = usePortalFilters({ q: "", status: "all", system: "all", sort: "expiry" });
  const canManageAll = currentUser?.roles.some((role) =>
    (["security-approver", "vault-admin", "app-owner"] as UserRole[]).includes(role)
  ) ?? false;
  const systemNames = Array.from(new Set(credentials.map((credential) => credential.systemName))).sort();
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const canManage = (credential: IssuedCredential) => canManageAll || requestById.get(credential.requestId)?.requesterId === currentUser?.id;
  const filteredCredentials = [...credentials]
    .filter((credential) => {
      const query = filters.q.toLowerCase();
      return (
        (filters.status === "all" || credential.status === filters.status) &&
        (filters.system === "all" || credential.systemName === filters.system) &&
        `${credential.systemName} ${credential.requestType} ${credential.vaultMount} ${credential.vaultRole} ${credential.vaultLeaseId}`.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (filters.sort === "newest") return right.createdAt.localeCompare(left.createdAt);
      if (filters.sort === "system") return left.systemName.localeCompare(right.systemName) || left.expiresAt.localeCompare(right.expiresAt);
      return left.expiresAt.localeCompare(right.expiresAt);
    });
  const actionableCredentials = filteredCredentials.filter(
    (credential) => canManage(credential) && (credential.status === "active" || credential.status === "revoke_failed")
  );
  const pendingCredentials = pendingActionIds.flatMap((id) => {
    const credential = credentials.find((item) => item.id === id);
    return credential ? [credential] : [];
  });

  async function revokeSelected() {
    if (!pendingActionIds.length) return;
    setActionError(null);
    setActionMessage(null);
    setBusy(true);
    try {
      const response = await api<{ result: BulkCredentialActionResult }>("/credentials/bulk-revoke", {
        method: "POST",
        body: JSON.stringify({ credentialIds: pendingActionIds })
      });
      const message = localize(
        t,
        `${response.result.revoked.length} credentials revoked${response.result.failures.length ? `, ${response.result.failures.length} failed` : ""}.`,
        `${response.result.revoked.length}개 Credential을 폐기했습니다${response.result.failures.length ? `, ${response.result.failures.length}개 실패` : ""}.`
      );
      setActionMessage(message);
      notifyPortal(message, response.result.failures.length ? "warning" : "success");
      if (response.result.failures.length) {
        setActionError(response.result.failures.map((failure) => `${shortId(failure.credentialId)}: ${failure.error}`).join(" · "));
      }
      setPendingActionIds([]);
      setSelectedIds([]);
      await onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : localize(t, "Unable to revoke credential.", "Credential을 폐기하지 못했습니다.");
      setActionError(message);
      notifyPortal(message, "danger");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    const actionableIds = actionableCredentials.map((credential) => credential.id);
    const allSelected = actionableIds.length > 0 && actionableIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !actionableIds.includes(id)) : Array.from(new Set([...selectedIds, ...actionableIds])));
  }

  return (
    <div className="stack">
      <section className="listToolbar">
        <div className="listFilterGrid">
          <label>
            {localize(t, "Search", "검색")}
            <input onChange={(event) => update("q", event.target.value)} placeholder={localize(t, "System, role, lease", "시스템, Role, Lease")} value={filters.q} />
          </label>
          <label>
            {t.table.status}
            <select onChange={(event) => update("status", event.target.value)} value={filters.status}>
              <option value="all">{localize(t, "All", "전체")}</option>
              <option value="active">active</option>
              <option value="expired">expired</option>
              <option value="revoked">revoked</option>
              <option value="revoke_failed">revoke_failed</option>
            </select>
          </label>
          <label>
            {t.table.system}
            <select onChange={(event) => update("system", event.target.value)} value={filters.system}>
              <option value="all">{localize(t, "All", "전체")}</option>
              {systemNames.map((systemName) => <option key={systemName} value={systemName}>{systemName}</option>)}
            </select>
          </label>
          <label>
            {localize(t, "Sort", "정렬")}
            <select onChange={(event) => update("sort", event.target.value)} value={filters.sort}>
              <option value="expiry">{localize(t, "Expiry", "만료 순")}</option>
              <option value="newest">{localize(t, "Newest", "최신 순")}</option>
              <option value="system">{localize(t, "System", "시스템 순")}</option>
            </select>
          </label>
        </div>
        <SavedViewControls filters={filters} labels={savedViewLabels(t)} onApply={(saved) => replace({ ...filters, ...saved })} onReset={reset} scope="credentials" />
      </section>
      {actionableCredentials.length ? (
        <section className="bulkActionBar">
          <label className="bulkSelectAll">
            <input
              checked={actionableCredentials.every((credential) => selectedIds.includes(credential.id))}
              onChange={toggleAll}
              type="checkbox"
            />
            {localize(t, `Select visible (${actionableCredentials.length})`, `표시 항목 선택 (${actionableCredentials.length})`)}
          </label>
          <span>{localize(t, `${selectedIds.length} selected`, `${selectedIds.length}개 선택`)}</span>
          <button className="primary" disabled={!selectedIds.length || busy} onClick={() => setPendingActionIds(selectedIds)} type="button">
            {localize(t, "Review bulk revoke", "일괄 폐기 검토")}
          </button>
        </section>
      ) : null}
      {actionError ? <div className="error">{actionError}</div> : null}
      {actionMessage ? <div className="noticePanel compact">{actionMessage}</div> : null}
      {filteredCredentials.length === 0 ? (
        <div className="empty emptyWithAction emptyContextual">
          <span className="emptyContextualIcon"><KeyRound aria-hidden="true" size={18} /></span>
          <div>
            <strong>{credentials.length === 0 ? localize(t, "No credentials have been issued yet", "아직 발급된 Credential이 없습니다") : t.credentials.empty}</strong>
            <small>{credentials.length === 0 ? localize(t, "Submit a Secret request and complete approval to issue a credential.", "Secret 요청과 승인을 완료하면 Credential이 발급됩니다.") : localize(t, "Change or reset the filters to see other credentials.", "필터를 변경하거나 초기화해 다른 Credential을 확인하세요.")}</small>
          </div>
          {credentials.length === 0 ? (
            <Link href="/requests">{localize(t, "Create Secret request", "Secret 요청 생성")}<ArrowRight aria-hidden="true" size={14} /></Link>
          ) : (
            <button onClick={reset} type="button">{localize(t, "Reset filters", "필터 초기화")}</button>
          )}
        </div>
      ) : null}
      {filteredCredentials.map((credential) => {
        const request = requestById.get(credential.requestId);
        const canRevoke = canManage(credential);
        const actionable = credential.status === "active" || credential.status === "revoke_failed";
        return (
          <article className={`card rowCard credentialRow ${selectedIds.includes(credential.id) ? "selected" : ""}`} key={credential.id}>
          <label className="rowSelection" title={localize(t, "Select credential", "Credential 선택")}>
            <input
              aria-label={localize(t, `Select ${credential.systemName} credential`, `${credential.systemName} Credential 선택`)}
              checked={selectedIds.includes(credential.id)}
              disabled={!canRevoke || !actionable}
              onChange={() => toggleSelected(credential.id)}
              type="checkbox"
            />
          </label>
          <div>
            <h2>{credential.systemName}</h2>
            <p>
              {credential.requestType} / {credential.status} / {t.credentials.expires} {new Date(credential.expiresAt).toLocaleString()}
            </p>
            <code>{credential.maskedDisplayValue}</code>
            <LifecycleTimeline
              steps={credentialLifecycleSteps(
                t,
                request,
                credential
              )}
            />
            <details>
              <summary>{t.credentials.advanced}</summary>
              <pre>
                {JSON.stringify(
                  {
                    lease_id: credential.vaultLeaseId,
                    mount: credential.vaultMount,
                    role: credential.vaultRole,
                    metadata: credential.metadata
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
          <button
            disabled={!canRevoke || !actionable || busy}
            onClick={() => setPendingActionIds([credential.id])}
          >
            {credential.status === "revoke_failed" ? localize(t, "Review retry", "재시도 검토") : localize(t, "Review revoke", "폐기 검토")}
          </button>
          </article>
        );
      })}
      {pendingCredentials.length ? (
        <PortalOverlay onDismiss={() => setPendingActionIds([])}>
          <section aria-label={localize(t, "Credential impact review", "Credential 영향도 검토")} aria-modal="true" className="impactDialog" role="dialog">
            <header>
              <div>
                <span>{localize(t, "Destructive action", "중요 작업")}</span>
                <h2>{localize(t, "Credential impact review", "Credential 영향도 검토")}</h2>
              </div>
              <button aria-label={localize(t, "Close impact review", "영향도 검토 닫기")} className="iconButton" onClick={() => setPendingActionIds([])} title={localize(t, "Close", "닫기")} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <div className="impactSummary">
              <MiniStat label="Credential" value={pendingCredentials.length} />
              <MiniStat label={localize(t, "Systems", "시스템")} value={new Set(pendingCredentials.map((credential) => credential.systemId)).size} />
              <MiniStat label="Mounts" value={new Set(pendingCredentials.map((credential) => credential.vaultMount)).size} />
              <MiniStat label={localize(t, "Retries", "재시도")} tone={pendingCredentials.some((credential) => credential.status === "revoke_failed") ? "risk" : "default"} value={pendingCredentials.filter((credential) => credential.status === "revoke_failed").length} />
            </div>
            <div className="impactDiffList">
              {pendingCredentials.map((credential) => (
                <div key={credential.id}>
                  <span><strong>{credential.systemName}</strong><small>{credential.vaultMount} · {credential.vaultRole}</small></span>
                  <code className="diffBefore">{credential.status}</code>
                  <ArrowRight aria-hidden="true" size={15} />
                  <code className="diffAfter">revoked</code>
                </div>
              ))}
            </div>
            <div className="impactNotice">
              <ShieldAlert aria-hidden="true" size={18} />
              <span>{localize(t, "Applications using these leases can lose access immediately. The action and every item result will be audited.", "해당 Lease를 사용하는 애플리케이션의 접근이 즉시 중단될 수 있습니다. 작업과 항목별 결과는 모두 감사 로그에 기록됩니다.")}</span>
            </div>
            <footer className="actions">
              <button disabled={busy} onClick={() => setPendingActionIds([])} type="button">{localize(t, "Cancel", "취소")}</button>
              <button className="dangerButton" disabled={busy} onClick={() => void revokeSelected()} type="button">
                {pendingCredentials.some((credential) => credential.status === "revoke_failed") ? localize(t, "Retry and revoke", "재시도 후 폐기") : localize(t, "Revoke credentials", "Credential 폐기")}
              </button>
            </footer>
          </section>
        </PortalOverlay>
      ) : null}
    </div>
  );
}

function auditActionLabel(t: Copy, action: string): string {
  const labels: Record<string, [string, string]> = {
    "request.created": ["Request created", "요청 생성"],
    "request.approved": ["Request approved", "요청 승인"],
    "request.rejected": ["Request rejected", "요청 반려"],
    "request.executed": ["Request executed", "요청 실행"],
    "credential.revoked": ["Credential revoked", "Credential 폐기"],
    "credential.revoke_failed": ["Credential revoke failed", "Credential 폐기 실패"],
    "portal_assistant.chat": ["AI assistant conversation", "AI Assistant 대화"],
    "user.access.updated": ["User access updated", "사용자 접근 정책 변경"],
    "user.password.reset_issued": ["Temporary password issued", "임시 비밀번호 발급"],
    "vault_plugin.requirements.started": ["Plugin interview started", "Plugin 요구사항 인터뷰 시작"],
    "vault_plugin.requirements.confirmed": ["Plugin specification confirmed", "Plugin 생성 명세 확정"],
    "vault_plugin.job.created": ["Plugin job created", "Plugin 작업 생성"],
    "vault_plugin.job.updated": ["Plugin job updated", "Plugin 작업 수정"],
    "vault_plugin.job.deleted": ["Plugin job deleted", "Plugin 작업 삭제"],
    "vault_plugin.generated": ["Plugin generated", "Plugin 생성"],
    "vault_plugin.build.started": ["Plugin build started", "Plugin Build 시작"],
    "vault_plugin.build.completed": ["Plugin build completed", "Plugin Build 완료"],
    "vault_plugin.applied": ["Plugin applied", "Plugin 적용"],
    "vault_plugin.apply_failed": ["Plugin apply failed", "Plugin 적용 실패"],
    "vault_plugin.rolled_back": ["Plugin rolled back", "Plugin Rollback"],
    "vault_plugin.mount_removed": ["Plugin Mount removed", "Plugin Mount 해제"],
    "vault_plugin.mount_remove_failed": ["Plugin Mount removal failed", "Plugin Mount 해제 실패"],
    "vault_plugin.catalog_repaired": ["Plugin Catalog repaired", "Plugin Catalog 복구"],
    "vault_plugin.catalog_repair_failed": ["Plugin Catalog repair failed", "Plugin Catalog 복구 실패"]
  };
  const label = labels[action];
  if (label) return localize(t, label[0], label[1]);
  return action
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Audit({ t, events }: { t: Copy; events: AuditEvent[] }) {
  const { filters, replace, reset, update } = usePortalFilters({ actor: "", target: "", action: "", from: "", to: "", sort: "newest" });
  const filteredEvents = events.filter((event) => {
    const createdAt = new Date(event.createdAt).getTime();
    const fromOk = filters.from ? createdAt >= new Date(filters.from).getTime() : true;
    const toOk = filters.to ? createdAt <= new Date(`${filters.to}T23:59:59`).getTime() : true;
    return (
      fromOk &&
      toOk &&
      event.actorEmail.toLowerCase().includes(filters.actor.toLowerCase()) &&
      `${event.targetType}:${event.targetId}`.toLowerCase().includes(filters.target.toLowerCase()) &&
      event.action.toLowerCase().includes(filters.action.toLowerCase())
    );
  }).sort((left, right) => filters.sort === "oldest" ? left.createdAt.localeCompare(right.createdAt) : right.createdAt.localeCompare(left.createdAt));
  const rows = filteredEvents.map((event) => [
    new Date(event.createdAt).toLocaleString(),
    event.actorEmail,
    auditActionLabel(t, event.action),
    `${event.targetType}:${event.targetId.slice(0, 8)}`,
    event.result
  ]);
  const columns = [t.table.time, t.table.actor, t.table.action, t.table.target, t.table.result];
  const csv = buildCsv(columns, rows);
  const report = buildAuditReport(t.audit.title, columns, rows);

  return (
    <div className="stack">
      <section className="filterPanel">
        <div>
          <h2>{t.audit.title}</h2>
          <p>{localize(t, "Filter workflow audit events and export the current report.", "워크플로우 감사 이벤트를 필터링하고 현재 리포트를 내보냅니다.")}</p>
        </div>
        <div className="filterGrid auditPrimaryFilters">
          <label>
            {localize(t, "From", "시작일")}
            <input type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} />
          </label>
          <label>
            {localize(t, "To", "종료일")}
            <input type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} />
          </label>
          <label>
            {localize(t, "Sort", "정렬")}
            <select onChange={(event) => update("sort", event.target.value)} value={filters.sort}>
              <option value="newest">{localize(t, "Newest first", "최신 순")}</option>
              <option value="oldest">{localize(t, "Oldest first", "오래된 순")}</option>
            </select>
          </label>
        </div>
        <details className="auditAdvancedFilters">
          <summary>
            <Search aria-hidden="true" size={15} />
            <span>{localize(t, "Advanced filters", "상세 필터")}</span>
            {(filters.actor || filters.target || filters.action) ? <em>{localize(t, "Applied", "적용됨")}</em> : null}
          </summary>
          <div className="filterGrid">
            <label>
              {t.table.actor}
              <input value={filters.actor} onChange={(event) => update("actor", event.target.value)} placeholder="user@example.com" />
            </label>
            <label>
              {t.table.target}
              <input value={filters.target} onChange={(event) => update("target", event.target.value)} placeholder="request / credential" />
            </label>
            <label>
              {t.table.action}
              <input value={filters.action} onChange={(event) => update("action", event.target.value)} placeholder="approve / revoke" />
            </label>
          </div>
        </details>
        <div className="filterPanelFooter">
          <SavedViewControls filters={filters} labels={savedViewLabels(t)} onApply={(saved) => replace({ ...filters, ...saved })} onReset={reset} scope="audit" />
          <div className="actions">
          <a
            className="downloadLink"
            download="security-portal-audit.csv"
            href={dataDownloadHref("text/csv;charset=utf-8", csv)}
          >
            CSV
          </a>
          <a
            className="downloadLink primary"
            href={dataDownloadHref("text/html;charset=utf-8", report)}
            rel="noreferrer"
            target="_blank"
          >
            PDF / Print
          </a>
          </div>
        </div>
      </section>
      <Table
        title={`${t.audit.title} (${filteredEvents.length})`}
        columns={[t.table.time, t.table.actor, t.table.action, t.table.target, t.table.result]}
        rows={rows}
        emptyLabel={t.table.noData}
      />
    </div>
  );
}

type PluginFilter = "all" | VaultPluginType | "partner" | "community" | "learning";
type PluginChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: "default" | "success" | "warning";
};
type FactoryAssistantResult = {
  reply: string;
  action: {
    type: "none" | "list" | "select" | "generate" | "generate-and-apply" | "apply" | "rollback";
    templateId?: string;
    filter?: PluginFilter;
  };
  provider: "ollama" | "rules";
  model?: string;
  fallbackReason?: "disabled" | "misconfigured" | "unavailable" | "invalid-response";
  latencyMs: number;
};
type FactoryAssistantHealth = {
  ok: boolean;
  provider: "ollama" | "rules";
  model?: string;
  modelAvailable?: boolean;
  detail: string;
};
type FactoryRuntime = {
  vaultMode: "mock" | "real";
  buildMode: "static" | "codebuild";
  requiredMountPrefix: string;
};
type FactoryJobState = {
  kind: "generate" | "apply";
  label: string;
  status: "running" | "complete" | "failed" | "cancelled";
  startedAt: number;
  lines: string[];
};
type PluginFactoryHistoryItem = {
  id: string;
  action: "generated" | "applied" | "rollback-preview" | "blueprint-saved";
  pluginName: string;
  detail: string;
  createdAt: string;
  status: "success" | "warning";
};
type PluginApplyAttempt =
  | { status: "applied"; result: VaultPluginApplyResult }
  | { status: "approval-required" | "preflight-blocked" | "failed"; detail?: string };
type FactoryTab = "workspace" | "discover" | "files" | "review" | "build" | "deploy" | "history";
type FileEditorMode = "preview" | "edit" | "diff";
type FactoryRequirementStep = VaultPluginRequirementField | "review";
type FactoryRequirementQuestion = {
  field: VaultPluginRequirementField;
  label: string;
  shortLabel: string;
  question: string;
  detail: string;
  placeholder: string;
  suggestions: string[];
};
type FactoryHistoryAction = {
  mode: "edit" | "delete";
  jobId: string;
  title: string;
  note: string;
};
type FactoryWorkspaceSnapshot = {
  workspaceId?: string;
  activeTab?: FactoryTab;
  selectedId?: string;
  pluginName?: string;
  mountPath?: string;
  version?: string;
  command?: string;
  description?: string;
  artifactSha256?: string;
  chatMessages?: PluginChatMessage[];
  generated?: VaultPluginGenerateResult;
  applyResult?: VaultPluginApplyResult;
  rollbackResult?: VaultPluginRollbackResult;
  draftFiles?: VaultPluginGeneratedFile[];
  activeFilePath?: string;
  savedBlueprints?: string[];
  pluginHistory?: PluginFactoryHistoryItem[];
  favoriteTemplateIds?: string[];
  recentTemplateIds?: string[];
  compareTemplateIds?: string[];
  requirementsInterview?: VaultPluginRequirementsInterview;
  autoRepair?: VaultPluginAutoRepairResult;
};

const factoryStepDelayMs = 280;

type FactoryChatExample = {
  id: string;
  en: string;
  ko: string;
};

type LocalizedFactoryChatExample = {
  id: string;
  prompt: string;
};

const factoryChatExampleGroups = {
  build: [
    {
      id: "build-github-pat-rotation",
      en: "Create a GitHub PAT Rotation plugin",
      ko: "GitHub PAT Rotation Plugin 만들어줘"
    },
    {
      id: "build-github-app",
      en: "Create a GitHub App secrets plugin",
      ko: "GitHub App Secrets Plugin 만들어줘"
    },
    {
      id: "build-kafka",
      en: "Create a Kafka secrets plugin",
      ko: "Kafka Secrets Plugin 만들어줘"
    },
    {
      id: "build-sectigo-pki",
      en: "Create a Sectigo PKI plugin",
      ko: "Sectigo PKI Plugin 만들어줘"
    },
    {
      id: "build-digicert-pki",
      en: "Create a DigiCert PKI plugin",
      ko: "DigiCert PKI Plugin 만들어줘"
    },
    {
      id: "build-clickhouse",
      en: "Create a ClickHouse database plugin",
      ko: "ClickHouse Database Plugin 만들어줘"
    },
    {
      id: "build-openai-apply",
      en: "Create an OpenAI plugin and apply it to Vault",
      ko: "OpenAI Plugin 만들고 Vault에 적용해줘"
    },
    {
      id: "build-kubernetes-auth",
      en: "Create a Kubernetes Auth plugin",
      ko: "Kubernetes Auth Plugin 만들어줘"
    },
    {
      id: "build-onepassword-connect",
      en: "Create a 1Password Connect plugin",
      ko: "1Password Connect Plugin 만들어줘"
    },
    {
      id: "build-redis-database",
      en: "Create a Redis database plugin",
      ko: "Redis Database Plugin 만들어줘"
    },
    {
      id: "build-grafana-token",
      en: "Create a Grafana access token plugin",
      ko: "Grafana Access Token Plugin 만들어줘"
    },
    {
      id: "build-tailscale-auth-key",
      en: "Create a Tailscale auth key plugin",
      ko: "Tailscale Auth Key Plugin 만들어줘"
    }
  ],
  discover: [
    {
      id: "discover-all",
      en: "List every plugin you can make",
      ko: "만들 수 있는 Plugin 전부 알려줘"
    },
    {
      id: "discover-database",
      en: "Show only Database plugins",
      ko: "Database Plugin만 보여줘"
    },
    {
      id: "discover-auth",
      en: "Show only Auth plugins",
      ko: "Auth Plugin만 보여줘"
    },
    {
      id: "discover-community",
      en: "Show Community plugins",
      ko: "Community Plugin 목록 보여줘"
    },
    {
      id: "discover-partner",
      en: "Show Partner plugins",
      ko: "Partner Plugin 목록 보여줘"
    },
    {
      id: "discover-kubernetes",
      en: "Which plugins support Kubernetes?",
      ko: "Kubernetes와 연동할 수 있는 Plugin 알려줘"
    },
    {
      id: "discover-short-lived",
      en: "Which plugins issue short-lived credentials?",
      ko: "Short-lived Credential을 발급하는 Plugin 알려줘"
    },
    {
      id: "discover-rotation",
      en: "Which plugins can rotate credentials?",
      ko: "Credential Rotation을 지원하는 Plugin 알려줘"
    },
    {
      id: "discover-github-recommendation",
      en: "Recommend a plugin for GitHub automation",
      ko: "GitHub Automation에 적합한 Plugin 추천해줘"
    },
    {
      id: "discover-pki",
      en: "Show available PKI plugins",
      ko: "사용 가능한 PKI Plugin 알려줘"
    }
  ],
  understand: [
    {
      id: "understand-pki-compare",
      en: "Compare Sectigo and DigiCert",
      ko: "Sectigo와 DigiCert를 비교해줘"
    },
    {
      id: "understand-github-compare",
      en: "Compare GitHub App and GitHub PAT Rotation",
      ko: "GitHub App과 GitHub PAT Rotation을 비교해줘"
    },
    {
      id: "understand-plugin-types",
      en: "Explain Auth, Secret engine, and Database plugin types",
      ko: "Auth, Secret engine, Database Plugin 차이를 설명해줘"
    },
    {
      id: "understand-requirements",
      en: "What information do you need before creating a plugin?",
      ko: "Plugin 생성 전에 어떤 정보가 필요한지 알려줘"
    },
    {
      id: "understand-build-flow",
      en: "Explain the build, test, checksum, and approval flow",
      ko: "Build, Test, Checksum, 승인 절차를 설명해줘"
    },
    {
      id: "understand-approval",
      en: "Why is approval required before Vault apply?",
      ko: "Vault 적용 전에 승인이 필요한 이유를 알려줘"
    },
    {
      id: "understand-lifecycle",
      en: "Explain TTL, Rotation, and Revoke",
      ko: "TTL, Rotation, Revoke를 설명해줘"
    },
    {
      id: "understand-generate-only",
      en: "Can I generate a plugin without applying it?",
      ko: "Vault에 적용하지 않고 Plugin만 생성할 수 있어?"
    },
    {
      id: "understand-rollback",
      en: "How does plugin rollback work?",
      ko: "Plugin Rollback은 어떻게 동작해?"
    },
    {
      id: "understand-mount-path",
      en: "Explain the difference between a mount path and plugin name",
      ko: "Mount Path와 Plugin 이름의 차이를 설명해줘"
    },
    {
      id: "understand-security-checks",
      en: "What security checks run before deployment?",
      ko: "배포 전에 어떤 보안 검사를 하는지 알려줘"
    }
  ]
} satisfies Record<string, FactoryChatExample[]>;

const factoryChatExampleCycleLength = 660;
const factoryChatExampleStorageKey = "vault-factory-chat-example-round";

function factoryChatExamplesForRound(t: Copy, round: number): LocalizedFactoryChatExample[] {
  const build = factoryChatExampleGroups.build;
  const discover = factoryChatExampleGroups.discover;
  const understand = factoryChatExampleGroups.understand;
  const selected = [
    build[round % build.length]!,
    discover[(round * 3 + 1) % discover.length]!,
    understand[(round * 5 + 2) % understand.length]!
  ];
  const offset = round % selected.length;

  return [...selected.slice(offset), ...selected.slice(0, offset)].map((example) => ({
    id: example.id,
    prompt: localize(t, example.en, example.ko)
  }));
}

function randomFactoryChatExampleRound(): number {
  return Math.floor(Math.random() * factoryChatExampleCycleLength);
}

function nextFactoryChatExampleRound(current: number): number {
  return (current + 1) % factoryChatExampleCycleLength;
}

function persistFactoryChatExampleRound(round: number): void {
  try {
    window.localStorage.setItem(factoryChatExampleStorageKey, String(round));
  } catch {
    // Example rotation still works in memory when browser storage is unavailable.
  }
}

function nextPersistedFactoryChatExampleRound(): number {
  try {
    const stored = window.localStorage.getItem(factoryChatExampleStorageKey);
    const previous = stored === null ? Number.NaN : Number.parseInt(stored, 10);
    const next = Number.isInteger(previous) && previous >= 0 && previous < factoryChatExampleCycleLength
      ? nextFactoryChatExampleRound(previous)
      : randomFactoryChatExampleRound();
    persistFactoryChatExampleRound(next);
    return next;
  } catch {
    return randomFactoryChatExampleRound();
  }
}

function waitForFactoryMotion(ms = factoryStepDelayMs): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function PluginFactory({
  t,
  currentUser,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser | null;
  onChanged: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<VaultPluginTemplate[]>([]);
  const [filter, setFilter] = useState<PluginFilter>("all");
  const [selectedId, setSelectedId] = useState("");
  const [pluginName, setPluginName] = useState("");
  const [mountPath, setMountPath] = useState("");
  const [version, setVersion] = useState("v0.1.0");
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");
  const [artifactSha256, setArtifactSha256] = useState("");
  const [generated, setGenerated] = useState<VaultPluginGenerateResult | null>(null);
  const [applyResult, setApplyResult] = useState<VaultPluginApplyResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "chat" | "generate" | "repair" | "apply" | null>("load");
  const [chatInput, setChatInput] = useState("");
  const welcomeMessage = factoryWelcomeMessage(t);
  const [chatMessages, setChatMessages] = useState<PluginChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: welcomeMessage
    }
  ]);
  const [factoryJob, setFactoryJob] = useState<FactoryJobState | null>(null);
  const [activeChatPrompt, setActiveChatPrompt] = useState<string | null>(null);
  const [chatExampleRound, setChatExampleRound] = useState(0);
  const [assistantRuntime, setAssistantRuntime] = useState<
    Pick<FactoryAssistantResult, "provider" | "model" | "fallbackReason"> & { checked: boolean }
  >({ provider: "rules", checked: false });
  const [activeFilePath, setActiveFilePath] = useState("");
  const [savedBlueprints, setSavedBlueprints] = useState<string[]>([]);
  const [pluginHistory, setPluginHistory] = useState<PluginFactoryHistoryItem[]>([]);
  const [rollbackPreview, setRollbackPreview] = useState<string | null>(null);
  const [activeFactoryTab, setActiveFactoryTab] = useState<FactoryTab>("workspace");
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [mobileFactoryPane, setMobileFactoryPane] = useState<"design" | "status">("design");
  const [templateQuery, setTemplateQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<string[]>([]);
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const [compareTemplateIds, setCompareTemplateIds] = useState<string[]>([]);
  const [draftFiles, setDraftFiles] = useState<VaultPluginGeneratedFile[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const [fileEditorMode, setFileEditorMode] = useState<FileEditorMode>("preview");
  const [fileFullscreen, setFileFullscreen] = useState(false);
  const [copiedFilePath, setCopiedFilePath] = useState<string | null>(null);
  const [factoryJobs, setFactoryJobs] = useState<VaultPluginFactoryJob[]>([]);
  const [activeJobId, setActiveJobId] = useState("");
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [factoryClock, setFactoryClock] = useState(() => Date.now());
  const [historyAction, setHistoryAction] = useState<FactoryHistoryAction | null>(null);
  const [historyActionBusy, setHistoryActionBusy] = useState(false);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [approvalNote, setApprovalNote] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [rollbackConfirmed, setRollbackConfirmed] = useState(false);
  const [removeCatalogOnRollback, setRemoveCatalogOnRollback] = useState(false);
  const [rollbackResult, setRollbackResult] = useState<VaultPluginRollbackResult | null>(null);
  const [mountConflictPath, setMountConflictPath] = useState<string | null>(null);
  const [mountInspection, setMountInspection] = useState<VaultPluginMountInspectionResult | null>(null);
  const [mountInspectionJobId, setMountInspectionJobId] = useState("");
  const [mountInspectionError, setMountInspectionError] = useState<string | null>(null);
  const [mountRemovalConfirmation, setMountRemovalConfirmation] = useState("");
  const [mountRemovalResult, setMountRemovalResult] = useState<VaultPluginMountRemovalResult | null>(null);
  const [mountActionBusy, setMountActionBusy] = useState<"inspect" | "remove" | null>(null);
  const [requirementsInterview, setRequirementsInterview] = useState<VaultPluginRequirementsInterview | null>(null);
  const [activeRequirementStep, setActiveRequirementStep] = useState<FactoryRequirementStep>("targetSystem");
  const [autoRepair, setAutoRepair] = useState<VaultPluginAutoRepairResult | null>(null);
  const [factoryRuntime, setFactoryRuntime] = useState<FactoryRuntime>({
    vaultMode: "mock",
    buildMode: "static",
    requiredMountPrefix: ""
  });
  const factoryJobsRef = useRef<VaultPluginFactoryJob[]>([]);
  const workspaceIdRef = useRef(createFactoryWorkspaceId());
  const jobCreationRef = useRef<{ workspaceId: string; promise: Promise<VaultPluginFactoryJob> } | null>(null);
  const activeJobIdRef = useRef("");
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const factoryChatPanelRef = useRef<HTMLElement | null>(null);
  const factoryCodeConsoleRef = useRef<HTMLDivElement | null>(null);
  const factoryCodeConsoleLogRef = useRef<HTMLPreElement | null>(null);
  const canApply = currentUser?.roles.includes("vault-admin") ?? false;
  const canReviewJobs = currentUser?.roles.some((role) => role === "security-approver" || role === "vault-admin") ?? false;
  const canAuthorJobs = currentUser?.roles.some((role) => role === "developer" || role === "app-owner" || role === "vault-admin") ?? false;
  const scaffoldDownload = useMemo(() => {
    if (!generated) return null;
    const files = draftFiles.length ? draftFiles : generated.files;
    const payload = JSON.stringify(
      {
        pluginName: generated.pluginName,
        mountPath: generated.mountPath,
        version: generated.version,
        command: generated.command,
        scaffoldSha256: generated.scaffoldSha256,
        files
      },
      null,
      2
    );
    return {
      href: `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`,
      filename: `${generated.pluginName}-scaffold.json`
    };
  }, [draftFiles, generated]);

  useEffect(() => {
    let mounted = true;
    async function loadTemplates() {
      setBusy("load");
      try {
        const [response, assistantHealth, jobsResponse] = await Promise.all([
          api<{ templates: VaultPluginTemplate[]; runtime: FactoryRuntime }>("/plugin-factory/templates"),
          api<FactoryAssistantHealth>("/health/llm").catch(() => null),
          api<{ jobs: VaultPluginFactoryJob[] }>("/plugin-factory/jobs")
        ]);
        if (!mounted) return;
        setTemplates(response.templates);
        setFactoryRuntime(response.runtime);
        setAssistantRuntime(
          assistantHealth
            ? { provider: assistantHealth.provider, model: assistantHealth.model, checked: true }
            : { provider: "rules", fallbackReason: "unavailable", checked: true }
        );
        factoryJobsRef.current = jobsResponse.jobs;
        setFactoryJobs(jobsResponse.jobs);
        const first = response.templates[0];
        if (first) {
          setSelectedId(first.id);
          hydratePluginForm(first);
        }
        setWorkspaceReady(true);
        setStatus(null);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Unable to load plugin templates");
        setWorkspaceReady(true);
      } finally {
        if (mounted) setBusy(null);
      }
    }
    void loadTemplates();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setChatMessages((messages) =>
      messages.length === 1 && messages[0]?.id === "welcome" ? [{ ...messages[0], content: welcomeMessage }] : messages
    );
  }, [welcomeMessage]);

  useEffect(() => {
    if (draftFiles.length && !draftFiles.some((file) => file.path === activeFilePath)) {
      setActiveFilePath(draftFiles[0]?.path ?? "");
    }
  }, [activeFilePath, draftFiles]);

  useEffect(() => {
    activeJobIdRef.current = activeJobId;
  }, [activeJobId]);

  useEffect(() => {
    if (!requirementsInterview || activeRequirementStep === "review") return;
    const frame = window.requestAnimationFrame(() => {
      const panel = factoryChatPanelRef.current;
      const question = panel?.querySelector<HTMLElement>(`#requirement-question-${activeRequirementStep}`);
      if (!panel || !question) return;
      const panelRect = panel.getBoundingClientRect();
      const questionRect = question.getBoundingClientRect();
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      if (window.matchMedia("(max-width: 640px)").matches) {
        window.scrollTo({
          top: Math.max(0, window.scrollY + questionRect.top - 148),
          behavior
        });
        return;
      }
      const composer = panel.querySelector<HTMLElement>(".chatComposer");
      const composerTop = composer?.getBoundingClientRect().top ?? panelRect.bottom;
      let scrollDelta = questionRect.top - (panelRect.top + 84);
      const projectedQuestionBottom = questionRect.bottom - scrollDelta;
      if (projectedQuestionBottom > composerTop - 16) {
        scrollDelta += projectedQuestionBottom - (composerTop - 16);
      }
      panel.scrollTo({
        top: Math.max(0, panel.scrollTop + scrollDelta),
        behavior
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeRequirementStep, requirementsInterview?.id]);

  useEffect(() => {
    if (!factoryJob) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = factoryChatPanelRef.current;
      const consoleElement = factoryCodeConsoleRef.current;
      const logElement = factoryCodeConsoleLogRef.current;
      if (logElement) logElement.scrollTop = logElement.scrollHeight;
      if (!panel || !consoleElement) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (window.matchMedia("(max-width: 900px)").matches) {
        const consoleRect = consoleElement.getBoundingClientRect();
        if (consoleRect.top < 76 || consoleRect.bottom > window.innerHeight - 24) {
          consoleElement.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
        }
        return;
      }

      const panelRect = panel.getBoundingClientRect();
      const consoleRect = consoleElement.getBoundingClientRect();
      const composerTop = panel.querySelector<HTMLElement>(".chatComposer")?.getBoundingClientRect().top ?? panelRect.bottom;
      const visibleTop = panelRect.top + 16;
      const visibleBottom = composerTop - 16;
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      let scrollDelta = 0;

      if (consoleRect.height >= visibleHeight) {
        scrollDelta = consoleRect.top - visibleTop;
      } else if (consoleRect.bottom > visibleBottom) {
        scrollDelta = consoleRect.bottom - visibleBottom;
      } else if (consoleRect.top < visibleTop) {
        scrollDelta = consoleRect.top - visibleTop;
      }

      if (Math.abs(scrollDelta) > 1) {
        panel.scrollTo({
          top: Math.max(0, panel.scrollTop + scrollDelta),
          behavior: reducedMotion ? "auto" : "smooth"
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [factoryJob?.label, factoryJob?.lines.length, factoryJob?.status]);

  useEffect(() => {
    if (factoryJob?.status !== "running") return;
    setFactoryClock(Date.now());
    const interval = window.setInterval(() => setFactoryClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [factoryJob?.status, factoryJob?.startedAt]);

  useEffect(() => {
    if (!status) return;
    const statusClass = factoryStatusClassName(status);
    notifyPortal(status, statusClass === "error" ? "danger" : statusClass === "warningLine" ? "warning" : "success");
  }, [status]);

  useEffect(() => {
    setChatExampleRound(nextPersistedFactoryChatExampleRound());
  }, []);

  const selectedTemplate = templates.find((template) => template.id === selectedId) ?? templates[0];
  const normalizedTemplateQuery = templateQuery.trim().toLowerCase();
  const filteredTemplates = templates
    .filter((template) => templateMatchesFilter(template, filter))
    .filter((template) => !favoriteOnly || favoriteTemplateIds.includes(template.id))
    .filter((template) => {
      if (!normalizedTemplateQuery) return true;
      return [
        template.displayName,
        template.name,
        template.description,
        template.integrationTarget,
        template.tags.join(" "),
        template.marketplace.badges.join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedTemplateQuery);
    })
    .sort((a, b) => {
      const aRecent = recentTemplateIds.indexOf(a.id);
      const bRecent = recentTemplateIds.indexOf(b.id);
      if (aRecent === -1 && bRecent === -1) return a.displayName.localeCompare(b.displayName);
      if (aRecent === -1) return 1;
      if (bRecent === -1) return -1;
      return aRecent - bRecent;
    });
  const counts: Record<PluginFilter, number> = {
    all: templates.length,
    auth: templates.filter((template) => template.pluginType === "auth").length,
    secret: templates.filter((template) => template.pluginType === "secret").length,
    database: templates.filter((template) => template.pluginType === "database").length,
    partner: templates.filter((template) => template.source === "partner").length,
    community: templates.filter((template) => template.source === "community").length,
    learning: templates.filter((template) => template.source === "learning").length
  };
  const chatExamples = useMemo(
    () => factoryChatExamplesForRound(t, chatExampleRound),
    [chatExampleRound, t]
  );
  const currentJob = factoryJobs.find((job) => job.id === activeJobId);
  const recordedMountConflictPath = currentJob ? factoryMountConflictPath(currentJob) : null;
  const activeMountConflictPath = mountConflictPath ?? recordedMountConflictPath ?? (mountInspection?.exists ? mountInspection.mountPath : null);
  const mountRecoveryPath = activeMountConflictPath ?? normalizeFactoryMountPath(generated?.mountPath ?? mountPath);
  const mountConfirmationMatches = Boolean(
    activeMountConflictPath && normalizeFactoryMountPath(mountRemovalConfirmation) === activeMountConflictPath
  );
  const factoryWorkspaceSwitchBlocked = busy === "load" || busy === "apply" || mountActionBusy !== null;
  const factoryBuildPhase = autoRepair?.phase ?? (autoRepair?.status === "pass" ? "complete" : autoRepair?.status === "cancelled" ? "cancelled" : "queued");
  const factoryBuildAttempt = autoRepair
    ? Math.min(autoRepair.activeAttempt ?? autoRepair.attempts.length + 1, autoRepair.maxAttempts)
    : 1;
  const factoryBuildProgressValue = autoRepair ? factoryAutoRepairProgress(autoRepair) : 10;
  const factoryBuildElapsedMs = autoRepair?.startedAt
    ? Math.max(0, Date.parse(autoRepair.completedAt ?? new Date(factoryClock).toISOString()) - Date.parse(autoRepair.startedAt))
    : factoryJob
      ? Math.max(0, factoryClock - factoryJob.startedAt)
      : 0;
  const historyActionJob = historyAction ? factoryJobs.find((job) => job.id === historyAction.jobId) : undefined;
  const factoryProgress = currentJob?.progress ?? (generated ? 70 : 10);
  const ownsCurrentJob = Boolean(currentJob && currentUser && currentJob.ownerId === currentUser.id);
  const canConfigureDeployment = ownsCurrentJob || canReviewJobs;
  const canRequestApproval = ownsCurrentJob || canApply;
  const compareTemplates = compareTemplateIds
    .map((id) => templates.find((template) => template.id === id))
    .filter((template): template is VaultPluginTemplate => Boolean(template));
  const filteredFiles = draftFiles.filter((file) => {
    const query = fileQuery.trim().toLowerCase();
    return !query || file.path.toLowerCase().includes(query) || file.content.toLowerCase().includes(query);
  });
  const activeFile = draftFiles.find((file) => file.path === activeFilePath) ?? draftFiles[0];
  const originalFile = generated?.files.find((file) => file.path === activeFile?.path);
  const activeFileDiff = fileDiffSummary(originalFile?.content ?? "", activeFile?.content ?? "");
  const highFindings = generated?.securityReview.findings.filter((finding) => finding.severity === "high").length ?? 0;
  const generatedDisplay = generated ? factoryGeneratedDisplay(generated, t) : null;
  const requirementQuestions = useMemo(() => factoryRequirementQuestions(t, selectedTemplate), [selectedTemplate, t]);
  const completedRequirementCount = requirementsInterview ? requirementQuestions.length - requirementsInterview.missingFields.length : 0;
  const activeRequirementQuestion = activeRequirementStep === "review"
    ? null
    : requirementQuestions.find((question) => question.field === activeRequirementStep) ?? requirementQuestions[0];
  const activeRequirementIndex = activeRequirementQuestion
    ? requirementQuestions.findIndex((question) => question.field === activeRequirementQuestion.field)
    : -1;
  const activeRequirementValue = requirementsInterview && activeRequirementQuestion
    ? requirementsInterview.spec[activeRequirementQuestion.field]
    : "";
  const artifactChecksumMatches = Boolean(
    generated?.buildArtifact &&
      generated.buildArtifact.sha256 === artifactSha256 &&
      /^[a-f0-9]{64}$/i.test(artifactSha256)
  );
  const artifactStoredForRuntime = Boolean(
    factoryRuntime.vaultMode !== "real" ||
      (generated?.buildArtifact?.bucket && generated.buildArtifact.key)
  );
  const buildSourceMatches = Boolean(
    autoRepair?.status === "pass" && factoryBuildFilesMatch(draftFiles, autoRepair.files)
  );
  const verifiedBuildArtifactReady = Boolean(
    autoRepair?.status === "pass" && buildSourceMatches && artifactChecksumMatches && artifactStoredForRuntime
  );
  const artifactPreflightDetail = !generated?.buildArtifact
    ? localize(t, "Run the isolated build", "격리 Build를 실행하세요")
    : autoRepair?.status !== "pass"
      ? localize(t, "Waiting for verified build", "검증된 Build 완료를 기다리는 중")
      : !buildSourceMatches
        ? localize(t, "Source changed after build", "Build 후 Source 변경됨")
      : !artifactChecksumMatches
        ? localize(t, "Checksum mismatch", "Checksum 불일치")
        : !artifactStoredForRuntime
          ? localize(t, "Waiting for stored artifact", "저장된 Artifact 동기화 대기")
          : shortId(artifactSha256);
  const pluginRolledBack = Boolean(rollbackResult?.rolledBack || currentJob?.status === "rolled-back");
  const appliedPluginReady = Boolean(
    !pluginRolledBack &&
      (applyResult?.applied ||
        (currentJob?.status === "complete" && currentJob.deployment.rollbackReady))
  );
  const inspectedCurrentMount =
    mountInspectionJobId === currentJob?.id &&
    mountInspection?.mountPath === normalizeFactoryMountPath(generated?.mountPath ?? "")
      ? mountInspection
      : null;
  const mountRemovalVerified = Boolean(
    mountRemovalResult?.removed &&
      mountRemovalResult.mountPath === normalizeFactoryMountPath(generated?.mountPath ?? "")
  );
  const mountAvailabilityPassed = Boolean(
    appliedPluginReady || mountRemovalVerified || (inspectedCurrentMount && !inspectedCurrentMount.exists)
  );
  const mountConflictDetected = Boolean(!appliedPluginReady && inspectedCurrentMount?.exists);
  const mountAvailabilityDetail = appliedPluginReady
    ? localize(t, "Applied", "적용 완료")
    : mountRemovalVerified
      ? localize(t, "Removal verified", "삭제 확인 완료")
      : mountInspectionError
        ? localize(t, "Inspection failed", "확인 실패")
        : mountActionBusy === "inspect"
          ? localize(t, "Inspecting Vault", "Vault 확인 중")
          : inspectedCurrentMount?.exists
            ? localize(t, `Conflict: ${inspectedCurrentMount.mountType ?? inspectedCurrentMount.mountPath}`, `충돌: ${inspectedCurrentMount.mountType ?? inspectedCurrentMount.mountPath}`)
            : inspectedCurrentMount
              ? localize(t, "Path available", "사용 가능한 경로")
              : localize(t, "Waiting for inspection", "Mount 확인 대기");
  const preflightChecks = [
    {
      label: factoryLocalize(t, "Build and tests", "빌드 및 테스트"),
      detail: generated ? factoryStatusLabel(generated.buildTest.status, t) : factoryLocalize(t, "Not run", "미실행"),
      pass: generated?.buildTest.status === "pass"
    },
    {
      label: localize(t, "Security review", "보안 검토"),
      detail: generated
        ? factoryLocalize(t, `${generated.securityReview.score}/100 · ${highFindings} high`, `${generated.securityReview.score}/100 · 높음 ${highFindings}건`)
        : localize(t, "Not run", "미실행"),
      pass: Boolean(generated && generated.securityReview.posture !== "blocked" && highFindings === 0)
    },
    {
      label: localize(t, "Artifact checksum", "아티팩트 체크섬"),
      detail: artifactPreflightDetail,
      pass: verifiedBuildArtifactReady
    },
    {
      label: localize(t, "Mount availability", "Mount 사용 가능 여부"),
      detail: mountAvailabilityDetail,
      pass: mountAvailabilityPassed,
      conflict: mountConflictDetected
    },
    {
      label: localize(t, "Approval", "승인"),
      detail: factoryStatusLabel(currentJob?.approval.status ?? "not-requested", t),
      pass: currentJob?.approval.status === "approved"
    }
  ];
  const approvalPreflightPassed = preflightChecks.slice(0, 3).every((check) => check.pass);
  const preflightPassed = preflightChecks.every((check) => check.pass);
  const rollbackAvailable = Boolean(
    !pluginRolledBack &&
      (applyResult?.applied ||
        (currentJob?.deployment.rollbackReady &&
          (currentJob.status === "complete" || currentJob.status === "failed")))
  );
  const applyInProgress = currentJob?.status === "running" && currentJob.stage === "deploy";
  const workflowStages = [
    {
      id: "design",
      label: localize(t, "Requirements", "요구사항"),
      complete: Boolean(requirementsInterview?.spec.confirmed || generated)
    },
    { id: "generate", label: localize(t, "Code generation", "코드 생성"), complete: Boolean(generated) },
    { id: "test", label: factoryLocalize(t, "Build and test", "빌드 및 테스트"), complete: generated?.buildTest.status === "pass" },
    {
      id: "security-review",
      label: factoryLocalize(t, "Diff review", "변경 사항 검토"),
      complete: Boolean(generated && generated.securityReview.posture !== "blocked")
    },
    { id: "approval", label: localize(t, "Approval", "승인"), complete: currentJob?.approval.status === "approved" },
    { id: "deploy", label: localize(t, "Vault apply", "Vault 적용"), complete: appliedPluginReady || pluginRolledBack }
  ];
  const currentWorkflowStage = workflowStages.find((stage) => !stage.complete) ?? workflowStages[workflowStages.length - 1];
  const completedWorkflowCount = workflowStages.filter((stage) => stage.complete).length;
  const roleHome = factoryRoleHome(currentUser, factoryJobs, generated, favoriteTemplateIds.length, t);
  const factoryLaunchers: Array<{ id: Exclude<FactoryTab, "workspace">; icon: LucideIcon; label: string; status: string }> = [
    {
      id: "discover",
      icon: PackageSearch,
      label: localize(t, "Catalog", "카탈로그"),
      status: `${templates.length}`
    },
    {
      id: "review",
      icon: ListChecks,
      label: localize(t, "Operations", "운영"),
      status: "10"
    },
    ...(generated
      ? [
          {
            id: "files" as const,
            icon: Files,
            label: localize(t, "Generated files", "생성 파일"),
            status: `${draftFiles.length}`
          },
          {
            id: "build" as const,
            icon: Code2,
            label: factoryLocalize(t, "Build plan", "빌드 계획"),
            status: factoryStatusLabel(generated.buildTest.status, t)
          },
          {
            id: "deploy" as const,
            icon: pluginRolledBack ? Undo2 : appliedPluginReady ? CheckCircle2 : Rocket,
            label: pluginRolledBack || appliedPluginReady || applyResult
              ? localize(t, "Apply result", "적용 결과")
              : localize(t, "Apply", "적용"),
            status: factoryStatusLabel(
              pluginRolledBack
                ? "rolled-back"
                : appliedPluginReady
                  ? "complete"
                  : currentJob?.status === "failed"
                    ? "failed"
                    : currentJob?.approval.status ?? "draft",
              t
            )
          }
        ]
      : []),
    {
      id: "history",
      icon: History,
      label: localize(t, "Job history", "작업 이력"),
      status: `${factoryJobs.length}`
    }
  ];
  const capabilityCards = [
    ["1", localize(t, "Dry-run diff", "Dry-run 변경점"), generated ? generated.dryRun.changes.length : 0],
    ["2", localize(t, "AI spec interview", "AI 질문형 설계"), requirementsInterview ? 7 - requirementsInterview.missingFields.length : 0],
    ["3", localize(t, "Code preview", "코드 미리보기"), draftFiles.length],
    ["4", localize(t, "Build/Test", "빌드/테스트"), generated ? generated.buildTest.steps.length : 0],
    ["5", localize(t, "Apply guardrails", "적용 안전장치"), generated ? generated.dryRun.approvals.length : 0],
    ["6", localize(t, "Blueprint save", "Blueprint 저장"), savedBlueprints.length],
    [
      "7",
      localize(t, "Marketplace", "마켓플레이스"),
      templates.filter((template) => template.source === "community" || template.source === "partner").length
    ],
    ["8", localize(t, "History", "생성 이력"), pluginHistory.length],
    ["9", localize(t, "Rollback", "롤백"), generated?.rollbackPlan.available ? 1 : 0],
    ["10", localize(t, "Security review", "보안 리뷰"), generated ? generated.securityReview.findings.length : 0]
  ];
  const formModified = Boolean(
    selectedTemplate &&
      (pluginName !== selectedTemplate.name ||
        mountPath !== selectedTemplate.defaultMountPath ||
        version !== selectedTemplate.defaultVersion ||
        command !== selectedTemplate.defaultCommand ||
        description !== selectedTemplate.description)
  );
  const hasPersistableWorkspace = Boolean(
    currentJob || requirementsInterview || generated || draftFiles.length || formModified
  );

  useEffect(() => {
    if (
      activeFactoryTab !== "deploy" ||
      !currentJob ||
      !generated ||
      appliedPluginReady ||
      pluginRolledBack ||
      busy === "load" ||
      mountInspectionJobId === currentJob.id
    ) return;
    void inspectExistingFactoryMount();
  }, [activeFactoryTab, appliedPluginReady, busy, currentJob?.id, generated?.id, mountInspectionJobId, pluginRolledBack]);

  useEffect(() => {
    if (!workspaceReady || !currentUser || busy !== null || !selectedId || !hasPersistableWorkspace) return;
    const workspaceId = workspaceIdRef.current;
    const timer = window.setTimeout(() => {
      void persistFactoryWorkspace(workspaceId);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    workspaceReady,
    activeJobId,
    activeFactoryTab,
    selectedId,
    pluginName,
    mountPath,
    version,
    command,
    description,
    artifactSha256,
    chatMessages,
    generated,
    applyResult,
    rollbackResult,
    draftFiles,
    activeFilePath,
    savedBlueprints,
    pluginHistory,
    favoriteTemplateIds,
    recentTemplateIds,
    compareTemplateIds,
    requirementsInterview,
    autoRepair
  ]);

  function factoryWorkspaceSnapshot(): FactoryWorkspaceSnapshot {
    return {
      workspaceId: workspaceIdRef.current,
      activeTab: activeFactoryTab,
      selectedId,
      pluginName,
      mountPath,
      version,
      command,
      description,
      artifactSha256,
      chatMessages: chatMessages.slice(-40),
      generated: generated ?? undefined,
      applyResult: applyResult ?? undefined,
      rollbackResult: rollbackResult ?? undefined,
      draftFiles,
      activeFilePath,
      savedBlueprints,
      pluginHistory,
      favoriteTemplateIds,
      recentTemplateIds,
      compareTemplateIds,
      requirementsInterview: requirementsInterview ?? undefined,
      autoRepair: autoRepair ?? undefined
    };
  }

  function hydrateFactoryWorkspace(snapshot: FactoryWorkspaceSnapshot, availableTemplates: VaultPluginTemplate[]) {
    resetExistingMountRecovery();
    const buildState = resolveFactoryWorkspaceBuild(snapshot);
    const template = availableTemplates.find((item) => item.id === snapshot.selectedId) ?? availableTemplates[0];
    if (template) {
      setSelectedId(template.id);
      setPluginName(snapshot.pluginName ?? template.name);
      setMountPath(snapshot.mountPath ?? template.defaultMountPath);
      setVersion(snapshot.version ?? template.defaultVersion);
      setCommand(snapshot.command ?? template.defaultCommand);
      setDescription(snapshot.description ?? template.description);
    }
    setActiveFactoryTab("workspace");
    setArtifactSha256(buildState.artifactSha256);
    setChatMessages(snapshot.chatMessages?.length ? snapshot.chatMessages : [{ id: "welcome", role: "assistant", content: welcomeMessage }]);
    setGenerated(buildState.generated);
    setApplyResult(snapshot.applyResult ?? null);
    setRollbackResult(snapshot.rollbackResult ?? null);
    setDraftFiles(buildState.files);
    setActiveFilePath(snapshot.activeFilePath ?? buildState.files[0]?.path ?? "");
    setSavedBlueprints(snapshot.savedBlueprints ?? []);
    setPluginHistory(snapshot.pluginHistory ?? []);
    setFavoriteTemplateIds(snapshot.favoriteTemplateIds ?? []);
    setRecentTemplateIds(snapshot.recentTemplateIds ?? []);
    setCompareTemplateIds(snapshot.compareTemplateIds?.slice(0, 2) ?? []);
    const interview = snapshot.requirementsInterview ?? null;
    setRequirementsInterview(interview);
    setActiveRequirementStep(
      interview?.spec.confirmed || interview?.readyToConfirm
        ? "review"
        : interview?.missingFields[0] ?? "targetSystem"
    );
    setAutoRepair(buildState.autoRepair);
  }

  function upsertFactoryJob(job: VaultPluginFactoryJob) {
    const nextJobs = [job, ...factoryJobsRef.current.filter((item) => item.id !== job.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    factoryJobsRef.current = nextJobs;
    setFactoryJobs(nextJobs);
  }

  function activeFactoryJob(): VaultPluginFactoryJob | undefined {
    return factoryJobsRef.current.find((job) => job.id === activeJobIdRef.current);
  }

  function isCurrentFactoryWorkspace(workspaceId: string, jobId?: string): boolean {
    return workspaceIdRef.current === workspaceId && (!jobId || activeJobIdRef.current === jobId);
  }

  async function ensureFactoryJob(workspaceId = workspaceIdRef.current): Promise<VaultPluginFactoryJob> {
    if (workspaceIdRef.current !== workspaceId) throw new Error("Factory workspace changed before the job was ready");
    const activeJob = activeFactoryJob();
    if (activeJob && currentUser && activeJob.ownerId === currentUser.id) return activeJob;
    if (jobCreationRef.current?.workspaceId === workspaceId) return jobCreationRef.current.promise;
    const snapshot = { ...factoryWorkspaceSnapshot(), workspaceId };
    const creation = api<{ job: VaultPluginFactoryJob }>("/plugin-factory/jobs", {
      method: "POST",
      body: JSON.stringify({
        templateId: selectedTemplate?.id,
        pluginName: pluginName || selectedTemplate?.name || "vault-plugin-draft",
        snapshot
      })
    }).then((response) => {
      upsertFactoryJob(response.job);
      if (workspaceIdRef.current === workspaceId) {
        setActiveJobId(response.job.id);
        activeJobIdRef.current = response.job.id;
      }
      return response.job;
    });
    const pendingCreation = { workspaceId, promise: creation };
    jobCreationRef.current = pendingCreation;
    try {
      return await creation;
    } finally {
      if (jobCreationRef.current === pendingCreation) jobCreationRef.current = null;
    }
  }

  async function patchFactoryJob(
    patch: Partial<Pick<VaultPluginFactoryJob, "templateId" | "pluginName" | "historyTitle" | "historyNote" | "status" | "stage" | "progress" | "snapshot" | "events" | "deployment">>
  ): Promise<VaultPluginFactoryJob> {
    const job = await ensureFactoryJob();
    return patchFactoryJobById(job.id, patch);
  }

  async function patchFactoryJobById(
    jobId: string,
    patch: Partial<Pick<VaultPluginFactoryJob, "templateId" | "pluginName" | "historyTitle" | "historyNote" | "status" | "stage" | "progress" | "snapshot" | "events" | "deployment">>
  ): Promise<VaultPluginFactoryJob> {
    const current = factoryJobsRef.current.find((job) => job.id === jobId);
    if (patch.snapshot && !current) throw new Error("Unable to version the Factory workspace save");
    const response = await api<{ job: VaultPluginFactoryJob }>(`/plugin-factory/jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...patch,
        ...(patch.snapshot ? { expectedUpdatedAt: current?.updatedAt } : {})
      })
    });
    upsertFactoryJob(response.job);
    return response.job;
  }

  async function persistFactoryWorkspace(workspaceId = workspaceIdRef.current) {
    if (!workspaceReady || !selectedTemplate || !canAuthorJobs) return;
    if (workspaceIdRef.current !== workspaceId) return;
    const activeJob = activeFactoryJob();
    if (activeJob && activeJob.ownerId !== currentUser?.id) return;
    setWorkspaceSaving(true);
    try {
      const snapshot = { ...factoryWorkspaceSnapshot(), workspaceId } as unknown as Record<string, unknown>;
      if (activeJob) {
        const response = await api<{ job: VaultPluginFactoryJob }>(`/plugin-factory/jobs/${activeJob.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            templateId: selectedTemplate.id,
            pluginName: pluginName || selectedTemplate.name,
            snapshot,
            expectedUpdatedAt: activeJob.updatedAt
          })
        });
        upsertFactoryJob(response.job);
      } else {
        await ensureFactoryJob(workspaceId);
      }
    } catch (err) {
      if (workspaceIdRef.current === workspaceId) {
        const detail = err instanceof Error ? err.message : localize(t, "Unable to save Factory workspace.", "Factory 작업을 저장하지 못했습니다.");
        if (activeJob && detail.startsWith("409 ")) {
          const jobs = await refreshFactoryJobs().catch(() => []);
          const latest = jobs.find((job) => job.id === activeJob.id);
          if (latest && workspaceIdRef.current === workspaceId) {
            reconcileFactoryBuildState(latest.snapshot as FactoryWorkspaceSnapshot);
            setStatus(localize(t, "Factory build state was refreshed before saving again.", "최신 Factory Build 상태를 반영한 뒤 다시 저장합니다."));
          }
        } else {
          setStatus(detail);
        }
      }
    } finally {
      if (workspaceIdRef.current === workspaceId) setWorkspaceSaving(false);
    }
  }

  function resetExistingMountRecovery() {
    setMountConflictPath(null);
    setMountInspection(null);
    setMountInspectionJobId("");
    setMountInspectionError(null);
    setMountRemovalConfirmation("");
    setMountRemovalResult(null);
    setMountActionBusy(null);
  }

  function reconcileFactoryBuildState(snapshot: FactoryWorkspaceSnapshot) {
    const buildState = resolveFactoryWorkspaceBuild(snapshot);
    setGenerated(buildState.generated);
    setDraftFiles(buildState.files);
    setArtifactSha256(buildState.artifactSha256);
    setAutoRepair(buildState.autoRepair);
    setActiveFilePath((currentPath) =>
      buildState.files.some((file) => file.path === currentPath) ? currentPath : buildState.files[0]?.path ?? ""
    );
  }

  function hydratePluginForm(template: VaultPluginTemplate) {
    setPluginName(template.name);
    setMountPath(template.defaultMountPath);
    setVersion(template.defaultVersion);
    setCommand(template.defaultCommand);
    setDescription(template.description);
    setArtifactSha256("");
    setGenerated(null);
    setDraftFiles([]);
    setActiveFilePath("");
    setApplyResult(null);
    setRollbackResult(null);
    resetExistingMountRecovery();
  }

  function chooseTemplate(template: VaultPluginTemplate) {
    setSelectedId(template.id);
    setRecentTemplateIds((ids) => [template.id, ...ids.filter((id) => id !== template.id)].slice(0, 8));
    hydratePluginForm(template);
    setStatus(null);
  }

  function changeFilter(nextFilter: PluginFilter) {
    setFilter(nextFilter);
    if (selectedTemplate && templateMatchesFilter(selectedTemplate, nextFilter)) return;
    const firstMatch = templates.find((template) => templateMatchesFilter(template, nextFilter));
    if (firstMatch) chooseTemplate(firstMatch);
  }

  function toggleFavorite(templateId: string) {
    setFavoriteTemplateIds((ids) => (ids.includes(templateId) ? ids.filter((id) => id !== templateId) : [templateId, ...ids]));
  }

  function toggleComparison(templateId: string) {
    setCompareTemplateIds((ids) => {
      if (ids.includes(templateId)) return ids.filter((id) => id !== templateId);
      return [...ids.slice(-1), templateId];
    });
  }

  async function refreshFactoryJobs() {
    const response = await api<{ jobs: VaultPluginFactoryJob[] }>("/plugin-factory/jobs");
    factoryJobsRef.current = response.jobs;
    setFactoryJobs(response.jobs);
    const updated = response.jobs.find((job) => job.id === activeJobIdRef.current);
    if (updated) upsertFactoryJob(updated);
    return response.jobs;
  }

  function canManageFactoryHistory(job: VaultPluginFactoryJob): boolean {
    return Boolean(currentUser && (job.ownerId === currentUser.id || currentUser.roles.includes("vault-admin")));
  }

  function canDeleteFactoryHistory(job: VaultPluginFactoryJob): boolean {
    return canManageFactoryHistory(job) && !(["running", "waiting-approval", "approved", "scheduled"] as VaultPluginFactoryJob["status"][]).includes(job.status);
  }

  function canCancelFactoryJob(job: VaultPluginFactoryJob): boolean {
    return canManageFactoryHistory(job) && (["running", "waiting-approval", "approved", "scheduled"] as VaultPluginFactoryJob["status"][]).includes(job.status);
  }

  async function cancelFactoryJob(job: VaultPluginFactoryJob) {
    if (!canCancelFactoryJob(job) || cancellingJobId) return;
    setCancellingJobId(job.id);
    setStatus(null);
    try {
      const response = await api<{ job: VaultPluginFactoryJob }>(`/plugin-factory/jobs/${job.id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action: "cancel",
          note: localize(t, "Cancelled by the operator before Vault apply", "Vault 적용 전 운영자가 작업을 취소함")
        })
      });
      upsertFactoryJob(response.job);
      if (job.id === activeJobIdRef.current) {
        finishFactoryJob("cancelled", localize(t, "■ build cancelled before Vault apply", "■ Vault 적용 전 빌드 취소 완료"));
      }
      setStatus(localize(t, `Cancelled ${job.pluginName}. It can now be deleted from history.`, `${job.pluginName} 작업을 취소했습니다. 이제 이력에서 삭제할 수 있습니다.`));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : localize(t, "Unable to cancel the Factory job.", "Factory 작업을 취소하지 못했습니다."));
    } finally {
      setCancellingJobId(null);
    }
  }

  function openFactoryHistoryAction(job: VaultPluginFactoryJob, mode: FactoryHistoryAction["mode"]) {
    setHistoryAction({
      mode,
      jobId: job.id,
      title: job.historyTitle?.trim() || job.pluginName,
      note: job.historyNote ?? ""
    });
    setHistoryActionError(null);
  }

  function closeFactoryHistoryAction() {
    if (historyActionBusy) return;
    setHistoryAction(null);
    setHistoryActionError(null);
  }

  async function saveFactoryHistoryDetails() {
    if (!historyAction || historyAction.mode !== "edit" || !historyActionJob) return;
    const title = historyAction.title.trim();
    if (!title) {
      setHistoryActionError(localize(t, "Enter a history title.", "이력 제목을 입력해주세요."));
      return;
    }
    setHistoryActionBusy(true);
    setHistoryActionError(null);
    try {
      const updated = await patchFactoryJobById(historyActionJob.id, {
        historyTitle: title,
        historyNote: historyAction.note.trim()
      });
      setHistoryAction(null);
      setStatus(localize(t, `History updated: ${updated.historyTitle}.`, `작업 이력을 수정했습니다: ${updated.historyTitle}.`));
    } catch (err) {
      setHistoryActionError(err instanceof Error ? err.message : localize(t, "Unable to update job history.", "작업 이력을 수정하지 못했습니다."));
    } finally {
      setHistoryActionBusy(false);
    }
  }

  async function deleteFactoryHistoryJob() {
    if (!historyAction || historyAction.mode !== "delete" || !historyActionJob || !canDeleteFactoryHistory(historyActionJob)) return;
    setHistoryActionBusy(true);
    setHistoryActionError(null);
    try {
      await api<{ job: VaultPluginFactoryJob }>(`/plugin-factory/jobs/${historyActionJob.id}`, { method: "DELETE" });
      const remainingJobs = factoryJobs.filter((job) => job.id !== historyActionJob.id);
      factoryJobsRef.current = remainingJobs;
      setFactoryJobs(remainingJobs);
      if (activeJobId === historyActionJob.id) {
        const nextJob = remainingJobs[0];
        workspaceIdRef.current = (nextJob?.snapshot as FactoryWorkspaceSnapshot | undefined)?.workspaceId ?? nextJob?.id ?? createFactoryWorkspaceId();
        setWorkspaceSaving(false);
        setActiveJobId(nextJob?.id ?? "");
        activeJobIdRef.current = nextJob?.id ?? "";
        if (nextJob) hydrateFactoryWorkspace(nextJob.snapshot as FactoryWorkspaceSnapshot, templates);
        setActiveFactoryTab("history");
      }
      setHistoryAction(null);
      setStatus(localize(t, `Deleted history for ${historyActionJob.pluginName}.`, `${historyActionJob.pluginName} 작업 이력을 삭제했습니다.`));
    } catch (err) {
      setHistoryActionError(err instanceof Error ? err.message : localize(t, "Unable to delete job history.", "작업 이력을 삭제하지 못했습니다."));
    } finally {
      setHistoryActionBusy(false);
    }
  }

  async function runFactoryJobAction(
    action: "request-approval" | "approve" | "reject" | "schedule" | "canary" | "full" | "retry" | "rollback"
  ) {
    const selectedJob = activeFactoryJob();
    const canUseCurrentJob = Boolean(
      selectedJob && currentUser && (selectedJob.ownerId === currentUser.id || canReviewJobs)
    );
    const job = canUseCurrentJob && selectedJob ? selectedJob : await ensureFactoryJob();
    if (!job) return;
    setStatus(null);
    try {
      if (action === "request-approval") {
        if (!approvalPreflightPassed) {
          setStatus(localize(t, "Build, security review, and artifact verification must pass before approval.", "빌드, 보안 검토, 아티팩트 검증을 통과한 뒤 승인 요청을 할 수 있습니다."));
          return;
        }
        await patchFactoryJobById(job.id, {
          templateId: selectedTemplate?.id,
          pluginName: pluginName || selectedTemplate?.name || job.pluginName,
          snapshot: factoryWorkspaceSnapshot() as unknown as Record<string, unknown>
        });
      }
      const response = await api<{ job: VaultPluginFactoryJob }>(`/plugin-factory/jobs/${job.id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action,
          note: approvalNote.trim() || undefined,
          scheduledFor: action === "schedule" && scheduleAt ? new Date(scheduleAt).toISOString() : undefined
        })
      });
      upsertFactoryJob(response.job);
      setActiveJobId(response.job.id);
      setStatus(
        localize(
          t,
          `Factory action completed: ${action}.`,
          `Factory 작업이 처리되었습니다: ${factoryActionLabel(action, t)}.`
        )
      );
      if (action === "approve" || action === "reject") setApprovalNote("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (action === "request-approval" && /verified build artifact/i.test(message)) {
        setActiveFactoryTab("build");
        setStatus(
          localize(
            t,
            "The verified build artifact is still being saved. Wait for Build to complete, then request approval again.",
            "검증된 Build Artifact를 저장하고 있습니다. Build 완료 후 다시 승인 요청을 눌러주세요."
          )
        );
        return;
      }
      setStatus(message || localize(t, "Unable to update Factory job.", "Factory 작업을 변경하지 못했습니다."));
    }
  }

  async function updateDeploymentEnvironment(environment: "dev" | "staging" | "prod") {
    const selectedJob = activeFactoryJob();
    const canUseCurrentJob = Boolean(
      selectedJob && currentUser && (selectedJob.ownerId === currentUser.id || canReviewJobs)
    );
    const job = canUseCurrentJob && selectedJob ? selectedJob : await ensureFactoryJob();
    await patchFactoryJobById(job.id, {
      deployment: { ...job.deployment, environment }
    });
  }

  async function inspectExistingFactoryMount() {
    if (!currentJob || !generated) return;
    const targetJobId = currentJob.id;
    setMountInspectionJobId(targetJobId);
    setMountInspectionError(null);
    setMountActionBusy("inspect");
    setMountRemovalResult(null);
    setMountRemovalConfirmation("");
    setStatus(null);
    try {
      const response = await api<{ result: VaultPluginMountInspectionResult }>(
        `/plugin-factory/jobs/${targetJobId}/existing-mount`
      );
      if (activeJobIdRef.current !== targetJobId) return;
      setMountInspection(response.result);
      setStatus(
        response.result.exists
          ? localize(t, `Existing Vault mount ${response.result.mountPath}/ was found.`, `기존 Vault Mount ${response.result.mountPath}/를 확인했습니다.`)
          : localize(t, `Vault mount ${response.result.mountPath}/ is no longer present.`, `Vault Mount ${response.result.mountPath}/가 이미 제거되어 있습니다.`)
      );
    } catch (err) {
      if (activeJobIdRef.current !== targetJobId) return;
      const detail = err instanceof Error ? err.message : localize(t, "Unable to inspect the existing Vault mount.", "기존 Vault Mount를 확인하지 못했습니다.");
      setMountInspection(null);
      setMountInspectionError(detail);
      setStatus(detail);
    } finally {
      if (activeJobIdRef.current === targetJobId) setMountActionBusy(null);
    }
  }

  async function removeExistingFactoryMount() {
    if (
      !currentJob ||
      !generated ||
      !canApply ||
      !activeMountConflictPath ||
      !mountInspection?.exists ||
      !mountInspection.fingerprint ||
      !mountConfirmationMatches
    ) return;
    const targetJobId = currentJob.id;
    const targetMountPath = activeMountConflictPath;
    setMountActionBusy("remove");
    setBusy("apply");
    setStatus(null);
    startFactoryJob("apply", localize(t, `Removing existing mount ${targetMountPath}/`, `기존 Mount ${targetMountPath}/ 삭제 중`));
    try {
      await playFactoryJobLines([
        generated.template.pluginType === "auth"
          ? `$ vault auth disable ${targetMountPath}`
          : `$ vault secrets disable ${targetMountPath}`,
        `$ vault ${generated.template.pluginType === "auth" ? "auth" : "secrets"} list | verify ${targetMountPath}/ absent`
      ]);
      const response = await api<{ result: VaultPluginMountRemovalResult; job: VaultPluginFactoryJob }>(
        `/plugin-factory/jobs/${targetJobId}/existing-mount/remove`,
        {
          method: "POST",
          body: JSON.stringify({
            confirmation: mountRemovalConfirmation,
            expectedFingerprint: mountInspection.fingerprint
          })
        }
      );
      if (activeJobIdRef.current !== targetJobId) return;
      upsertFactoryJob(response.job);
      setMountRemovalResult(response.result);
      setMountInspection(null);
      setMountInspectionError(null);
      setMountConflictPath(null);
      setMountRemovalConfirmation("");
      finishFactoryJob("complete", localize(t, `✓ removed ${targetMountPath}/ and verified`, `✓ ${targetMountPath}/ 삭제 및 검증 완료`));
      setStatus(localize(t, "The existing Vault mount was removed. You can apply the plugin again.", "기존 Vault Mount를 삭제했습니다. 이제 플러그인을 다시 적용할 수 있습니다."));
      await onChanged();
    } catch (err) {
      if (activeJobIdRef.current !== targetJobId) return;
      const detail = err instanceof Error ? err.message : localize(t, "Unable to remove the existing Vault mount.", "기존 Vault Mount를 삭제하지 못했습니다.");
      if (/changed after inspection|not found/i.test(detail)) {
        setMountInspection(null);
        setMountInspectionError(detail);
      }
      finishFactoryJob("failed", `✕ ${detail}`);
      setStatus(detail);
    } finally {
      if (activeJobIdRef.current === targetJobId) {
        setBusy(null);
        setMountActionBusy(null);
      }
    }
  }

  async function executePluginRollback() {
    if (!generated || !currentJob || !rollbackConfirmed || !canApply) return;
    setBusy("apply");
    setStatus(null);
    startFactoryJob("apply", localize(t, `Rolling back ${generated.pluginName}`, `${generated.pluginName} 롤백 중`));
    try {
      await playFactoryJobLines(generated.rollbackPlan.commands);
      const response = await api<{ result: VaultPluginRollbackResult }>("/plugin-factory/rollback", {
        method: "POST",
        body: JSON.stringify({
          jobId: currentJob.id,
          pluginType: generated.template.pluginType,
          pluginName: generated.pluginName,
          mountPath: generated.mountPath,
          removeCatalog: removeCatalogOnRollback
        })
      });
      setRollbackResult(response.result);
      setRollbackConfirmed(false);
      setActiveFactoryTab("deploy");
      finishFactoryJob("complete", localize(t, "✓ rollback completed", "✓ 롤백 완료"));
      setStatus(localize(t, "Vault plugin rollback completed.", "Vault 플러그인 롤백이 완료되었습니다."));
      await refreshFactoryJobs();
    } catch (err) {
      finishFactoryJob("failed", `✕ ${err instanceof Error ? err.message : "rollback failed"}`);
      setStatus(err instanceof Error ? err.message : localize(t, "Unable to roll back plugin.", "플러그인을 롤백하지 못했습니다."));
    } finally {
      setBusy(null);
    }
  }

  function loadFactoryJob(job: VaultPluginFactoryJob) {
    workspaceIdRef.current = (job.snapshot as FactoryWorkspaceSnapshot).workspaceId ?? job.id;
    setBusy(null);
    setWorkspaceSaving(false);
    setActiveJobId(job.id);
    activeJobIdRef.current = job.id;
    hydrateFactoryWorkspace(job.snapshot as FactoryWorkspaceSnapshot, templates);
    setActiveFactoryTab(job.approval.status === "requested" && canReviewJobs ? "deploy" : "workspace");
  }

  function toggleFactoryView(tab: Exclude<FactoryTab, "workspace">) {
    setAdvancedToolsOpen(true);
    setActiveFactoryTab((current) => (current === tab ? "workspace" : tab));
  }

  function toggleAdvancedTools() {
    setAdvancedToolsOpen((open) => {
      if (open) setActiveFactoryTab("workspace");
      return !open;
    });
  }

  function startNewFactoryConversation() {
    workspaceIdRef.current = createFactoryWorkspaceId();
    setBusy(null);
    setWorkspaceSaving(false);
    resetExistingMountRecovery();
    const initialTemplate = templates[0];
    if (initialTemplate) chooseTemplate(initialTemplate);
    setActiveJobId("");
    activeJobIdRef.current = "";
    setRequirementsInterview(null);
    setActiveRequirementStep("targetSystem");
    setAutoRepair(null);
    setFactoryJob(null);
    setPluginHistory([]);
    setRollbackPreview(null);
    setChatInput("");
    setChatMessages([{ id: `welcome-${Date.now()}`, role: "assistant", content: welcomeMessage }]);
    setActiveChatPrompt(null);
    setChatExampleRound((current) => {
      const next = nextFactoryChatExampleRound(current);
      persistFactoryChatExampleRound(next);
      return next;
    });
    setApprovalNote("");
    setScheduleAt("");
    setRollbackConfirmed(false);
    setAdvancedToolsOpen(false);
    setActiveFactoryTab("workspace");
    setMobileFactoryPane("design");
    setStatus(null);
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  }

  function focusFactoryChat() {
    setActiveFactoryTab("workspace");
    setMobileFactoryPane("design");
    window.requestAnimationFrame(() => {
      const input = chatInputRef.current;
      if (!input) return;
      input.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
      input.focus({ preventScroll: true });
    });
  }

  function updateActiveFileContent(content: string) {
    if (!activeFile) return;
    setDraftFiles((files) => files.map((file) => (file.path === activeFile.path ? { ...file, content } : file)));
  }

  function resetActiveFile() {
    if (!activeFile || !originalFile) return;
    setDraftFiles((files) => files.map((file) => (file.path === activeFile.path ? originalFile : file)));
    notifyPortal(localize(t, "File reset to the generated version.", "파일을 생성된 버전으로 초기화했습니다."), "info");
  }

  async function copyActiveFile() {
    if (!activeFile) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeFile.content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = activeFile.content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopiedFilePath(activeFile.path);
      notifyPortal(localize(t, "File copied to the clipboard.", "파일을 클립보드에 복사했습니다."), "success");
      window.setTimeout(() => setCopiedFilePath((path) => (path === activeFile.path ? null : path)), 1200);
    } catch {
      const message = localize(t, "Unable to copy this file.", "파일을 복사하지 못했습니다.");
      setStatus(message);
      notifyPortal(message, "danger");
    }
  }

  async function rebuildEditedFiles() {
    if (!generated || !draftFiles.length) return;
    const requirements = (generated as VaultPluginGenerateResult & { requirements?: VaultPluginRequirements }).requirements;
    if (!requirements?.confirmed) {
      setStatus(localize(t, "Confirm the requirements before running the build.", "빌드 전에 요구사항 명세를 확정하세요."));
      return;
    }
    await runAutoRepairLoop({ ...generated, files: draftFiles }, requirements, draftFiles);
  }

  async function runAutoRepairLoop(
    target: VaultPluginGenerateResult,
    requirements: VaultPluginRequirements,
    files = target.files
  ): Promise<VaultPluginGenerateResult | null> {
    const workspaceId = workspaceIdRef.current;
    setBusy("repair");
    setStatus(null);
    startFactoryJob("generate", localize(t, "Building and repairing in isolation", "격리 환경에서 빌드 및 자동 수정 중"));
    try {
      const job = await ensureFactoryJob(workspaceId);
      if (!isCurrentFactoryWorkspace(workspaceId, job.id)) return null;
      appendFactoryJobLine(`$ factory build --isolated --max-attempts=3`);
      const response = await api<{
        run: VaultPluginAutoRepairResult;
      }>("/plugin-factory/rebuild", {
        method: "POST",
        body: JSON.stringify({
          jobId: job.id,
          pluginName: target.pluginName,
          command: target.command,
          requirements,
          files
        })
      });
      if (!isCurrentFactoryWorkspace(workspaceId, job.id)) return null;
      let run = response.run;
      let seenAttempts = 0;
      setAutoRepair(run);
      for (let poll = 0; run.status === "running" && poll < 300; poll += 1) {
        await waitForFactoryMotion(2000);
        if (!isCurrentFactoryWorkspace(workspaceId, job.id)) return null;
        const polled = await api<{ run: VaultPluginAutoRepairResult }>(`/plugin-factory/rebuild/${run.id}`);
        if (!isCurrentFactoryWorkspace(workspaceId, job.id)) return null;
        run = polled.run;
        setAutoRepair(run);
        if (run.attempts.length > seenAttempts) {
          for (const attempt of run.attempts.slice(seenAttempts)) {
            appendFactoryJobLine(
              attempt.status === "pass"
                ? `✓ attempt ${attempt.attempt}: go test + linux/arm64 build passed`
                : `✕ attempt ${attempt.attempt}: ${attempt.repairedFiles.length ? `AI changed ${attempt.repairedFiles.join(", ")}` : "build failed"}`
            );
          }
          seenAttempts = run.attempts.length;
        }
      }
      if (run.status === "running") throw new Error(localize(t, "The isolated build timed out.", "격리 빌드 시간이 초과되었습니다."));
      if (run.status === "cancelled") {
        finishFactoryJob("cancelled", localize(t, "■ build cancelled before Vault apply", "■ Vault 적용 전 빌드 취소 완료"));
        await refreshFactoryJobs();
        setStatus(localize(t, "The isolated build was cancelled safely.", "격리 빌드를 안전하게 취소했습니다."));
        return null;
      }
      const nextGenerated: VaultPluginGenerateResult = {
        ...target,
        files: run.files,
        scaffoldSha256: run.scaffoldSha256,
        generatedAt: new Date().toISOString(),
        buildTest: run.buildTest,
        securityReview: run.securityReview,
        buildArtifact: run.artifact,
        requirements
      };
      setGenerated(nextGenerated);
      setDraftFiles(run.files);
      setArtifactSha256(run.artifact?.sha256 ?? "");
      setActiveFactoryTab("build");
      finishFactoryJob(
        run.status === "pass" ? "complete" : "failed",
        run.status === "pass"
          ? localize(t, `✓ ARM64 binary ${shortId(run.artifact?.sha256 ?? "")}`, `✓ ARM64 바이너리 ${shortId(run.artifact?.sha256 ?? "")}`)
          : localize(t, `✕ build failed after ${run.attempts.length} attempts`, `✕ ${run.attempts.length}회 시도 후 빌드 실패`)
      );
      await refreshFactoryJobs();
      recordFactoryHistory({
        action: "generated",
        pluginName: target.pluginName,
        detail: run.summary,
        status: run.status === "pass" ? "success" : "warning"
      });
      setStatus(
        run.status === "pass"
          ? localize(t, "The isolated build and tests passed.", "격리 빌드와 테스트를 통과했습니다.")
          : localize(t, "The automatic repair limit was reached. Review the diagnostics and source diff.", "자동 수정 한도에 도달했습니다. 진단 내용과 소스 Diff를 검토하세요.")
      );
      return nextGenerated;
    } catch (err) {
      if (workspaceIdRef.current !== workspaceId) return null;
      finishFactoryJob("failed", `✕ ${err instanceof Error ? err.message : "rebuild failed"}`);
      setStatus(err instanceof Error ? err.message : localize(t, "Unable to rebuild edited files.", "수정 파일을 재생성하지 못했습니다."));
      return null;
    } finally {
      if (workspaceIdRef.current === workspaceId) setBusy(null);
    }
  }

  function startFactoryJob(kind: FactoryJobState["kind"], label: string) {
    setFactoryJob({
      kind,
      label,
      status: "running",
      startedAt: Date.now(),
      lines: []
    });
  }

  function appendFactoryJobLine(line: string) {
    setFactoryJob((job) => (job ? { ...job, lines: [...job.lines, line].slice(-10) } : job));
  }

  function finishFactoryJob(status: FactoryJobState["status"], line: string) {
    setFactoryJob((job) => (job ? { ...job, status, lines: [...job.lines, line].slice(-10) } : job));
  }

  function recordFactoryHistory(item: Omit<PluginFactoryHistoryItem, "id" | "createdAt">) {
    setPluginHistory((history) => [
      {
        ...item,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString()
      },
      ...history
    ].slice(0, 8));
  }

  function saveGeneratedBlueprint() {
    if (!generated) return;
    setSavedBlueprints((blueprints) => Array.from(new Set([generated.blueprint.name, ...blueprints])).slice(0, 6));
    recordFactoryHistory({
      action: "blueprint-saved",
      pluginName: generated.pluginName,
      detail: generated.blueprint.summary,
      status: "success"
    });
    addChatMessage(
      "assistant",
      localize(
        t,
        `I saved ${generated.blueprint.name} as a reusable Plugin Blueprint. You can use it as the standard starting point for the next similar request.`,
        `${generated.blueprint.name} Blueprint를 저장했습니다. 다음에 비슷한 플러그인을 만들 때 표준 시작점으로 사용할 수 있어요.`
      ),
      "success"
    );
  }

  async function previewRollback() {
    if (!generated) return;
    setRollbackPreview(generated.rollbackPlan.summary);
    startFactoryJob("apply", localize(t, `Rollback preview for ${generated.pluginName}`, `${generated.pluginName} 롤백 미리보기`));
    await playFactoryJobLines(generated.rollbackPlan.commands);
    finishFactoryJob("complete", localize(t, "✓ rollback commands prepared", "✓ 롤백 명령 준비 완료"));
    recordFactoryHistory({
      action: "rollback-preview",
      pluginName: generated.pluginName,
      detail: generated.rollbackPlan.summary,
      status: "warning"
    });
    addChatMessage(
      "assistant",
      localize(
        t,
        `I prepared a rollback preview for ${generated.pluginName}. It is not executed automatically; review the disable and deregister commands before using them.`,
        `${generated.pluginName} 롤백 미리보기를 준비했습니다. 자동 실행은 하지 않았고, disable 및 deregister 명령을 먼저 검토할 수 있게 보여드립니다.`
      ),
      "warning"
    );
  }

  async function playFactoryJobLines(lines: string[]) {
    for (const line of lines) {
      await waitForFactoryMotion();
      appendFactoryJobLine(line);
    }
  }

  async function startRequirementsInterview(template: VaultPluginTemplate, requestedApply: boolean) {
    if (!canAuthorJobs) {
      addChatMessage(
        "assistant",
        localize(t, "Plugin design requires a developer, app owner, or Vault administrator role.", "플러그인 설계에는 개발자, 앱 소유자 또는 Vault 관리자 권한이 필요합니다."),
        "warning"
      );
      return;
    }
    const workspaceId = workspaceIdRef.current;
    setBusy("chat");
    setStatus(null);
    try {
      const response = await api<{ interview: VaultPluginRequirementsInterview }>("/plugin-factory/requirements/start", {
        method: "POST",
        body: JSON.stringify({
          locale: t === copy.ko ? "ko" : "en",
          templateId: template.id,
          requestedApply
        })
      });
      if (workspaceIdRef.current !== workspaceId) return;
      chooseTemplate(template);
      setRequirementsInterview(response.interview);
      setActiveRequirementStep(response.interview.missingFields[0] ?? "review");
      setMountPath(response.interview.spec.mountPath);
      setAutoRepair(null);
      setActiveFactoryTab("workspace");
      addChatMessage("assistant", response.interview.reply);
      setStatus(localize(t, "Requirements interview started.", "요구사항 인터뷰를 시작했습니다."));
    } catch (error) {
      if (workspaceIdRef.current !== workspaceId) return;
      const detail = error instanceof Error ? error.message : localize(t, "Unable to start the requirements interview.", "요구사항 인터뷰를 시작하지 못했습니다.");
      setStatus(detail);
      addChatMessage("assistant", detail, "warning");
    } finally {
      if (workspaceIdRef.current === workspaceId) setBusy(null);
    }
  }

  function updateRequirementSpec(
    field: keyof VaultPluginRequirements,
    value: string
  ) {
    setRequirementsInterview((current) => {
      if (!current) return current;
      const spec = { ...current.spec, [field]: value, confirmed: false, confirmedAt: undefined };
      const missingFields = missingFactoryRequirementFields(spec);
      if (field === "mountPath") setMountPath(value);
      return {
        ...current,
        spec,
        missingFields,
        readyToConfirm: missingFields.length === 0,
        updatedAt: new Date().toISOString()
      };
    });
  }

  function showPreviousRequirement() {
    if (activeRequirementIndex <= 0) return;
    const previousQuestion = requirementQuestions[activeRequirementIndex - 1];
    if (previousQuestion) setActiveRequirementStep(previousQuestion.field);
  }

  function chooseRequirementSuggestion(suggestion: string) {
    if (!activeRequirementQuestion || busy !== null) return;
    updateRequirementSpec(activeRequirementQuestion.field, suggestion);
    const nextQuestion = requirementQuestions[activeRequirementIndex + 1];
    window.setTimeout(() => {
      setActiveRequirementStep(nextQuestion?.field ?? "review");
    }, 180);
  }

  function continueRequirementsInterview() {
    if (!requirementsInterview || !activeRequirementQuestion || !activeRequirementValue.trim()) return;
    const nextQuestion = requirementQuestions[activeRequirementIndex + 1];
    if (nextQuestion) {
      setActiveRequirementStep(nextQuestion.field);
      return;
    }
    setActiveRequirementStep(requirementsInterview.missingFields[0] ?? "review");
  }

  async function answerRequirementsInterview(prompt: string) {
    if (!requirementsInterview) return;
    if (requirementsInterview.readyToConfirm && /^(?:확정|명세\s*확정|진행|좋아|네|yes|confirm|proceed)[.!\s]*$/i.test(prompt.trim())) {
      await confirmRequirementsAndGenerate();
      return;
    }
    const workspaceId = workspaceIdRef.current;
    setBusy("chat");
    try {
      const response = await api<{ interview: VaultPluginRequirementsInterview }>("/plugin-factory/requirements/answer", {
        method: "POST",
        body: JSON.stringify({
          locale: t === copy.ko ? "ko" : "en",
          interview: requirementsInterview,
          message: prompt
        })
      });
      if (workspaceIdRef.current !== workspaceId) return;
      setRequirementsInterview(response.interview);
      setActiveRequirementStep(response.interview.missingFields[0] ?? "review");
      setMountPath(response.interview.spec.mountPath);
      setAssistantRuntime({
        provider: response.interview.provider,
        model: response.interview.model,
        checked: true
      });
      addChatMessage("assistant", response.interview.reply);
    } catch (error) {
      if (workspaceIdRef.current !== workspaceId) return;
      addChatMessage(
        "assistant",
        error instanceof Error ? error.message : localize(t, "I could not update the specification.", "명세를 업데이트하지 못했습니다."),
        "warning"
      );
    } finally {
      if (workspaceIdRef.current === workspaceId) setBusy(null);
    }
  }

  async function confirmRequirementsAndGenerate() {
    if (!requirementsInterview || !requirementsInterview.readyToConfirm) return;
    const template = templates.find((item) => item.id === requirementsInterview.templateId);
    if (!template) return;
    const workspaceId = workspaceIdRef.current;
    setBusy("chat");
    try {
      const response = await api<{ interview: VaultPluginRequirementsInterview }>("/plugin-factory/requirements/confirm", {
        method: "POST",
        body: JSON.stringify({ locale: t === copy.ko ? "ko" : "en", interview: requirementsInterview })
      });
      if (workspaceIdRef.current !== workspaceId) return;
      const confirmed = response.interview;
      setRequirementsInterview(confirmed);
      setActiveRequirementStep("review");
      setMountPath(confirmed.spec.mountPath);
      addChatMessage("assistant", confirmed.reply, "success");
      const generatedResult = await generateTemplateScaffold(
        template,
        {
          interviewId: confirmed.id,
          pluginName: template.name,
          mountPath: confirmed.spec.mountPath,
          version: template.defaultVersion,
          command: template.defaultCommand,
          description: template.description,
          requirements: confirmed.spec
        },
        localize(t, "Confirmed specification generated the plugin source.", "확정된 명세로 플러그인 소스를 생성했습니다.")
      );
      if (workspaceIdRef.current !== workspaceId) return;
      if (!generatedResult) return;
      addChatMessage("assistant", factoryGeneratedMessage(generatedResult, confirmed.requestedApply, t), "success");
      addChatMessage(
        "assistant",
        localize(t, "I will now compile, test, and safely repair the source in the isolated runner.", "이제 격리된 환경에서 컴파일과 테스트를 실행하고 필요한 경우 안전하게 코드를 수정하겠습니다.")
      );
      const builtResult = await runAutoRepairLoop(generatedResult, confirmed.spec);
      if (workspaceIdRef.current !== workspaceId) return;
      if (!builtResult || builtResult.buildTest.status !== "pass") return;
      if (!confirmed.requestedApply) return;
      if (!canApply) {
        addChatMessage("assistant", localize(t, "Vault admin role is required to continue to apply.", "Vault 적용 단계에는 관리자 권한이 필요합니다."), "warning");
        return;
      }
      const applyAttempt = await applyGeneratedPlugin(builtResult);
      addChatMessage(
        "assistant",
        factoryApplyAttemptMessage(applyAttempt, builtResult.pluginName, t),
        applyAttempt.status === "applied" ? "success" : "warning"
      );
    } catch (error) {
      if (workspaceIdRef.current !== workspaceId) return;
      const detail = error instanceof Error ? error.message : localize(t, "Unable to confirm the specification.", "명세를 확정하지 못했습니다.");
      setStatus(detail);
      addChatMessage("assistant", detail, "warning");
    } finally {
      if (workspaceIdRef.current === workspaceId) setBusy(null);
    }
  }

  async function generateTemplateScaffold(
    template: VaultPluginTemplate,
    input: {
      interviewId: string;
      pluginName: string;
      mountPath: string;
      version: string;
      command: string;
      description: string;
      requirements: VaultPluginRequirements;
    },
    successMessage = localize(t, "Plugin scaffold generated.", "플러그인 스캐폴드가 생성되었습니다.")
  ): Promise<VaultPluginGenerateResult | null> {
    const workspaceId = workspaceIdRef.current;
    startFactoryJob("generate", localize(t, `Generating ${input.pluginName}`, `${input.pluginName} 생성 중`));
    setBusy("generate");
    setStatus(null);
    setApplyResult(null);
    setRollbackResult(null);
    resetExistingMountRecovery();
    let job: VaultPluginFactoryJob | null = null;
    try {
      const activeJob = await ensureFactoryJob(workspaceId);
      if (!isCurrentFactoryWorkspace(workspaceId, activeJob.id)) return null;
      job = activeJob;
      activeJobIdRef.current = activeJob.id;
      const generatingJob = await patchFactoryJobById(activeJob.id, {
        templateId: template.id,
        pluginName: input.pluginName,
        status: "running",
        stage: "generate",
        progress: 15,
        events: [
          ...activeJob.events,
          {
            id: `${Date.now()}-generate`,
            label: "generate",
            detail: input.pluginName,
            status: "running" as const,
            createdAt: new Date().toISOString()
          }
        ].slice(-100)
      });
      await playFactoryJobLines([
      `$ factory select ${template.id}`,
      `$ mkdir -p cmd/${input.pluginName} internal/plugin vault`,
      `$ render go.mod README.md Makefile vault/apply.hcl`
      ]);
      appendFactoryJobLine(`$ call POST /plugin-factory/generate`);
      await waitForFactoryMotion(220);
      const response = await api<{ generated: VaultPluginGenerateResult }>("/plugin-factory/generate", {
        method: "POST",
        body: JSON.stringify({
          interviewId: input.interviewId,
          templateId: template.id,
          pluginName: input.pluginName,
          mountPath: input.mountPath,
          version: input.version,
          command: input.command,
          description: input.description,
          requirements: input.requirements
        })
      });
      if (!isCurrentFactoryWorkspace(workspaceId, activeJob.id)) return null;
      setGenerated(response.generated);
      setDraftFiles(response.generated.files);
      setSelectedId(template.id);
      setPluginName(response.generated.pluginName);
      setMountPath(response.generated.mountPath);
      setVersion(response.generated.version);
      setCommand(response.generated.command);
      setDescription(response.generated.description);
      setArtifactSha256("");
      setAutoRepair(null);
      setActiveFilePath(response.generated.files[0]?.path ?? "");
      setActiveFactoryTab("files");
      setRollbackPreview(null);
      setStatus(successMessage);
      await onChanged();
      await waitForFactoryMotion(220);
      finishFactoryJob(
        "complete",
        localize(
          t,
          `✓ generated ${response.generated.files.length} files · sha ${shortId(response.generated.scaffoldSha256)}`,
          `✓ ${response.generated.files.length}개 파일 생성 · sha ${shortId(response.generated.scaffoldSha256)}`
        )
      );
      recordFactoryHistory({
        action: "generated",
        pluginName: response.generated.pluginName,
        detail: `${response.generated.files.length} files · ${response.generated.mountPath}/ · ${shortId(response.generated.scaffoldSha256)}`,
        status: "success"
      });
      const nextSnapshot: FactoryWorkspaceSnapshot = {
        ...factoryWorkspaceSnapshot(),
        activeTab: "files",
        selectedId: template.id,
        pluginName: response.generated.pluginName,
        mountPath: response.generated.mountPath,
        version: response.generated.version,
        command: response.generated.command,
        description: response.generated.description,
        artifactSha256: "",
        generated: response.generated,
        applyResult: undefined,
        rollbackResult: undefined,
        draftFiles: response.generated.files,
        activeFilePath: response.generated.files[0]?.path ?? ""
      };
      await patchFactoryJobById(activeJob.id, {
        status: "running",
        stage: "security-review",
        progress: 70,
        snapshot: nextSnapshot as unknown as Record<string, unknown>,
        deployment: { ...generatingJob.deployment, rollbackReady: response.generated.rollbackPlan.available },
        events: [
          ...generatingJob.events.filter((event) => event.label !== "generate" || event.status !== "running"),
          {
            id: `${Date.now()}-generated`,
            label: "generate",
            detail: `${response.generated.files.length} files · ${shortId(response.generated.scaffoldSha256)}`,
            status: "success" as const,
            createdAt: new Date().toISOString()
          }
        ].slice(-100)
      });
      return response.generated;
    } catch (err) {
      if (workspaceIdRef.current !== workspaceId) return null;
      setStatus(err instanceof Error ? err.message : "Unable to generate plugin scaffold");
      finishFactoryJob("failed", `✕ ${err instanceof Error ? err.message : "generation failed"}`);
      if (job) {
        void patchFactoryJobById(job.id, { status: "failed", stage: "generate" }).catch(() => undefined);
      }
      return null;
    } finally {
      if (workspaceIdRef.current === workspaceId) setBusy(null);
    }
  }

  async function generatePlugin() {
    if (!selectedTemplate) return;
    await startRequirementsInterview(selectedTemplate, false);
  }

  async function applyGeneratedPlugin(target: VaultPluginGenerateResult): Promise<PluginApplyAttempt> {
    const effectiveSha256 =
      target.buildArtifact?.sha256 ??
      (generated?.id === target.id ? artifactSha256 : "");
    const selectedJob = activeFactoryJob();
    const canUseCurrentJob = Boolean(
      selectedJob && currentUser && (selectedJob.ownerId === currentUser.id || canReviewJobs)
    );
    const candidateJob = canUseCurrentJob && selectedJob ? selectedJob : await ensureFactoryJob();
    const targetJobId = candidateJob.id;
    let job: VaultPluginFactoryJob;
    try {
      const latestJobs = await refreshFactoryJobs();
      const latestJob = latestJobs.find((item) => item.id === targetJobId);
      if (!latestJob) throw new Error(localize(t, "Unable to verify the generated plugin job.", "생성된 플러그인 작업을 확인하지 못했습니다."));
      job = latestJob;
    } catch (err) {
      const detail = err instanceof Error ? err.message : localize(t, "Unable to verify the Factory job.", "Factory 작업 상태를 확인하지 못했습니다.");
      setStatus(detail);
      return { status: "failed", detail };
    }
    if (job.approval.status !== "approved") {
      setActiveFactoryTab("deploy");
      setStatus(localize(t, "Approval is required before Vault apply.", "Vault 적용 전에 승인이 필요합니다."));
      return { status: "approval-required" };
    }
    const targetHighFindings = target.securityReview.findings.filter((finding) => finding.severity === "high").length;
    const targetPreflightPassed =
      target.buildTest.status === "pass" &&
      target.securityReview.posture !== "blocked" &&
      targetHighFindings === 0 &&
      /^[a-f0-9]{64}$/i.test(effectiveSha256);
    if (!targetPreflightPassed) {
      setActiveFactoryTab("deploy");
      setStatus(localize(t, "Resolve every preflight check before apply.", "적용 전 사전 검증 항목을 모두 해결하세요."));
      return { status: "preflight-blocked" };
    }
    startFactoryJob("apply", localize(t, `Applying ${target.pluginName}`, `${target.pluginName} Vault 적용 중`));
    setBusy("apply");
    setStatus(null);
    setRollbackResult(null);
    try {
      await playFactoryJobLines([
      `$ vault health`,
      `$ vault plugin register -command=${target.command} -sha256=${shortId(effectiveSha256)}`,
      target.template.pluginType === "auth"
        ? `$ vault auth enable -path=${target.mountPath} ${target.pluginName}`
        : `$ vault secrets enable -path=${target.mountPath} ${target.pluginName}`
      ]);
      appendFactoryJobLine(`$ call POST /plugin-factory/apply`);
      await waitForFactoryMotion(220);
      const response = await api<{ result: VaultPluginApplyResult }>("/plugin-factory/apply", {
        method: "POST",
        body: JSON.stringify({
          pluginType: target.template.pluginType,
          jobId: job.id,
          pluginName: target.pluginName,
          mountPath: target.mountPath,
          version: target.version,
          command: target.command,
          artifactSha256: effectiveSha256,
          description: target.description,
          artifactBucket: target.buildArtifact?.bucket,
          artifactKey: target.buildArtifact?.key
        })
      });
      setApplyResult(response.result);
      resetExistingMountRecovery();
      setActiveFactoryTab("deploy");
      setStatus(localize(t, "Vault apply completed.", "Vault 적용이 완료되었습니다."));
      await onChanged();
      await waitForFactoryMotion(220);
      finishFactoryJob(
        "complete",
        localize(
          t,
          `✓ applied ${response.result.pluginName} at ${response.result.mountPath}/ (${response.result.mode})`,
          `✓ ${response.result.pluginName} 적용 완료 · ${response.result.mountPath}/ (${response.result.mode})`
        )
      );
      recordFactoryHistory({
        action: "applied",
        pluginName: response.result.pluginName,
        detail: `${response.result.mountPath}/ · ${response.result.mode}`,
        status: response.result.applied ? "success" : "warning"
      });
      await refreshFactoryJobs();
      return { status: "applied", result: response.result };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to apply plugin";
      const mountConflict = /Vault mount ([^\s]+) already exists/i.exec(detail);
      if (mountConflict?.[1]) {
        setMountConflictPath(normalizeFactoryMountPath(mountConflict[1]));
        setMountInspection(null);
        setMountInspectionError(null);
        setMountRemovalConfirmation("");
        setMountRemovalResult(null);
        setActiveFactoryTab("deploy");
      }
      setStatus(detail);
      finishFactoryJob("failed", `✕ ${detail}`);
      void patchFactoryJobById(job.id, { status: "failed", stage: "deploy" }).catch(() => undefined);
      return { status: "failed", detail };
    } finally {
      setBusy(null);
    }
  }

  async function applyPlugin() {
    if (generated) {
      await applyGeneratedPlugin(generated);
    }
  }

  function addChatMessage(role: PluginChatMessage["role"], content: string, tone: PluginChatMessage["tone"] = "default") {
    setChatMessages((messages) => [
      ...messages,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        content,
        tone
      }
    ]);
  }

  async function submitChatPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setChatInput("");
    setActiveChatPrompt(trimmed);
    window.setTimeout(() => {
      setActiveChatPrompt((activePrompt) => (activePrompt === trimmed ? null : activePrompt));
    }, 760);
    addChatMessage("user", trimmed);
    if (requirementsInterview && !requirementsInterview.spec.confirmed) {
      await answerRequirementsInterview(trimmed);
    } else {
      await runFactoryChat(trimmed);
    }
  }

  async function runFactoryChat(prompt: string) {
    if (busy !== null) {
      addChatMessage("assistant", localize(t, "A factory job is already running.", "이미 Factory 작업이 실행 중입니다."), "warning");
      return;
    }
    const workspaceId = workspaceIdRef.current;
    setBusy("chat");
    try {
      const response = await api<{ result: FactoryAssistantResult }>("/plugin-factory/chat", {
        method: "POST",
        body: JSON.stringify({
          locale: t === copy.ko ? "ko" : "en",
          messages: [
            ...chatMessages.slice(-11).map((message) => ({ role: message.role, content: message.content })),
            { role: "user", content: prompt }
          ],
          selectedTemplateId: selectedTemplate?.id,
          generatedPluginName: generated?.pluginName
        })
      });
      if (workspaceIdRef.current !== workspaceId) return;
      setAssistantRuntime({
        provider: response.result.provider,
        model: response.result.model,
        fallbackReason: response.result.fallbackReason,
        checked: true
      });
      setBusy(null);
      await executeFactoryAssistantResult(response.result);
    } catch {
      if (workspaceIdRef.current !== workspaceId) return;
      setBusy(null);
      setAssistantRuntime({ provider: "rules", fallbackReason: "unavailable", checked: true });
      await runFactoryChatFallback(prompt);
    }
  }

  async function executeFactoryAssistantResult(result: FactoryAssistantResult) {
    addChatMessage("assistant", result.reply);
    if (result.action.type === "none" || result.action.type === "list") return;

    if (result.action.type === "rollback") {
      if (!generated) {
        addChatMessage(
          "assistant",
          localize(t, "Generate a plugin first so I can prepare a rollback.", "롤백을 준비하려면 먼저 플러그인을 생성해주세요."),
          "warning"
        );
        return;
      }
      await previewRollback();
      return;
    }

    if (result.action.type === "apply") {
      if (!generated) {
        addChatMessage("assistant", localize(t, "Generate a plugin first, then ask me to apply it.", "먼저 플러그인을 생성한 뒤 적용을 요청하세요."), "warning");
        return;
      }
      if (!canApply) {
        addChatMessage("assistant", localize(t, "Vault admin role is required to apply it.", "Vault 적용에는 관리자 권한이 필요합니다."), "warning");
        return;
      }
      const applyAttempt = await applyGeneratedPlugin(generated);
      addChatMessage(
        "assistant",
        factoryApplyAttemptMessage(applyAttempt, generated.pluginName, t),
        applyAttempt.status === "applied" ? "success" : "warning"
      );
      return;
    }

    const template = templates.find((item) => item.id === result.action.templateId);
    if (!template) {
      addChatMessage("assistant", localize(t, "The requested template is not in the verified catalog.", "요청한 템플릿이 검증된 카탈로그에 없습니다."), "warning");
      return;
    }

    chooseTemplate(template);
    setFilter(filterForTemplate(template));
    if (result.action.type === "select") return;
    if (!canAuthorJobs) {
      addChatMessage(
        "assistant",
        localize(t, "Plugin generation requires a developer, app owner, or Vault administrator role.", "플러그인 생성에는 개발자, 앱 소유자 또는 Vault 관리자 권한이 필요합니다."),
        "warning"
      );
      return;
    }

    await startRequirementsInterview(template, result.action.type === "generate-and-apply");
  }

  async function runFactoryChatFallback(prompt: string) {
    const normalized = normalizeFactoryPrompt(prompt);
    const wantsCreate = /만들|생성|제작|create|make|generate|scaffold/.test(normalized);
    const wantsApply = /적용|등록|활성|배포|apply|register|enable/.test(normalized);
    const wantsList = /전부|모든|목록|뭐|어떤|보여|알려|list|available|catalog|what plugins|which plugins|can you make/.test(normalized);
    const wantsRollback = /롤백|되돌|disable|deregister|rollback|undo/.test(normalized);
    const template = findTemplateFromPrompt(prompt, templates);
    const requestedFilter: PluginFilter = /데이터베이스|database|db\b/.test(normalized)
      ? "database"
      : /인증|auth/.test(normalized)
        ? "auth"
        : /시크릿|secret/.test(normalized)
          ? "secret"
          : "all";
    const result: FactoryAssistantResult = {
      provider: "rules",
      fallbackReason: "unavailable",
      latencyMs: 0,
      reply: localize(t, "The safe local fallback is active.", "안전한 로컬 fallback으로 처리하고 있습니다."),
      action: { type: "none" }
    };

    if (wantsList) {
      result.reply = pluginCatalogSummary(templates, t, requestedFilter);
      result.action = { type: "list", filter: requestedFilter };
    } else if (wantsRollback) {
      result.reply = localize(t, "I will prepare a rollback preview first.", "먼저 롤백 미리보기를 준비하겠습니다.");
      result.action = { type: "rollback" };
    } else if (wantsCreate && template) {
      result.reply = factoryStartMessage(template, wantsApply, t);
      result.action = { type: wantsApply ? "generate-and-apply" : "generate", templateId: template.id };
    } else if (wantsApply) {
      result.reply = localize(t, "I will run the guarded Vault apply flow.", "검증과 승인 절차를 거쳐 Vault 적용을 진행하겠습니다.");
      result.action = { type: "apply" };
    } else if (template) {
      result.reply = localize(t, `I selected ${template.displayName}.`, `${template.displayName} 템플릿을 선택했습니다.`);
      result.action = { type: "select", templateId: template.id };
    } else {
      result.reply = localize(
        t,
        "The AI endpoint is unavailable. Catalog, generation, apply, and rollback commands are still supported.",
        "AI 엔드포인트에 연결할 수 없습니다. 카탈로그 조회·생성·적용·롤백 명령은 계속 사용할 수 있습니다."
      );
    }
    await executeFactoryAssistantResult(result);
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitChatPrompt(chatInput);
  }

  return (
    <div className={`stack pluginFactory${activeFactoryTab === "workspace" ? " workspaceFocused" : ""}`}>
      <section className="factoryWorkspaceHeader">
        <div className="factoryWorkspaceStatus">
          <span className={`factoryConnectionDot ${assistantRuntime.provider}`} aria-hidden="true" />
          <div>
            <strong>
              {assistantRuntime.provider === "ollama"
                ? localize(t, "AI assistant connected", "AI 어시스턴트 연결됨")
                : localize(t, "Local rules available", "로컬 규칙 엔진 사용 가능")}
            </strong>
            <small>
              {localize(
                t,
                "Describe it once. AI guides requirements, generation, verification, and Vault apply.",
                "원하는 기능을 말하면 AI가 요구사항부터 생성·검증·Vault 적용까지 안내합니다."
              )}
            </small>
          </div>
        </div>
        <div className="factoryWorkspaceActions">
          <button
            className="primary"
            disabled={factoryWorkspaceSwitchBlocked}
            onClick={startNewFactoryConversation}
            type="button"
          >
            <MessageSquare aria-hidden="true" size={16} />
            {localize(t, "New conversation", "새 대화")}
          </button>
        </div>
      </section>

      <button
        aria-controls="factory-mobile-status"
        aria-expanded={mobileFactoryPane === "status"}
        className={`factoryMobileProgress${mobileFactoryPane === "status" ? " active" : ""}`}
        onClick={() => setMobileFactoryPane((pane) => pane === "status" ? "design" : "status")}
        type="button"
      >
        <Activity aria-hidden="true" size={18} />
        <span>
          <strong>{localize(t, "Current job", "현재 작업")}</strong>
          <small>{currentWorkflowStage?.label ?? localize(t, "Requirements", "요구사항")}</small>
        </span>
        <em>
          {requirementsInterview && !requirementsInterview.spec.confirmed
            ? `${completedRequirementCount}/${requirementQuestions.length}`
            : `${completedWorkflowCount}/${workflowStages.length}`}
        </em>
        <ArrowRight aria-hidden="true" size={17} />
      </button>

      <section
        className={`factoryJobTimeline${mobileFactoryPane === "status" ? " mobileActive" : ""}`}
        id="factory-mobile-status"
        aria-label={localize(t, "Factory job progress", "Factory 작업 진행률")}
      >
        <div className="factoryTimelineHeader">
          <div>
            <span>{localize(t, "Current job", "현재 작업")}</span>
            <strong>{currentJob?.pluginName || pluginName || localize(t, "New plugin draft", "새 플러그인 초안")}</strong>
            <small>
              {currentJob
                ? workspaceSaving
                  ? localize(t, "Saving workspace", "작업 저장 중")
                  : localize(t, "Workspace saved", "작업 저장됨")
                : localize(t, "Design draft", "설계 초안")}
            </small>
          </div>
          <div>
            <span>{factoryStatusLabel(currentJob?.status ?? "draft", t)}</span>
            <strong>{factoryProgress}%</strong>
          </div>
        </div>
        <div className="factoryProgressTrack"><span style={{ width: `${factoryProgress}%` }} /></div>
        <div className="workflowStrip">
          {workflowStages.map((stage, index) => (
            <div key={stage.id} className={`workflowStep ${stage.complete ? "complete" : currentWorkflowStage?.id === stage.id ? "current" : "pending"}`}>
              <span>{stage.complete ? <CheckCircle2 aria-hidden="true" size={17} /> : index + 1}</span>
              <strong>{stage.label}</strong>
              <small>
                {stage.complete
                  ? localize(t, "Complete", "완료")
                  : currentWorkflowStage?.id === stage.id
                    ? localize(t, "In progress", "진행 중")
                    : localize(t, "Pending", "대기")}
              </small>
            </div>
          ))}
        </div>
        <div className="factoryTimelineMeta">
          <div>
            <span>{localize(t, "Environment", "환경")}</span>
            <strong>{currentJob?.deployment.environment ?? "dev"}</strong>
          </div>
          <div>
            <span>{localize(t, "Mount path", "Mount 경로")}</span>
            <code>{mountPath || "factory-lab/"}</code>
          </div>
        </div>
        <div className="factoryApplyGate">
          <ShieldCheck aria-hidden="true" size={18} />
          <div>
            <strong>{localize(t, "Manual Vault apply gate", "수동 Vault 적용 게이트")}</strong>
            <span>
              {localize(
                t,
                "Diff, checksum, and approval are required before apply.",
                "Diff·체크섬·승인 확인 후에만 적용할 수 있습니다."
              )}
            </span>
          </div>
        </div>
      </section>

      <section
        className={`factoryChatPanel mobileActive ${busy === "chat" || busy === "generate" || busy === "repair" || busy === "apply" ? "running" : ""}`}
        id="factory-mobile-design"
        ref={factoryChatPanelRef}
      >
        <div className="panelHeader">
          <div>
            <h2>{localize(t, "What should we build?", "무엇을 만들까요?")}</h2>
            <p>{localize(t, "Describe the outcome in natural language. AI will ask only what is missing.", "원하는 결과를 자연어로 설명해주세요. AI가 부족한 조건만 하나씩 질문합니다.")}</p>
          </div>
          {canApply && generated ? <div className="chatQuickActions">
            <button
              type="button"
              className={activeChatPrompt === localize(t, "Apply it to Vault", "Vault에 적용해줘") ? "launching" : undefined}
              onClick={() => void submitChatPrompt(localize(t, "Apply it to Vault", "Vault에 적용해줘"))}
              disabled={busy !== null}
            >
              {localize(t, "Request Vault apply", "Vault 적용 요청")}
            </button>
          </div> : null}
        </div>
        <div className="chatMessages" aria-live="polite">
          {chatMessages.map((message) => (
            <div key={message.id} className={`chatBubble ${message.role} ${message.tone ?? "default"}`}>
              <span>{message.role === "user" ? localize(t, "You", "나") : "Factory"}</span>
              <p>{message.content}</p>
            </div>
          ))}
          {busy === "chat" ? (
            <div className="chatBubble assistant thinking">
              <span>Factory</span>
              <p>
                {localize(t, "Thinking with the local model", "AI가 답변을 구성하고 있습니다")}
                <i aria-hidden="true">...</i>
              </p>
            </div>
          ) : null}
        </div>
        {requirementsInterview ? (
          <div className={`requirementsInterview conversational ${requirementsInterview.spec.confirmed ? "confirmed" : ""}${activeRequirementStep === "review" ? " reviewing" : ""}`}>
            <div className="requirementsHeader">
              <div>
                <span>{localize(t, "Requirements interview", "요구사항 인터뷰")}</span>
                <strong>{factoryLocalize(t, `${selectedTemplate?.displayName ?? "Plugin"} specification`, `${selectedTemplate?.displayName ?? "Plugin"} 생성 명세`)}</strong>
              </div>
              <span className={`requirementsStatusBadge ${requirementsInterview.spec.confirmed ? "confirmed" : requirementsInterview.readyToConfirm ? "ready" : ""}`}>
                {requirementsInterview.spec.confirmed
                  ? localize(t, "Confirmed", "확정됨")
                  : factoryLocalize(
                      t,
                      `${completedRequirementCount}/${requirementQuestions.length} complete`,
                      `${completedRequirementCount}/${requirementQuestions.length} 완료`
                    )}
              </span>
            </div>
            <div className="requirementsProgress" aria-hidden="true">
              <span style={{ width: `${(completedRequirementCount / requirementQuestions.length) * 100}%` }} />
            </div>
            {!requirementsInterview.spec.confirmed && activeRequirementStep !== "review" && activeRequirementQuestion ? (
              <section
                aria-labelledby={`requirement-title-${activeRequirementQuestion.field}`}
                className="requirementQuestionPanel"
                id={`requirement-question-${activeRequirementQuestion.field}`}
                role="tabpanel"
              >
                <div className="requirementQuestionHeader">
                  <span>{factoryLocalize(t, `Required question ${activeRequirementIndex + 1} of ${requirementQuestions.length}`, `필수 질문 ${activeRequirementIndex + 1}/${requirementQuestions.length}`)}</span>
                  <strong className={activeRequirementValue.trim() ? "complete" : "required"}>
                    {activeRequirementValue.trim() ? localize(t, "Answered", "입력됨") : localize(t, "Required", "입력 필요")}
                  </strong>
                </div>
                <h3 id={`requirement-title-${activeRequirementQuestion.field}`}>{activeRequirementQuestion.question}</h3>
                <p>{activeRequirementQuestion.detail}</p>
                {activeRequirementQuestion.suggestions.length ? (
                  <div className="requirementSuggestions" aria-label={localize(t, "Suggested answers", "추천 답변")}>
                    {activeRequirementQuestion.suggestions.map((suggestion) => (
                      <button
                        aria-pressed={activeRequirementValue === suggestion}
                        className={activeRequirementValue === suggestion ? "active" : ""}
                        disabled={busy !== null}
                        key={suggestion}
                        onClick={() => chooseRequirementSuggestion(suggestion)}
                        type="button"
                      >
                        {activeRequirementValue === suggestion
                          ? <CheckCircle2 aria-hidden="true" size={18} />
                          : <CircleGauge aria-hidden="true" size={18} />}
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : (
                  <label className="requirementQuestionField">
                    <span>{activeRequirementQuestion.label}</span>
                    <input
                      aria-label={activeRequirementQuestion.label}
                      autoComplete="off"
                      disabled={busy !== null}
                      onChange={(event) => updateRequirementSpec(activeRequirementQuestion.field, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.nativeEvent.isComposing || !activeRequirementValue.trim()) return;
                        event.preventDefault();
                        continueRequirementsInterview();
                      }}
                      placeholder={activeRequirementQuestion.placeholder}
                      value={activeRequirementValue}
                    />
                  </label>
                )}
                <div className="requirementNavigation">
                  <button disabled={activeRequirementIndex <= 0 || busy !== null} onClick={showPreviousRequirement} type="button">
                    <ArrowLeft aria-hidden="true" size={16} /> {localize(t, "Previous", "이전")}
                  </button>
                  <button className="primary" disabled={!activeRequirementValue.trim() || busy !== null} onClick={continueRequirementsInterview} type="button">
                    {activeRequirementIndex === requirementQuestions.length - 1
                      ? localize(t, "Review specification", "명세 검토")
                      : localize(t, "Next question", "다음 질문")}
                    <ArrowRight aria-hidden="true" size={16} />
                  </button>
                </div>
              </section>
            ) : (
              <section className="requirementReviewPanel" aria-label={localize(t, "Specification review", "생성 명세 검토")}>
                <div className="requirementReviewHeader">
                  <div>
                    <span>{localize(t, "Specification review", "생성 전 명세 검토")}</span>
                    <h3>{requirementsInterview.spec.confirmed ? localize(t, "Specification confirmed", "생성 명세가 확정되었습니다") : localize(t, "Check every answer before generation", "생성 전에 답변을 확인하세요")}</h3>
                  </div>
                  <strong className={requirementsInterview.readyToConfirm ? "ready" : "pending"}>
                    {requirementsInterview.spec.confirmed
                      ? localize(t, "Confirmed", "확정 완료")
                      : requirementsInterview.readyToConfirm
                        ? localize(t, "Ready", "검토 가능")
                        : factoryLocalize(t, `${requirementsInterview.missingFields.length} remaining`, `${requirementsInterview.missingFields.length}개 남음`)}
                  </strong>
                </div>
                <div className="requirementReviewList">
                  {requirementQuestions.map((question) => {
                    const value = requirementsInterview.spec[question.field].trim();
                    return (
                      <button
                        className={value ? "complete" : "missing"}
                        disabled={requirementsInterview.spec.confirmed || busy !== null}
                        key={question.field}
                        onClick={() => setActiveRequirementStep(question.field)}
                        type="button"
                      >
                        <span>{value ? <CheckCircle2 aria-hidden="true" size={16} /> : <CircleGauge aria-hidden="true" size={16} />}</span>
                        <span><small>{question.label}</small><strong>{value || localize(t, "Answer required", "입력 필요")}</strong></span>
                        {!requirementsInterview.spec.confirmed ? <PencilLine aria-hidden="true" size={15} /> : null}
                      </button>
                    );
                  })}
                </div>
                <label className="requirementEnvironment">
                  <span>
                    <strong>{localize(t, "First environment", "최초 적용 환경")}</strong>
                    <small>{localize(t, "Start in the lowest-risk environment.", "가장 낮은 위험의 환경부터 시작합니다.")}</small>
                  </span>
                  <select
                    disabled={requirementsInterview.spec.confirmed || busy !== null}
                    onChange={(event) => updateRequirementSpec("environment", event.target.value)}
                    value={requirementsInterview.spec.environment}
                  >
                    <option value="dev">dev</option>
                    <option value="staging">staging</option>
                    <option value="prod">prod</option>
                  </select>
                </label>
                <div className="requirementSafetyNote">
                  <ShieldCheck aria-hidden="true" size={18} />
                  <span><strong>{localize(t, "Do not enter secret values", "Secret 값 입력 금지")}</strong><small>{factoryLocalize(t, "Use credential types and storage locations only. Never enter an actual token or password.", "Credential 유형과 저장 위치만 작성하고 실제 Token이나 Password는 입력하지 마세요.")}</small></span>
                </div>
                {!requirementsInterview.spec.confirmed ? (
                  <div className="requirementsActions">
                    <span>
                      {requirementsInterview.missingFields.length
                        ? localize(t, "Complete the remaining required answers", "남은 필수 답변을 입력하세요")
                        : localize(t, "The specification is ready to generate", "Plugin을 생성할 준비가 되었습니다")}
                    </span>
                    <button
                      className="primary"
                      disabled={!requirementsInterview.readyToConfirm || busy !== null}
                      onClick={() => void confirmRequirementsAndGenerate()}
                      type="button"
                    >
                      <BadgeCheck aria-hidden="true" size={16} />
                      {localize(t, "Confirm and generate", "명세 확정 후 생성")}
                    </button>
                  </div>
                ) : (
                  <div className="requirementConfirmedNotice">
                    <CheckCircle2 aria-hidden="true" size={18} />
                    <span>{localize(t, "This confirmed specification is used for generation and review.", "확정된 명세를 기준으로 생성과 검토를 진행합니다.")}</span>
                  </div>
                )}
              </section>
            )}
          </div>
        ) : null}
        {factoryJob ? (
          <div className={`factoryCodeConsole ${factoryJob.status}`} aria-live="polite" ref={factoryCodeConsoleRef}>
            <div className="factoryCodeConsoleHeader">
              <div className="factoryCodeConsoleTitle">
                <strong>{factoryJob.label}</strong>
                {factoryJob.kind === "generate" && autoRepair ? <small>{factoryBuildPhaseLabel(factoryBuildPhase, t)}</small> : null}
              </div>
              <div className="factoryCodeConsoleActions">
                <span className="factoryCodeConsoleStatus">{factoryStatusLabel(factoryJob.status, t)}</span>
                {currentJob && factoryJob.status === "running" && canCancelFactoryJob(currentJob) ? (
                  <button
                    aria-label={localize(t, `Cancel ${currentJob.pluginName}`, `${currentJob.pluginName} 작업 취소`)}
                    className="factoryCancelButton"
                    disabled={cancellingJobId === currentJob.id}
                    onClick={() => void cancelFactoryJob(currentJob)}
                    title={localize(t, "Cancel before Vault apply", "Vault 적용 전 작업 취소")}
                    type="button"
                  >
                    <CircleStop aria-hidden="true" size={15} />
                    {cancellingJobId === currentJob.id ? localize(t, "Cancelling...", "취소 중...") : localize(t, "Cancel", "작업 취소")}
                  </button>
                ) : null}
              </div>
            </div>
            {factoryJob.kind === "generate" && autoRepair ? (
              <section className="factoryBuildTracker" aria-label={localize(t, "Build progress", "빌드 진행 상태")}>
                <div
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={factoryBuildProgressValue}
                  aria-valuetext={factoryBuildPhaseLabel(factoryBuildPhase, t)}
                  className="factoryBuildProgress"
                  role="progressbar"
                >
                  <span style={{ width: `${factoryBuildProgressValue}%` }} />
                </div>
                <div className="factoryBuildMeta">
                  <span>{localize(t, "Attempt", "시도")} <strong>{factoryBuildAttempt}/{autoRepair.maxAttempts}</strong></span>
                  <span>{localize(t, "Elapsed", "경과")} <strong>{formatElapsedDuration(factoryBuildElapsedMs)}</strong></span>
                  <span>{localize(t, "Runner", "실행 환경")} <strong>CodeBuild ARM64</strong></span>
                </div>
              </section>
            ) : null}
            <pre ref={factoryCodeConsoleLogRef}>
              {factoryJob.lines.map((line, index) => (
                <code key={`${index}-${line}`}>{line}</code>
              ))}
              {factoryJob.status === "running" ? <code className="consoleCursor">$ _</code> : null}
            </pre>
          </div>
        ) : null}
        {!requirementsInterview ? (
          <div className="chatExamples" aria-label={localize(t, "Example prompts", "예시 프롬프트")}>
            <span>{localize(t, "Try one", "예시")}</span>
            {chatExamples.map((example) => (
              <button
                key={example.id}
                type="button"
                className={activeChatPrompt === example.prompt ? "launching" : undefined}
                onClick={() => void submitChatPrompt(example.prompt)}
                disabled={busy !== null}
              >
                {example.prompt}
              </button>
            ))}
          </div>
        ) : null}
        <form className="chatComposer" onSubmit={handleChatSubmit}>
          <textarea
            id="factory-chat-input"
            ref={chatInputRef}
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || !chatInput.trim()) return;
              event.preventDefault();
              void submitChatPrompt(chatInput);
            }}
            placeholder={localize(t, "Describe the plugin and where it should be applied", "원하는 Plugin과 적용 대상을 설명해주세요")}
            disabled={busy !== null}
            rows={3}
          />
          <button
            aria-label={localize(t, "Send message", "메시지 전송")}
            className="chatSendButton iconButton"
            title={localize(t, "Send message", "메시지 전송")}
            type="submit"
            disabled={busy !== null || !chatInput.trim()}
          >
            <Send aria-hidden="true" size={18} />
            <span>{localize(t, "Send", "전송")}</span>
          </button>
        </form>
      </section>

      <section className={`factoryViewLauncher${advancedToolsOpen ? " open" : ""}`} aria-label={localize(t, "Advanced Factory tools", "Factory 고급 도구")}>
        <button
          aria-controls="factory-advanced-tools"
          aria-expanded={advancedToolsOpen}
          className="factoryAdvancedToggle"
          onClick={toggleAdvancedTools}
          type="button"
        >
          <Wrench aria-hidden="true" size={18} />
          <span>
            <strong>{localize(t, "Advanced tools", "고급 도구")}</strong>
            <small>
              {activeFactoryTab === "workspace"
                ? `${roleHome.metricLabel} ${roleHome.metricValue}`
                : factoryLaunchers.find((launcher) => launcher.id === activeFactoryTab)?.label}
            </small>
          </span>
          <ArrowRight aria-hidden="true" size={17} />
        </button>
        {advancedToolsOpen ? (
          <div className="factoryLauncherGrid" id="factory-advanced-tools">
            {factoryLaunchers.map(({ id: launcherId, icon: Icon, label, status: launcherStatus }) => (
              <button
                aria-controls={`factory-view-${launcherId}`}
                aria-expanded={activeFactoryTab === launcherId}
                className={activeFactoryTab === launcherId ? "active" : ""}
                key={launcherId}
                onClick={() => toggleFactoryView(launcherId)}
                type="button"
              >
                <span className="factoryLauncherIcon"><Icon aria-hidden="true" size={18} /></span>
                <strong>{label}</strong>
                <small>{launcherStatus}</small>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {activeFactoryTab === "discover" ? (
      <div className="pluginWorkspace factoryViewPanel" id="factory-view-discover">
        <section className="pluginCatalogPanel">
          <div className="panelHeader">
            <div>
              <h2>{localize(t, "Plugin catalog", "플러그인 카탈로그")}</h2>
              <p>
                {localize(
                  t,
                  `${templates.length} templates including official, partner, learning, and community entries.`,
                  `공식, 파트너, 학습용, 커뮤니티를 포함한 ${templates.length}개 템플릿`
                )}
              </p>
            </div>
          </div>
          <div className="pluginSearchToolbar">
            <label>
              <Search aria-hidden="true" size={17} />
              <input
                aria-label={localize(t, "Search plugin templates", "플러그인 템플릿 검색")}
                onChange={(event) => setTemplateQuery(event.target.value)}
                placeholder={localize(t, "Search name, target, or tag", "이름, 대상 또는 태그 검색")}
                value={templateQuery}
              />
            </label>
            <button
              aria-pressed={favoriteOnly}
              className={favoriteOnly ? "active" : ""}
              onClick={() => setFavoriteOnly((value) => !value)}
              type="button"
            >
              <Star aria-hidden="true" fill={favoriteOnly ? "currentColor" : "none"} size={16} />
              {localize(t, "Favorites", "즐겨찾기")} {favoriteTemplateIds.length}
            </button>
          </div>
          <div className="segmentedControl" role="tablist" aria-label="Plugin filters">
            {(["all", "auth", "secret", "database", "partner", "community", "learning"] as PluginFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                onClick={() => changeFilter(item)}
              >
                {filterLabel(item, t)} <span>{counts[item]}</span>
              </button>
            ))}
          </div>

          <div className="pluginList">
            {filteredTemplates.map((template) => (
              <article key={template.id} className={`pluginRow ${selectedTemplate?.id === template.id ? "selected" : ""}`}>
                <button className="pluginSelect" onClick={() => chooseTemplate(template)} type="button">
                  <div>
                    <strong>{template.displayName}</strong>
                    <small>{template.description}</small>
                  </div>
                  <div className="pluginBadges">
                    <span>{pluginTypeLabel(template.pluginType, t)}</span>
                    <span>{sourceLabel(template.source, t)}</span>
                    <span>{template.marketplace.maturity}</span>
                    {template.popularity?.rank ? <span>Top {template.popularity.rank}</span> : null}
                  </div>
                </button>
                <div className="pluginRowActions">
                  <button
                    aria-label={favoriteTemplateIds.includes(template.id) ? localize(t, "Remove favorite", "즐겨찾기 해제") : localize(t, "Add favorite", "즐겨찾기 추가")}
                    className={`iconButton ${favoriteTemplateIds.includes(template.id) ? "active" : ""}`}
                    onClick={() => toggleFavorite(template.id)}
                    title={localize(t, "Favorite", "즐겨찾기")}
                    type="button"
                  >
                    <Star aria-hidden="true" fill={favoriteTemplateIds.includes(template.id) ? "currentColor" : "none"} size={15} />
                  </button>
                  <button
                    aria-label={compareTemplateIds.includes(template.id) ? localize(t, "Remove from comparison", "비교에서 제거") : localize(t, "Add to comparison", "비교에 추가")}
                    className={`iconButton ${compareTemplateIds.includes(template.id) ? "active" : ""}`}
                    onClick={() => toggleComparison(template.id)}
                    title={localize(t, "Compare", "비교")}
                    type="button"
                  >
                    <GitCompare aria-hidden="true" size={15} />
                  </button>
                </div>
              </article>
            ))}
            {!filteredTemplates.length ? (
              <div className="empty compact emptyWithAction">
                <span>{localize(t, "No templates match this search.", "검색 조건과 일치하는 Template이 없습니다.")}</span>
                <button
                  onClick={() => {
                    setTemplateQuery("");
                    setFavoriteOnly(false);
                    changeFilter("all");
                  }}
                  type="button"
                >
                  {localize(t, "Reset filters", "필터 초기화")}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="builderPanel">
          {selectedTemplate ? (
            <>
              <div className="builderHeader">
                <div>
                  <h2>{selectedTemplate.displayName}</h2>
                  <p>{selectedTemplate.description}</p>
                </div>
                <a href={selectedTemplate.sourceUrl} target="_blank" rel="noreferrer">
                  {selectedTemplate.repository}
                </a>
              </div>

              <div className="templateMeta">
                <div className="metaTile">
                  <span>{localize(t, "Type", "유형")}</span>
                  <strong>{pluginTypeLabel(selectedTemplate.pluginType, t)}</strong>
                </div>
                <div className="metaTile">
                  <span>{localize(t, "Source", "출처")}</span>
                  <strong>{sourceLabel(selectedTemplate.source, t)}</strong>
                </div>
                <div className="metaTile">
                  <span>{localize(t, "Target", "대상")}</span>
                  <strong>{selectedTemplate.integrationTarget}</strong>
                </div>
                <div className="metaTile">
                  <span>{localize(t, "Popularity", "인지도")}</span>
                  <strong>{selectedTemplate.popularity ? `${selectedTemplate.popularity.stars} stars` : "-"}</strong>
                </div>
              </div>

              <div className="builderGrid">
                <label>
                  <span>{localize(t, "Plugin name", "플러그인 이름")}</span>
                  <input value={pluginName} onChange={(event) => setPluginName(event.target.value)} />
                </label>
                <label>
                  <span>{localize(t, "Mount path", "Mount 경로")}</span>
                  <input value={mountPath} onChange={(event) => setMountPath(event.target.value)} />
                </label>
                <label>
                  <span>{localize(t, "Version", "버전")}</span>
                  <input value={version} onChange={(event) => setVersion(event.target.value)} />
                </label>
                <label>
                  <span>{localize(t, "Command", "실행 명령")}</span>
                  <input value={command} onChange={(event) => setCommand(event.target.value)} />
                </label>
              </div>

              <label className="wideField">
                <span>{localize(t, "Description", "설명")}</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
              </label>

              <label className="wideField">
                <span>{localize(t, "Binary SHA256", "바이너리 SHA256")}</span>
                <input value={artifactSha256} onChange={(event) => setArtifactSha256(event.target.value)} />
                <small>
                  {localize(
                    t,
                    "Generated scaffold SHA is prefilled for mock apply; replace it with the compiled binary SHA for real Vault.",
                    "Mock 적용에는 생성 스캐폴드 SHA가 자동 입력됩니다. 실제 Vault에는 컴파일된 바이너리 SHA로 교체하세요."
                  )}
                </small>
              </label>

              <div className="guardrailList">
                {selectedTemplate.guardrails.map((guardrail) => (
                  <span key={guardrail}>{guardrail}</span>
                ))}
              </div>

              <div className="templateTrustGrid">
                <div><BadgeCheck aria-hidden="true" size={17} /><span>{localize(t, "Publisher", "게시자")}</span><strong>{selectedTemplate.source === "official" || selectedTemplate.source === "partner" ? localize(t, "Verified source", "검증된 출처") : localize(t, "Community review", "커뮤니티 검토")}</strong></div>
                <div><Activity aria-hidden="true" size={17} /><span>{localize(t, "Maintenance", "유지보수")}</span><strong>{selectedTemplate.marketplace.lastReviewedAt}</strong></div>
                <div><Code2 aria-hidden="true" size={17} /><span>{localize(t, "Release", "릴리스")}</span><strong>{selectedTemplate.defaultVersion}</strong></div>
                <div><Shield aria-hidden="true" size={17} /><span>SBOM / Scan</span><strong>{selectedTemplate.buildProfile === "scaffold" ? localize(t, "Generated at build", "빌드 시 생성") : localize(t, "Reference manifest", "참조 매니페스트")}</strong></div>
              </div>

              {compareTemplates.length ? (
                <div className="templateComparison">
                  <div className="panelHeader">
                    <div><h3>{localize(t, "Template comparison", "템플릿 비교")}</h3><p>{localize(t, "Select up to two templates.", "최대 두 개 템플릿을 비교합니다.")}</p></div>
                    <button onClick={() => setCompareTemplateIds([])} type="button">{localize(t, "Clear", "초기화")}</button>
                  </div>
                  <div className="comparisonGrid">
                    {compareTemplates.map((template) => (
                      <div key={template.id}>
                        <strong>{template.displayName}</strong>
                        <span>{pluginTypeLabel(template.pluginType, t)} · {sourceLabel(template.source, t)}</span>
                        <span>{template.integrationTarget}</span>
                        <span>{template.marketplace.maturity} · {template.marketplace.riskLevel}</span>
                        <span>{template.defaultVersion}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="builderActions">
                <span>
                  {localize(t, "Selected template", "선택 템플릿")}
                  <strong>{selectedTemplate.displayName}</strong>
                </span>
                <button className="primary" disabled={!canAuthorJobs || busy !== null} onClick={() => void generatePlugin()} type="button">
                  <Sparkles aria-hidden="true" size={16} />
                  {busy === "generate"
                    ? localize(t, "Generating...", "생성 중...")
                    : localize(t, "Start requirements interview", "요구사항 인터뷰 시작")}
                </button>
              </div>
            </>
          ) : (
            <div className="empty compact">{busy === "load" ? t.loading : t.table.noData}</div>
          )}
        </section>
      </div>
      ) : null}

      {activeFactoryTab === "review" ? (
      <section className="tablePanel factoryOpsPanel factoryViewPanel" id="factory-view-review">
        <div className="panelHeader">
          <div>
            <h2>{localize(t, "Factory operations cockpit", "Factory 운영 패널")}</h2>
            <p>
              {localize(
                t,
                "Dry-run, guided design, code review, build/test, safety, blueprints, marketplace, history, rollback, and security review are tracked together.",
                "Dry-run, 질문형 설계, 코드 리뷰, 빌드/테스트, 안전장치, Blueprint, 마켓플레이스, 이력, 롤백, 보안 리뷰를 한 화면에서 추적합니다."
              )}
            </p>
          </div>
          <button type="button" onClick={saveGeneratedBlueprint} disabled={!generated}>
            {localize(t, "Save blueprint", "Blueprint 저장")}
          </button>
        </div>
        <div className="capabilityGrid">
          {capabilityCards.map(([index, label, value]) => (
            <div key={index} className="capabilityCard">
              <span>{index}</span>
              <strong>{label}</strong>
              <small>{value}</small>
            </div>
          ))}
        </div>
        <div className="factoryOpsGrid">
          <section className="opsCard">
            <h3>{localize(t, "AI spec interview", "AI 질문형 설계")}</h3>
            {generated ? (
              <div className="questionList">
                {generated.blueprint.questions.map((question) => (
                  <label key={question.id}>
                    <span>
                      {question.question}
                      {question.required ? " *" : ""}
                    </span>
                    <input value={question.answer} readOnly />
                  </label>
                ))}
              </div>
            ) : (
              <div className="empty compact">{localize(t, "Generate a plugin to create a guided blueprint.", "플러그인을 생성하면 질문형 Blueprint가 만들어집니다.")}</div>
            )}
            {savedBlueprints.length ? (
              <div className="savedBlueprints">
                {savedBlueprints.map((blueprint) => (
                  <span key={blueprint}>{blueprint}</span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="opsCard">
            <h3>{localize(t, "Template marketplace", "템플릿 마켓플레이스")}</h3>
            {selectedTemplate ? (
              <>
                <div className="marketplaceHeader">
                  <strong>{selectedTemplate.marketplace.maturity}</strong>
                  <span>{selectedTemplate.marketplace.riskLevel}</span>
                </div>
                <p>{selectedTemplate.marketplace.recommendedUse}</p>
                <div className="pluginBadges">
                  {selectedTemplate.marketplace.badges.map((badge) => (
                    <span key={badge}>{badge}</span>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty compact">{t.table.noData}</div>
            )}
          </section>

          <section className="opsCard">
            <h3>{localize(t, "Generated plugin history", "생성 플러그인 이력")}</h3>
            {pluginHistory.length ? (
              <div className="historyList">
                {pluginHistory.map((item) => (
                  <div key={item.id}>
                    <span className={item.status}>{item.action}</span>
                    <div>
                      <strong>{item.pluginName}</strong>
                      <small>{item.detail}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty compact">{localize(t, "No Factory history in this session yet.", "아직 이 세션의 Factory 이력이 없습니다.")}</div>
            )}
          </section>

          <section className="opsCard">
            <h3>{localize(t, "Security review", "보안 리뷰")}</h3>
            {generated ? (
              <>
                <div className="securityScore">
                  <strong>{generated.securityReview.score}</strong>
                  <span>{generated.securityReview.posture}</span>
                </div>
                <div className="findingList">
                  {generated.securityReview.findings.map((finding) => (
                    <div key={`${finding.severity}-${finding.title}`}>
                      <span className={finding.severity}>{finding.severity}</span>
                      <div>
                        <strong>{finding.title}</strong>
                        <small>{finding.detail}</small>
                        <small>{finding.remediation}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty compact">{localize(t, "Generate a plugin to run the Factory security review.", "플러그인을 생성하면 Factory 보안 리뷰가 실행됩니다.")}</div>
            )}
          </section>
        </div>
      </section>
      ) : null}

      {activeFactoryTab === "files" && generated ? (
        <section className="tablePanel commandPanel generatedFilesPanel factoryViewPanel" id="factory-view-files">
          <div className="panelHeader">
            <div>
              <h2>{localize(t, "Generated files", "생성 파일")}</h2>
              <p>{generated ? `${draftFiles.length} files - ${shortId(generated.scaffoldSha256)}` : "-"}</p>
            </div>
            <div className="fileHeaderActions">
              <button disabled={!generated || !canAuthorJobs || busy !== null} onClick={() => void rebuildEditedFiles()} type="button">
                <RefreshCw aria-hidden="true" className={busy === "repair" ? "spin" : undefined} size={16} />
                {busy === "repair"
                  ? localize(t, "Building and repairing...", "빌드 및 자동 수정 중...")
                  : localize(t, "Run AI build and repair", "AI 빌드 및 자동 수정")}
              </button>
              {scaffoldDownload ? (
                <a className="downloadLink" href={scaffoldDownload.href} download={scaffoldDownload.filename}>
                  {localize(t, "Download", "다운로드")}
                </a>
              ) : (
                <button type="button" disabled>{localize(t, "Download", "다운로드")}</button>
              )}
            </div>
          </div>
          {generated ? (
            <>
            <div className="generatedFileToolbar">
              <label>
                <Search aria-hidden="true" size={16} />
                <input
                  aria-label={localize(t, "Search generated files", "생성 파일 검색")}
                  onChange={(event) => setFileQuery(event.target.value)}
                  placeholder={localize(t, "Search path or source", "경로 또는 코드 검색")}
                  value={fileQuery}
                />
              </label>
              <div className="segmentedControl compact" role="tablist" aria-label={localize(t, "File editor mode", "파일 편집 모드")}>
                {(["preview", "edit", "diff"] as FileEditorMode[]).map((mode) => (
                  <button
                    aria-selected={fileEditorMode === mode}
                    className={fileEditorMode === mode ? "active" : ""}
                    key={mode}
                    onClick={() => setFileEditorMode(mode)}
                    role="tab"
                    type="button"
                  >
                    {mode === "preview" ? <Code2 aria-hidden="true" size={14} /> : mode === "edit" ? <Files aria-hidden="true" size={14} /> : <FileDiff aria-hidden="true" size={14} />}
                    {fileEditorModeLabel(mode, t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="generatedFileWorkspace">
              <div
                className="fileTabs"
                role="tablist"
                aria-label={localize(t, "Generated plugin files", "생성된 플러그인 파일")}
              >
                {filteredFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    role="tab"
                    aria-controls="generated-file-preview"
                    aria-selected={activeFile?.path === file.path}
                    className={activeFile?.path === file.path ? "active" : ""}
                    onClick={() => setActiveFilePath(file.path)}
                    title={file.path}
                  >
                    <span>{file.path}</span>
                    <small>{file.language}</small>
                  </button>
                ))}
              </div>
              {activeFile ? (
                <div
                  className={`codePreview ${fileFullscreen ? "fullscreen" : ""}`}
                  id="generated-file-preview"
                  role="tabpanel"
                  aria-label={activeFile.path}
                >
                  <div>
                    <div>
                      <strong>{activeFile.path}</strong>
                      <span>{activeFile.language} · +{activeFileDiff.added} / -{activeFileDiff.removed}</span>
                    </div>
                    <div className="codePreviewActions">
                      <button aria-label={localize(t, "Copy file", "파일 복사")} className="iconButton" onClick={() => void copyActiveFile()} title={localize(t, "Copy file", "파일 복사")} type="button">
                        {copiedFilePath === activeFile.path ? <CheckCircle2 aria-hidden="true" size={16} /> : <ClipboardCopy aria-hidden="true" size={16} />}
                      </button>
                      <button aria-label={localize(t, "Reset file", "파일 초기화")} className="iconButton" disabled={!activeFileDiff.changed} onClick={resetActiveFile} title={localize(t, "Reset file", "파일 초기화")} type="button">
                        <Undo2 aria-hidden="true" size={16} />
                      </button>
                      <button aria-label={fileFullscreen ? localize(t, "Exit full screen", "전체화면 종료") : localize(t, "Full screen", "전체화면")} className="iconButton" onClick={() => setFileFullscreen((value) => !value)} title={fileFullscreen ? localize(t, "Exit full screen", "전체화면 종료") : localize(t, "Full screen", "전체화면")} type="button">
                        {fileFullscreen ? <Minimize2 aria-hidden="true" size={16} /> : <Maximize2 aria-hidden="true" size={16} />}
                      </button>
                    </div>
                  </div>
                  {fileEditorMode === "preview" ? <pre>{activeFile.content}</pre> : null}
                  {fileEditorMode === "edit" ? (
                    <textarea
                      aria-label={localize(t, "Edit generated source", "생성 코드 편집")}
                      className="codeEditor"
                      onChange={(event) => updateActiveFileContent(event.target.value)}
                      readOnly={!canAuthorJobs}
                      spellCheck={false}
                      value={activeFile.content}
                    />
                  ) : null}
                  {fileEditorMode === "diff" ? (
                    <div className="codeDiffView">
                      <div><span>{localize(t, "Original", "원본")}</span><pre>{originalFile?.content ?? ""}</pre></div>
                      <div><span>{localize(t, "Edited", "수정본")}</span><pre>{activeFile.content}</pre></div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            </>
          ) : (
            <div className="empty compact">{localize(t, "No generated scaffold yet.", "아직 생성된 스캐폴드가 없습니다.")}</div>
          )}
        </section>
      ) : null}

      {activeFactoryTab === "build" && generated ? (
        <section className="tablePanel commandPanel factoryViewPanel" id="factory-view-build">
          <h2>{factoryLocalize(t, "Build and apply plan", "빌드 및 적용 계획")}</h2>
          {generated ? (
            <>
              <div className="commandList">
                {generated.commands.map((commandLine) => (
                  <code key={commandLine}>{commandLine}</code>
                ))}
              </div>
              <div className="buildTestPanel">
                <div className="resultBanner compactBanner">
                  <strong>{factoryLocalize(t, "Isolated build and test", "격리 빌드 및 테스트")}</strong>
                  <span>{factoryStatusLabel(generated.buildTest.status, t)}</span>
                </div>
                {autoRepair ? (
                  <div className="repairAttemptList">
                    <div className="repairAttemptHeader">
                      <span>{localize(t, "Automatic repair loop", "AI 자동 수정 루프")}</span>
                      <strong>{autoRepair.attempts.length}/{autoRepair.maxAttempts}</strong>
                    </div>
                    {autoRepair.attempts.map((attempt) => (
                      <div className="repairAttempt" key={attempt.attempt}>
                        <span className={attempt.status}>{attempt.attempt}</span>
                        <div>
                          <strong>{attempt.summary}</strong>
                          <small>
                            {attempt.provider ? `${attempt.provider}${attempt.model ? ` · ${attempt.model}` : ""}` : localize(t, "compiler", "컴파일러")}
                            {attempt.durationMs ? ` · ${Math.round(attempt.durationMs / 1000)}s` : ""}
                          </small>
                          {attempt.repairedFiles.length ? <small>{attempt.repairedFiles.join(", ")}</small> : null}
                        </div>
                      </div>
                    ))}
                    {autoRepair.artifact ? (
                      <div className="buildArtifactLine">
                        <BadgeCheck aria-hidden="true" size={17} />
                        <span>linux/arm64</span>
                        <strong>{shortId(autoRepair.artifact.sha256)}</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {generatedDisplay?.buildSteps.map((step) => (
                  <div className="applyStep" key={`${step.label}-${step.command}`}>
                    <span className={step.status === "pass" ? "success" : step.status === "warn" ? "planned" : step.status}>
                      {factoryStatusLabel(step.status, t)}
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.command}</small>
                      <small>
                        {step.durationMs ? `${step.durationMs}ms - ` : ""}
                        {step.detail}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              <div className="applyTimeline">
                {generatedDisplay?.applyPlan.map((step, index) => (
                  <div key={step}>
                    <span>{index + 1}</span>
                    <p>{step}</p>
                  </div>
                ))}
              </div>
              {generatedDisplay?.warnings.map((warning) => (
                <div className="warningLine" key={warning}>
                  {warning}
                </div>
              ))}
            </>
          ) : (
            <div className="empty compact">{localize(t, "Generate a plugin to see commands.", "플러그인을 생성하면 명령을 확인할 수 있습니다.")}</div>
          )}
        </section>
      ) : null}

      {activeFactoryTab === "deploy" && generated ? (
        <section className="tablePanel commandPanel factoryViewPanel" id="factory-view-deploy">
          <h2>{localize(t, "Deployment review", "배포 검토")}</h2>
          <div className="deploymentReviewGrid">
            <section className="preflightPanel">
              <div className="panelHeader">
                <div>
                  <h3>{localize(t, "Preflight review", "배포 사전 검토")}</h3>
                  <p>{localize(t, "All checks and approval must pass before apply.", "모든 검증과 승인이 완료되어야 적용할 수 있습니다.")}</p>
                </div>
                <span className={`preflightStatus ${preflightPassed ? "ready" : mountConflictDetected || mountInspectionError ? "conflict" : "blocked"}`}>
                  {preflightPassed
                    ? localize(t, "Ready", "준비 완료")
                    : mountConflictDetected
                      ? localize(t, "Mount conflict", "Mount 충돌")
                      : mountInspectionError
                        ? localize(t, "Inspection failed", "확인 실패")
                        : localize(t, "Pending checks", "검증 대기")}
                </span>
              </div>
              <div className="preflightList">
                {preflightChecks.map((check) => (
                  <div key={check.label} className={check.pass ? "pass" : "conflict" in check && check.conflict ? "conflict" : "pending"}>
                    {check.pass
                      ? <CheckCircle2 aria-hidden="true" size={17} />
                      : "conflict" in check && check.conflict
                        ? <AlertTriangle aria-hidden="true" size={17} />
                        : <CircleGauge aria-hidden="true" size={17} />}
                    <span><strong>{check.label}</strong><small>{check.detail}</small></span>
                  </div>
                ))}
              </div>
              {generated ? (
                <div className="impactSummary">
                  <div><span>{localize(t, "Mount", "Mount")}</span><strong>{generated.mountPath}/</strong></div>
                  <div><span>{localize(t, "Plugin", "플러그인")}</span><strong>{generated.command}</strong></div>
                  <div><span>{factoryLocalize(t, "Role impact", "영향 대상")}</span><strong>{generated.template.pluginType === "auth" ? factoryLocalize(t, "Auth method", "인증 방식") : factoryLocalize(t, "Secret consumers", "Secret 사용 대상")}</strong></div>
                  <div><span>{localize(t, "Changes", "변경 수")}</span><strong>{generated.dryRun.changes.length}</strong></div>
                </div>
              ) : null}
            </section>

            <section className="approvalPanel">
              <div className="panelHeader">
                <div><h3>{localize(t, "Approval and rollout", "승인 및 배포 방식")}</h3><p>{factoryStatusLabel(currentJob?.approval.status ?? "not-requested", t)}</p></div>
                <UserCheck aria-hidden="true" size={20} />
              </div>
              <label>
                {localize(t, "Approval note", "승인 메모")}
                <textarea disabled={!canConfigureDeployment} onChange={(event) => setApprovalNote(event.target.value)} rows={2} value={approvalNote} />
              </label>
              <div className="approvalActions">
                <button
                  disabled={!generated || !approvalPreflightPassed || !canRequestApproval || currentJob?.approval.status === "requested" || currentJob?.approval.status === "approved"}
                  onClick={() => void runFactoryJobAction("request-approval")}
                  type="button"
                >
                  {localize(t, "Request approval", "승인 요청")}
                </button>
                {canReviewJobs && currentJob?.approval.status === "requested" ? (
                  <>
                    <button className="primary" onClick={() => void runFactoryJobAction("approve")} type="button">{localize(t, "Approve", "승인")}</button>
                    <button onClick={() => void runFactoryJobAction("reject")} type="button">{localize(t, "Reject", "반려")}</button>
                  </>
                ) : null}
              </div>
              <div className="rolloutControls">
                <div className="segmentedControl compact" aria-label={localize(t, "Rollout mode", "배포 방식")}>
                  <button className={currentJob?.deployment.mode !== "canary" ? "active" : ""} disabled={!canConfigureDeployment} onClick={() => void runFactoryJobAction("full")} type="button">{localize(t, "Full", "전체")}</button>
                  <button className={currentJob?.deployment.mode === "canary" ? "active" : ""} disabled={!canConfigureDeployment} onClick={() => void runFactoryJobAction("canary")} type="button">Canary</button>
                </div>
                <label>
                  {localize(t, "Environment", "환경")}
                  <select
                    disabled={!canConfigureDeployment}
                    onChange={(event) => void updateDeploymentEnvironment(event.target.value as "dev" | "staging" | "prod")}
                    value={currentJob?.deployment.environment ?? generated?.blueprint.defaults.environment ?? "dev"}
                  >
                    <option value="dev">dev</option><option value="staging">staging</option><option value="prod">prod</option>
                  </select>
                </label>
                <label>
                  {localize(t, "Schedule", "배포 예약")}
                  <input
                    min={toLocalDateTimeInputValue(new Date())}
                    disabled={!canConfigureDeployment}
                    onInput={(event) => setScheduleAt(event.currentTarget.value)}
                    type="datetime-local"
                    value={scheduleAt}
                  />
                </label>
                <button disabled={!canConfigureDeployment || currentJob?.approval.status !== "approved" || !scheduleAt} onClick={() => void runFactoryJobAction("schedule")} type="button">
                  <CalendarClock aria-hidden="true" size={16} /> {localize(t, "Save schedule", "예약 저장")}
                </button>
              </div>
              {canApply ? (
                <button
                  className="primary deployNowButton"
                  disabled={
                    !generated ||
                    !preflightPassed ||
                    rollbackAvailable ||
                    applyInProgress ||
                    busy !== null ||
                    mountActionBusy !== null ||
                    Boolean(activeMountConflictPath && mountInspection?.exists !== false)
                  }
                  onClick={() => void applyPlugin()}
                  type="button"
                >
                  {appliedPluginReady ? <CheckCircle2 aria-hidden="true" size={17} /> : <Rocket aria-hidden="true" size={17} />}
                  {appliedPluginReady ? localize(t, "Applied", "적용 완료") : localize(t, "Apply now", "지금 적용")}
                </button>
              ) : (
                <div className="permissionNote">
                  <ShieldCheck aria-hidden="true" size={17} />
                  <span>{localize(t, "A Vault admin performs the final apply after approval.", "승인 후 최종 적용은 Vault 관리자가 수행합니다.")}</span>
                </div>
              )}
            </section>
          </div>
          {activeMountConflictPath || mountInspectionError || mountRemovalResult ? (
            <section className={`mountConflictPanel ${mountRemovalResult?.removed || mountInspection?.exists === false ? "resolved" : ""}`}>
              <div className="panelHeader">
                <div>
                  <span className="sectionEyebrow">{localize(t, "Conflict recovery", "충돌 복구")}</span>
                  <h3>
                    {mountRemovalResult?.removed || mountInspection?.exists === false
                      ? localize(t, "Vault Mount is ready", "Vault Mount 정리 완료")
                      : mountInspectionError
                        ? localize(t, "Vault Mount inspection failed", "Vault Mount 확인 실패")
                        : localize(t, "Existing Vault Mount collision", "기존 Vault Mount 충돌")}
                  </h3>
                  <p>
                    {mountRemovalResult?.removed
                      ? localize(t, `${mountRemovalResult.mountPath}/ was removed and verified.`, `${mountRemovalResult.mountPath}/ 삭제 후 재조회까지 완료했습니다.`)
                      : mountInspection?.exists === false
                        ? localize(t, `${mountInspection.mountPath}/ is no longer present.`, `${mountInspection.mountPath}/가 현재 Vault에 없습니다.`)
                        : mountInspectionError
                          ? localize(t, `Unable to inspect ${mountRecoveryPath}/. Try the Vault check again.`, `${mountRecoveryPath}/ 상태를 확인하지 못했습니다. Vault 확인을 다시 실행하세요.`)
                          : localize(
                              t,
                              `${mountRecoveryPath}/ already exists. Inspect the current mount before choosing whether to remove it.`,
                              `${mountRecoveryPath}/ 경로가 이미 존재합니다. 삭제 여부를 결정하기 전에 현재 Mount를 확인하세요.`
                            )}
                  </p>
                </div>
                {mountRemovalResult?.removed || mountInspection?.exists === false
                  ? <CheckCircle2 aria-hidden="true" size={22} />
                  : <AlertTriangle aria-hidden="true" size={22} />}
              </div>

              {mountRemovalResult?.removed ? (
                <>
                  <div className="mountRemovalSteps">
                    {mountRemovalResult.steps.map((step) => (
                      <div key={`${step.label}-${step.detail}`}>
                        <CheckCircle2 aria-hidden="true" size={17} />
                        <span><strong>{factoryResultStepLabel(step.label, t)}</strong><small>{factoryResultStepDetail(step.detail, t)}</small></span>
                      </div>
                    ))}
                  </div>
                  <div className="actions">
                    <button className="primary" disabled={!preflightPassed || busy !== null} onClick={() => void applyPlugin()} type="button">
                      <Rocket aria-hidden="true" size={16} /> {localize(t, "Apply again", "다시 적용")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {!mountInspection ? (
                    <div className="actions">
                      <button disabled={mountActionBusy !== null || busy !== null} onClick={() => void inspectExistingFactoryMount()} type="button">
                        {mountActionBusy === "inspect" ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Search aria-hidden="true" size={16} />}
                        {localize(t, "Inspect existing Mount", "기존 Mount 확인")}
                      </button>
                    </div>
                  ) : null}

                  {mountInspection?.exists ? (
                    <div className="mountInspectionBody">
                      <div className="mountIdentityGrid">
                        <div><span>{localize(t, "Path", "경로")}</span><strong>{mountInspection.mountPath}/</strong></div>
                        <div><span>{localize(t, "Current type", "현재 타입")}</span><strong>{mountInspection.mountType ?? "-"}</strong></div>
                        <div><span>{localize(t, "Plugin version", "Plugin 버전")}</span><strong>{mountInspection.pluginVersion ?? "-"}</strong></div>
                        <div><span>Fingerprint</span><strong>{shortId(mountInspection.fingerprint ?? "")}</strong></div>
                      </div>
                      {mountInspection.description ? <p className="mountDescription">{mountInspection.description}</p> : null}
                      <label className="mountRemovalConfirm">
                        <span>
                          {localize(
                            t,
                            `Type ${mountInspection.mountPath} to confirm removal`,
                            `삭제하려면 ${mountInspection.mountPath} 입력`
                          )}
                        </span>
                        <input
                          autoComplete="off"
                          onChange={(event) => setMountRemovalConfirmation(event.target.value)}
                          placeholder={mountInspection.mountPath}
                          spellCheck={false}
                          value={mountRemovalConfirmation}
                        />
                        <small>
                          {currentJob?.approval.status !== "approved"
                            ? localize(t, "Approval is required before removal. The Plugin Catalog entry is retained.", "삭제 실행 전 승인이 필요하며 Plugin Catalog 항목은 유지합니다.")
                            : localize(t, "This disables only the Mount. The Plugin Catalog entry is retained.", "이 작업은 Mount만 비활성화하며 Plugin Catalog 항목은 유지합니다.")}
                        </small>
                      </label>
                      <div className="actions mountConflictActions">
                        <button disabled={mountActionBusy !== null || busy !== null} onClick={() => void inspectExistingFactoryMount()} type="button">
                          <RefreshCw aria-hidden="true" size={16} /> {localize(t, "Inspect again", "다시 확인")}
                        </button>
                        <button
                          className="dangerButton"
                          disabled={
                            !canApply ||
                            currentJob?.approval.status !== "approved" ||
                            !mountConfirmationMatches ||
                            mountActionBusy !== null ||
                            busy !== null
                          }
                          onClick={() => void removeExistingFactoryMount()}
                          type="button"
                        >
                          {mountActionBusy === "remove" ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Trash2 aria-hidden="true" size={16} />}
                          {localize(t, "Remove existing Mount", "기존 Mount 삭제")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {mountInspection && !mountInspection.exists ? (
                    <div className="actions">
                      <button className="primary" disabled={!preflightPassed || busy !== null} onClick={() => void applyPlugin()} type="button">
                        <Rocket aria-hidden="true" size={16} /> {localize(t, "Apply again", "다시 적용")}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}
          {generated ? (
            <div className="dryRunPanel">
              <div className="resultBanner compactBanner">
                <strong>{localize(t, "Dry-run apply diff", "Dry-run 적용 변경점")}</strong>
                <span>{factoryModeLabel(generated.dryRun.mode, t)}</span>
              </div>
              <p>{generatedDisplay?.dryRunSummary}</p>
              {generatedDisplay?.dryRunChanges.map((change) => (
                <div className="diffRow" key={`${change.action}-${change.target}`}>
                  <span className={change.risk}>{change.riskLabel}</span>
                  <div>
                    <strong>
                      {change.actionLabel} {change.target}
                    </strong>
                    <small>
                      {change.before} → {change.after}
                    </small>
                  </div>
                </div>
              ))}
              <div className="safetyList">
                {generatedDisplay?.safetyItems.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <button type="button" onClick={() => void previewRollback()}>
                {localize(t, "Preview rollback", "롤백 미리보기")}
              </button>
              {rollbackPreview ? <div className="warningLine">{rollbackPreview}</div> : null}
            </div>
          ) : null}
          {applyResult ? (
            <section className="applyResultSection">
              <div className="resultSectionHeader">
                <div>
                  <span>{localize(t, "Deployment output", "배포 실행 결과")}</span>
                  <h3>{localize(t, "Apply result", "적용 결과")}</h3>
                </div>
                <strong>{applyResult.applied ? localize(t, "Applied", "적용됨") : localize(t, "Pending", "대기")}</strong>
              </div>
              <div className="applyResult">
                <div className="resultBanner">
                  <strong>{applyResult.pluginName}</strong>
                  <span>{factoryModeLabel(applyResult.mode, t)}</span>
                </div>
                {applyResult.steps.map((step) => (
                  <div className="applyStep" key={`${step.label}-${step.detail}`}>
                    <span className={step.status}>{factoryStatusLabel(step.status, t)}</span>
                    <div>
                      <strong>{factoryResultStepLabel(step.label, t)}</strong>
                      <small>{factoryResultStepDetail(step.detail, t)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {generated.rollbackPlan.available && rollbackAvailable ? (
            <section className="rollbackZone">
              <div className="panelHeader">
                <div><h3>{localize(t, "Rollback", "롤백")}</h3><p>{factoryRollbackSummary(generated, t)}</p></div>
                <Undo2 aria-hidden="true" size={20} />
              </div>
              <label className="toggleLine">
                <input checked={removeCatalogOnRollback} onChange={(event) => setRemoveCatalogOnRollback(event.target.checked)} type="checkbox" />
                {localize(t, "Remove plugin catalog entry after disabling the mount", "Mount 비활성화 후 플러그인 카탈로그 항목도 제거")}
              </label>
              <label className="toggleLine rollbackConfirm">
                <input checked={rollbackConfirmed} onChange={(event) => setRollbackConfirmed(event.target.checked)} type="checkbox" />
                {localize(t, `I understand this disables ${generated.mountPath}/.`, `${generated.mountPath}/가 비활성화됨을 확인했습니다.`)}
              </label>
              <div className="actions">
                <button onClick={() => void previewRollback()} type="button">{localize(t, "Preview commands", "명령 미리보기")}</button>
                <button disabled={!canApply || !rollbackAvailable || !rollbackConfirmed || busy !== null} onClick={() => void executePluginRollback()} type="button">
                  {localize(t, "Execute rollback", "롤백 실행")}
                </button>
              </div>
              {rollbackResult ? (
                <div className="applyResult">
                  {rollbackResult.steps.map((step) => <div className="applyStep" key={step.label}><span className={step.status}>{factoryStatusLabel(step.status, t)}</span><div><strong>{factoryResultStepLabel(step.label, t)}</strong><small>{factoryResultStepDetail(step.detail, t)}</small></div></div>)}
                </div>
              ) : null}
            </section>
          ) : null}
        </section>
      ) : null}

      {activeFactoryTab === "history" ? (
        <section className="tablePanel factoryHistoryPanel factoryViewPanel" id="factory-view-history">
          <div className="panelHeader">
            <div>
              <h2>{localize(t, "Saved Factory jobs", "저장된 Factory 작업")}</h2>
              <p>{localize(t, "Chats, files, approvals, and deployment events survive refresh and sign-in.", "대화, 파일, 승인, 배포 이벤트가 새로고침과 재로그인 후에도 유지됩니다.")}</p>
            </div>
            <button onClick={() => void refreshFactoryJobs()} type="button"><RefreshCw aria-hidden="true" size={16} /> {localize(t, "Refresh", "새로고침")}</button>
          </div>
          <div className="factoryHistoryLayout">
            <div className="factoryJobList">
              {factoryJobs.map((job) => {
                const historyTitle = job.historyTitle?.trim() || job.pluginName;
                const canManageHistory = canManageFactoryHistory(job);
                const canCancelHistory = canCancelFactoryJob(job);
                const canDeleteHistory = canDeleteFactoryHistory(job);
                return (
                  <article className={`factoryJobItem ${job.id === activeJobId ? "active" : ""}`} key={job.id}>
                    <button
                      aria-label={localize(t, `Open history ${historyTitle}`, `${historyTitle} 이력 열기`)}
                      className="factoryJobSelect"
                      disabled={factoryWorkspaceSwitchBlocked}
                      onClick={() => loadFactoryJob(job)}
                      type="button"
                    >
                      <span className={`statusBadge ${job.status}`}>{factoryStatusLabel(job.status, t)}</span>
                      <strong>{historyTitle}</strong>
                      <small>{job.pluginName} · {job.ownerEmail}</small>
                      {job.historyNote ? <p>{job.historyNote}</p> : null}
                      <div className="historyProgress"><span style={{ width: `${job.progress}%` }} /></div>
                      <time dateTime={job.updatedAt}>{new Date(job.updatedAt).toLocaleString()}</time>
                    </button>
                    {canManageHistory ? (
                      <div className="factoryJobActions">
                        <button
                          aria-label={localize(t, `Edit ${historyTitle}`, `${historyTitle} 수정`)}
                          className="iconButton"
                          onClick={() => openFactoryHistoryAction(job, "edit")}
                          title={localize(t, "Edit history", "이력 수정")}
                          type="button"
                        >
                          <PencilLine aria-hidden="true" size={15} />
                        </button>
                        {canCancelHistory ? (
                          <button
                            aria-label={localize(t, `Cancel ${historyTitle}`, `${historyTitle} 작업 취소`)}
                            className="iconButton cancelIconButton"
                            disabled={cancellingJobId === job.id}
                            onClick={() => void cancelFactoryJob(job)}
                            title={localize(t, "Cancel before Vault apply", "Vault 적용 전 작업 취소")}
                            type="button"
                          >
                            <CircleStop aria-hidden="true" size={15} />
                          </button>
                        ) : null}
                        <button
                          aria-label={localize(t, `Delete ${historyTitle}`, `${historyTitle} 삭제`)}
                          className="iconButton dangerIconButton"
                          disabled={!canDeleteHistory}
                          onClick={() => openFactoryHistoryAction(job, "delete")}
                          title={canDeleteHistory
                            ? localize(t, "Delete history", "이력 삭제")
                            : localize(t, "Cancel active, approved, or scheduled jobs before deleting them", "진행 중·승인·예약 작업은 먼저 취소한 뒤 삭제할 수 있습니다")}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={15} />
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!factoryJobs.length ? <div className="empty compact">{localize(t, "No saved Factory jobs.", "저장된 Factory 작업이 없습니다.")}</div> : null}
            </div>
            <div className="factoryEventLog">
              <div className="factoryEventLogHeader">
                <h3>{currentJob ? currentJob.historyTitle?.trim() || currentJob.pluginName : localize(t, "Select a job", "작업을 선택하세요")}</h3>
                {currentJob ? <small>{currentJob.pluginName}</small> : null}
              </div>
              {currentJob?.events.length ? currentJob.events.slice().reverse().map((event) => (
                <div key={event.id} className={event.status}>
                  <span><Activity aria-hidden="true" size={15} /></span>
                  <div><strong>{factoryActionLabel(event.label, t)}</strong><small>{event.detail || new Date(event.createdAt).toLocaleString()}</small></div>
                </div>
              )) : <div className="empty compact">{localize(t, "No job events yet.", "아직 작업 이벤트가 없습니다.")}</div>}
            </div>
          </div>
        </section>
      ) : null}

      {historyAction && historyActionJob ? (
        <PortalOverlay onDismiss={closeFactoryHistoryAction}>
          <section
            aria-label={historyAction.mode === "edit"
              ? localize(t, "Edit Factory job history", "Factory 작업 이력 수정")
              : localize(t, "Delete Factory job history", "Factory 작업 이력 삭제")}
            aria-modal="true"
            className="impactDialog factoryHistoryDialog"
            role="dialog"
          >
            <header>
              <div>
                <span>{localize(t, "Saved job", "저장된 작업")}</span>
                <h2>{historyAction.mode === "edit"
                  ? localize(t, "Edit job history", "작업 이력 수정")
                  : localize(t, "Delete job history", "작업 이력 삭제")}</h2>
              </div>
              <button
                aria-label={localize(t, "Close history dialog", "이력 Dialog 닫기")}
                className="iconButton"
                disabled={historyActionBusy}
                onClick={closeFactoryHistoryAction}
                title={localize(t, "Close", "닫기")}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            {historyAction.mode === "edit" ? (
              <form onSubmit={(event) => { event.preventDefault(); void saveFactoryHistoryDetails(); }}>
                <div className="factoryHistoryForm">
                  <label>
                    <span>{localize(t, "History title", "이력 제목")}</span>
                    <input
                      autoFocus
                      maxLength={120}
                      onChange={(event) => setHistoryAction((current) => current ? { ...current, title: event.target.value } : current)}
                      value={historyAction.title}
                    />
                  </label>
                  <label>
                    <span>{localize(t, "Note", "메모")}</span>
                    <textarea
                      maxLength={500}
                      onChange={(event) => setHistoryAction((current) => current ? { ...current, note: event.target.value } : current)}
                      placeholder={localize(t, "Record the purpose or next action", "작업 목적이나 다음 조치를 기록하세요")}
                      rows={4}
                      value={historyAction.note}
                    />
                    <small>{historyAction.note.length}/500</small>
                  </label>
                  <div className="factoryHistoryContext">
                    <span>{localize(t, "Plugin name", "Plugin 이름")}</span>
                    <code>{historyActionJob.pluginName}</code>
                    <p>{localize(t, "Editing history details does not change the plugin name, generated files, or approval evidence.", "이력 정보만 수정되며 Plugin 이름, 생성 파일, 승인 근거는 변경되지 않습니다.")}</p>
                  </div>
                  {historyActionError ? <div className="error">{historyActionError}</div> : null}
                </div>
                <footer className="actions">
                  <button disabled={historyActionBusy} onClick={closeFactoryHistoryAction} type="button">{localize(t, "Cancel", "취소")}</button>
                  <button className="primary" disabled={historyActionBusy || !historyAction.title.trim()} type="submit">
                    {historyActionBusy ? localize(t, "Saving...", "저장 중...") : localize(t, "Save changes", "변경 저장")}
                  </button>
                </footer>
              </form>
            ) : (
              <>
                <div className="factoryHistoryDeleteReview">
                  <span className="factoryHistoryDeleteIcon"><Trash2 aria-hidden="true" size={20} /></span>
                  <div>
                    <strong>{historyActionJob.historyTitle?.trim() || historyActionJob.pluginName}</strong>
                    <code>{historyActionJob.pluginName}</code>
                  </div>
                  <p>{localize(t, "The saved chat, generated files, and job events will be removed. The deletion itself remains in the portal audit log.", "저장된 대화, 생성 파일, 작업 이벤트가 삭제됩니다. 삭제 작업 자체는 포털 감사 로그에 기록됩니다.")}</p>
                  {historyActionError ? <div className="error">{historyActionError}</div> : null}
                </div>
                <footer className="actions">
                  <button disabled={historyActionBusy} onClick={closeFactoryHistoryAction} type="button">{localize(t, "Cancel", "취소")}</button>
                  <button className="dangerButton" disabled={historyActionBusy} onClick={() => void deleteFactoryHistoryJob()} type="button">
                    {historyActionBusy ? localize(t, "Deleting...", "삭제 중...") : localize(t, "Delete history", "이력 삭제")}
                  </button>
                </footer>
              </>
            )}
          </section>
        </PortalOverlay>
      ) : null}
    </div>
  );
}

function UserManagement({
  t,
  currentUser,
  systems,
  auditEvents,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser | null;
  systems: SystemSummary[];
  auditEvents: AuditEvent[];
  onChanged: () => Promise<void>;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [draftRoles, setDraftRoles] = useState<UserRole[]>([]);
  const [draftGroups, setDraftGroups] = useState<string[]>([]);
  const [draftStatus, setDraftStatus] = useState<UserStatus>("active");
  const [draftMfaEnabled, setDraftMfaEnabled] = useState(false);
  const [draftPasswordResetRequired, setDraftPasswordResetRequired] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [userAction, setUserAction] = useState<"save" | "reset" | null>(null);
  const [policyReviewOpen, setPolicyReviewOpen] = useState(false);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0];
  const availableGroups = useMemo(
    () =>
      Array.from(
        new Set([
          ...users.flatMap((user) => user.groups),
          ...systems.map((system) => system.ownerGroup),
          "security-approvers",
          "platform-admins",
          "audit"
        ])
      ).sort(),
    [systems, users]
  );
  const filteredUsers = users.filter((user) => {
    const search = `${user.email} ${user.displayName} ${user.roles.join(" ")} ${user.groups.join(" ")}`.toLowerCase();
    return search.includes(query.toLowerCase()) && (statusFilter === "all" || user.status === statusFilter);
  });
  const userAuditEvents = selectedUser
    ? auditEvents
        .filter((event) => event.targetId === selectedUser.id || event.actorEmail === selectedUser.email)
        .slice(0, 5)
    : [];
  const canEdit = canManageUsers && Boolean(selectedUser);
  const policyDiff = selectedUser
    ? [
        { label: localize(t, "Account status", "계정 상태"), before: selectedUser.status, after: draftStatus },
        { label: localize(t, "Roles", "권한"), before: [...selectedUser.roles].sort().join(", "), after: [...draftRoles].sort().join(", ") },
        { label: localize(t, "Groups", "그룹"), before: [...selectedUser.groups].sort().join(", "), after: [...draftGroups].sort().join(", ") },
        { label: "MFA", before: String(selectedUser.mfaEnabled), after: String(draftMfaEnabled) },
        {
          label: localize(t, "Password reset required", "비밀번호 변경 필요"),
          before: String(selectedUser.passwordResetRequired),
          after: String(draftPasswordResetRequired)
        }
      ].filter((item) => item.before !== item.after)
    : [];

  async function loadUsers() {
    setLoadingUsers(true);
    setError(null);
    try {
      const response = await api<{
        users: ManagedUser[];
        capabilities: { canManageUsers: boolean; passwordMode: string };
      }>("/admin/users");
      setUsers(response.users);
      setCanManageUsers(response.capabilities.canManageUsers);
      setSelectedUserId((current) => current || response.users[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setDraftRoles(selectedUser.roles);
    setDraftGroups(selectedUser.groups);
    setDraftStatus(selectedUser.status);
    setDraftMfaEnabled(selectedUser.mfaEnabled);
    setDraftPasswordResetRequired(selectedUser.passwordResetRequired);
    setTemporaryPassword("");
    setRevealPassword(false);
    setMessage("");
    setPolicyReviewOpen(false);
  }, [selectedUser?.id]);

  useEffect(() => {
    if (message) notifyPortal(message, "success");
  }, [message]);

  useEffect(() => {
    if (error) notifyPortal(error, "danger");
  }, [error]);

  async function saveAccess() {
    if (!selectedUser) return;
    setError(null);
    setUserAction("save");
    try {
      const response = await api<{ user: ManagedUser }>(`/admin/users/${selectedUser.id}/access`, {
        method: "PATCH",
        body: JSON.stringify({
          roles: draftRoles,
          groups: draftGroups,
          status: draftStatus,
          mfaEnabled: draftMfaEnabled,
          passwordResetRequired: draftPasswordResetRequired
        })
      });
      setUsers((current) => current.map((user) => (user.id === response.user.id ? response.user : user)));
      setMessage(localize(t, "User access policy updated.", "사용자 접근 정책을 업데이트했습니다."));
      setPolicyReviewOpen(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : localize(t, "Unable to update user policy.", "사용자 정책을 업데이트하지 못했습니다."));
    } finally {
      setUserAction(null);
    }
  }

  async function issuePasswordReset() {
    if (!selectedUser) return;
    setError(null);
    setUserAction("reset");
    try {
      const response = await api<{ user: ManagedUser; temporaryPassword: string; expiresIn: string }>(
        `/admin/users/${selectedUser.id}/password-reset`,
        { method: "POST" }
      );
      setUsers((current) => current.map((user) => (user.id === response.user.id ? response.user : user)));
      setTemporaryPassword(response.temporaryPassword);
      setRevealPassword(false);
      setDraftPasswordResetRequired(true);
      setMessage(
        localize(
          t,
          `Temporary password issued. Expires in ${response.expiresIn}.`,
          `임시 비밀번호를 발급했습니다. ${response.expiresIn} 후 만료됩니다.`
        )
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : localize(t, "Unable to issue temporary password.", "임시 비밀번호를 발급하지 못했습니다."));
    } finally {
      setUserAction(null);
    }
  }

  function toggleRole(role: UserRole) {
    setDraftRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  function toggleGroup(group: string) {
    setDraftGroups((current) =>
      current.includes(group) ? current.filter((item) => item !== group) : [...current, group]
    );
  }

  return (
    <div className="stack">
      <section className="overviewPanel userHero">
        <div>
          <span className="eyebrow">{localize(t, "Identity and access administration", "ID 및 접근 관리")}</span>
          <h2>{localize(t, "User Management", "사용자 관리")}</h2>
          <p>
            {localize(
              t,
              "Manage portal users, Vault-facing roles, owner groups, account status, MFA posture, password reset workflow, and session operations from one governed screen.",
              "포털 사용자, Vault 연동 Role, 소유 그룹, 계정 상태, MFA, 비밀번호 reset, 세션 작업을 한 화면에서 관리합니다."
            )}
          </p>
        </div>
        <div className="summaryRail">
          <MiniStat label={localize(t, "Users", "사용자")} value={users.length} />
          <MiniStat label={localize(t, "Admins", "관리자")} value={users.filter((user) => user.roles.includes("vault-admin")).length} />
          <MiniStat label={localize(t, "MFA enabled", "MFA 활성")} value={users.filter((user) => user.mfaEnabled).length} tone="good" />
          <MiniStat label={localize(t, "Locked", "잠김")} value={users.filter((user) => user.status === "locked").length} tone="risk" />
        </div>
      </section>

      {currentUser?.roles.includes("vault-admin") ? null : (
        <div className="noticePanel">
          {localize(
            t,
            "You can view users, but access changes and password reset require the vault-admin role. Login as admin@example.com for the full demo.",
            "사용자 조회는 가능하지만 권한 변경과 비밀번호 reset은 vault-admin 권한이 필요합니다. 전체 데모는 admin@example.com으로 로그인하세요."
          )}
        </div>
      )}

      <div className={`userManagementGrid${mobileDetailOpen ? " mobileDetailOpen" : ""}`}>
        <section className="tablePanel userDirectory">
          <div className="panelHeader">
            <div>
              <h2>{localize(t, "User directory", "사용자 디렉터리")}</h2>
              <p>{localize(t, "Search by user, role, or group.", "사용자, 권한, 그룹 기준으로 검색합니다.")}</p>
            </div>
          </div>
          <div className="userFilters">
            <label>
              {localize(t, "Search", "검색")}
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="developer / vault-admin" />
            </label>
            <label>
              {t.table.status}
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | UserStatus)}>
                <option value="all">{localize(t, "All", "전체")}</option>
                {userStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loadingUsers ? <div className="empty compact">{t.loading}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          <div className="userList">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                className={`userRow ${selectedUser?.id === user.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedUserId(user.id);
                  setMobileDetailOpen(true);
                }}
                type="button"
              >
                <span className={`avatarMark ${user.status}`}>{user.displayName.slice(0, 1)}</span>
                <span>
                  <strong>{user.displayName}</strong>
                  <small>{user.email}</small>
                </span>
                <span className={`statusBadge ${user.status}`}>{user.status}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="tablePanel userDetailPanel">
          {selectedUser ? (
            <>
              <button className="mobileUserBack" onClick={() => setMobileDetailOpen(false)} type="button">
                <ArrowLeft aria-hidden="true" size={16} />
                {localize(t, "Back to users", "사용자 목록")}
              </button>
              <div className="detailTopline">
                <span className={`statusBadge ${selectedUser.status}`}>{selectedUser.status}</span>
                <span className="nodeKind">{selectedUser.authMode}</span>
                <span className={`riskBadge ${selectedUser.passwordResetRequired ? "medium" : "low"}`}>
                  {selectedUser.passwordResetRequired
                    ? localize(t, "RESET REQUIRED", "RESET 필요")
                    : localize(t, "PASSWORD OK", "비밀번호 정상")}
                </span>
              </div>
              <h2>{selectedUser.displayName}</h2>
              <p>{selectedUser.email}</p>

              <div className="detailStats">
                <MiniStat label={localize(t, "Roles", "권한")} value={draftRoles.length} />
                <MiniStat label={localize(t, "Groups", "그룹")} value={draftGroups.length} />
                <MiniStat label={localize(t, "Sessions", "세션")} value={selectedUser.activeSessions} />
              </div>

              <div className="accessEditor">
                <label>
                  {localize(t, "Account status", "계정 상태")}
                  <select
                    disabled={!canEdit}
                    value={draftStatus}
                    onChange={(event) => setDraftStatus(event.target.value as UserStatus)}
                  >
                    {userStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="toggleLine">
                  <input
                    disabled={!canEdit}
                    checked={draftMfaEnabled}
                    onChange={(event) => setDraftMfaEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  {localize(t, "MFA required", "MFA 필수")}
                </label>
                <label className="toggleLine">
                  <input
                    disabled={!canEdit}
                    checked={draftPasswordResetRequired}
                    onChange={(event) => setDraftPasswordResetRequired(event.target.checked)}
                    type="checkbox"
                  />
                  {localize(t, "Force password change at next login", "다음 로그인 시 비밀번호 변경 강제")}
                </label>
              </div>

              <section className="accessSection">
                <h3>{localize(t, "Role assignment", "권한 부여")}</h3>
                <div className="checkboxCloud">
                  {userRoles.map((role) => (
                    <label key={role} className="checkChip">
                      <input
                        disabled={!canEdit || (draftRoles.length === 1 && draftRoles.includes(role))}
                        checked={draftRoles.includes(role)}
                        onChange={() => toggleRole(role)}
                        type="checkbox"
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </section>

              <section className="accessSection">
                <h3>{localize(t, "Group and system ownership", "그룹 및 시스템 소유권")}</h3>
                <div className="checkboxCloud">
                  {availableGroups.map((group) => (
                    <label key={group} className="checkChip">
                      <input
                        disabled={!canEdit}
                        checked={draftGroups.includes(group)}
                        onChange={() => toggleGroup(group)}
                        type="checkbox"
                      />
                      {group}
                    </label>
                  ))}
                </div>
              </section>

              <section className="passwordPanel">
                <div>
                  <h3>{localize(t, "Password reset", "비밀번호 reset")}</h3>
                  <p>
                    {localize(
                      t,
                      "Temporary password is displayed once and is not stored by the portal.",
                      "임시 비밀번호는 1회 표시되며 포털에 저장하지 않습니다."
                    )}
                  </p>
                </div>
                <div className="actions">
                  <button disabled={!canEdit || userAction !== null} onClick={() => void issuePasswordReset()} type="button">
                    {localize(t, "Issue temporary password", "임시 비밀번호 발급")}
                  </button>
                  <button
                    disabled={!temporaryPassword}
                    onClick={() => setRevealPassword((current) => !current)}
                    type="button"
                  >
                    {revealPassword ? localize(t, "Hide", "숨기기") : localize(t, "Reveal once", "1회 보기")}
                  </button>
                </div>
                {temporaryPassword ? (
                  <div className="oneTimeSecret">
                    <code>{revealPassword ? temporaryPassword : "••••••••••••••••"}</code>
                    <button disabled={!revealPassword} onClick={() => void navigator.clipboard?.writeText(temporaryPassword)} type="button">
                      Copy
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="accessSection">
                <h3>{localize(t, "Session and audit controls", "세션 및 감사 제어")}</h3>
                <div className="sessionGrid">
                  <div>
                    <span>{localize(t, "Last login", "최근 로그인")}</span>
                    <strong>{selectedUser.lastLoginAt ? formatDate(selectedUser.lastLoginAt) : "-"}</strong>
                  </div>
                  <div>
                    <span>{localize(t, "Active sessions", "활성 세션")}</span>
                    <strong>{selectedUser.activeSessions}</strong>
                  </div>
                  <button
                    disabled={!canEdit}
                    onClick={() => setMessage(localize(t, "Session revoke queued in mock mode.", "Mock 모드에서 세션 폐기 작업을 예약했습니다."))}
                    type="button"
                  >
                    {localize(t, "Revoke sessions", "세션 폐기")}
                  </button>
                </div>
              </section>

              {message ? <div className="noticePanel compact">{message}</div> : null}

              <div className="actions">
                <button onClick={() => void loadUsers()} type="button">
                  {localize(t, "Reload", "새로고침")}
                </button>
                <button
                  className="primary"
                  disabled={!canEdit || draftRoles.length === 0 || userAction !== null || policyDiff.length === 0}
                  onClick={() => setPolicyReviewOpen(true)}
                  type="button"
                >
                  {localize(t, "Save user policy", "사용자 정책 저장")}
                </button>
              </div>
            </>
          ) : (
            <div className="empty compact">{t.table.noData}</div>
          )}
        </section>
      </div>

      <Table
        title={localize(t, "Recent user audit events", "최근 사용자 감사 이벤트")}
        columns={[t.table.time, t.table.actor, t.table.action, t.table.target, t.table.result]}
        rows={userAuditEvents.map((event) => [
          formatDate(event.createdAt),
          event.actorEmail,
          auditActionLabel(t, event.action),
          `${event.targetType}:${event.targetId.slice(0, 8)}`,
          event.result
        ])}
        emptyLabel={t.table.noData}
      />
      {policyReviewOpen && selectedUser ? (
        <PortalOverlay onDismiss={() => setPolicyReviewOpen(false)}>
          <section aria-label={localize(t, "User policy change review", "사용자 정책 변경 검토")} aria-modal="true" className="impactDialog policyDiffDialog" role="dialog">
            <header>
              <div>
                <span>{localize(t, "Policy diff", "정책 Diff")}</span>
                <h2>{selectedUser.displayName}</h2>
              </div>
              <button aria-label={localize(t, "Close policy review", "정책 검토 닫기")} className="iconButton" onClick={() => setPolicyReviewOpen(false)} title={localize(t, "Close", "닫기")} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <div className="policyDiffList">
              {policyDiff.map((item) => (
                <div key={item.label}>
                  <strong>{item.label}</strong>
                  <code className="diffBefore">{item.before || "-"}</code>
                  <ArrowRight aria-hidden="true" size={15} />
                  <code className="diffAfter">{item.after || "-"}</code>
                </div>
              ))}
            </div>
            <div className="impactNotice">
              <ShieldCheck aria-hidden="true" size={18} />
              <span>{localize(t, "The change takes effect on the user's next authorization check and is written to the audit log.", "변경 사항은 사용자의 다음 권한 확인부터 적용되며 감사 로그에 기록됩니다.")}</span>
            </div>
            <footer className="actions">
              <button disabled={userAction !== null} onClick={() => setPolicyReviewOpen(false)} type="button">{localize(t, "Cancel", "취소")}</button>
              <button className="primary" disabled={userAction !== null || policyDiff.length === 0} onClick={() => void saveAccess()} type="button">{localize(t, "Apply policy", "정책 적용")}</button>
            </footer>
          </section>
        </PortalOverlay>
      ) : null}
    </div>
  );
}

function VaultLiveSync({
  t,
  syncedAt,
  syncing,
  error,
  onRefresh
}: {
  t: Copy;
  syncedAt: string | null;
  syncing: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section aria-live="polite" className={`vaultLiveSync${error ? " delayed" : ""}`}>
      <div className="vaultLiveSyncStatus">
        <Activity aria-hidden="true" size={18} />
        <div>
          <strong>{localize(t, "Live Vault synchronization", "Vault 실시간 동기화")}</strong>
          <span>
            {error
              ? localize(t, `Last data retained · ${error}`, `마지막 데이터를 유지 중 · ${error}`)
              : syncedAt
                ? localize(t, `Updated ${formatDate(syncedAt)} · every 15 seconds`, `${formatDate(syncedAt)} 업데이트 · 15초 간격`)
                : localize(t, "Waiting for the first Vault snapshot", "첫 Vault 스냅샷을 기다리는 중")}
          </span>
        </div>
      </div>
      <button className="vaultSyncButton" disabled={syncing} onClick={onRefresh} type="button">
        <RefreshCw aria-hidden="true" className={syncing ? "spinning" : ""} size={16} />
        <span>{syncing ? localize(t, "Synchronizing", "동기화 중") : localize(t, "Sync now", "지금 동기화")}</span>
      </button>
    </section>
  );
}

function VaultInventoryWarnings({ t, warnings }: { t: Copy; warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="vaultInventoryWarnings" role="status">
      <AlertTriangle aria-hidden="true" size={17} />
      <div>
        <strong>{localize(t, "Vault inventory needs review", "Vault 인벤토리 확인 필요")}</strong>
        {warnings.map((warning) => <span key={warning}>{vaultWarningLabel(t, warning)}</span>)}
      </div>
    </div>
  );
}

function vaultWarningLabel(t: Copy, warning: string): string {
  const labels: Record<string, [string, string]> = {
    mock_inventory_unavailable: [
      "Mock Vault mode does not provide live Mount or Plugin Catalog inventory.",
      "Mock Vault 모드에서는 실제 Mount 및 Plugin Catalog 인벤토리를 제공하지 않습니다."
    ],
    "Mock Vault mode has no live mount or plugin catalog inventory": [
      "Mock Vault mode does not provide live Mount or Plugin Catalog inventory.",
      "Mock Vault 모드에서는 실제 Mount 및 Plugin Catalog 인벤토리를 제공하지 않습니다."
    ],
    mock_reconciliation_limited: [
      "Mock Vault mode cannot inspect live Role or runtime capabilities.",
      "Mock Vault 모드에서는 실제 Role 및 Runtime 권한을 검증할 수 없습니다."
    ],
    "Mock Vault mode does not perform live role or capability inspection": [
      "Mock Vault mode cannot inspect live Role or runtime capabilities.",
      "Mock Vault 모드에서는 실제 Role 및 Runtime 권한을 검증할 수 없습니다."
    ]
  };
  const label = labels[warning];
  return label ? localize(t, label[0], label[1]) : warning;
}

function PlatformHealth({
  t,
  vaultHealth,
  mappingHealth,
  inventory,
  reconciliation,
  syncedAt,
  syncing,
  syncError,
  onRefresh
}: {
  t: Copy;
  vaultHealth: VaultHealthResponse | null;
  mappingHealth: VaultMappingHealth[];
  inventory: VaultInventory | null;
  reconciliation: VaultReconciliationReport | null;
  syncedAt: string | null;
  syncing: boolean;
  syncError: string | null;
  onRefresh: () => void;
}) {
  const healthyMappings = mappingHealth.filter((mapping) => mapping.reachable).length;
  const driftCount = reconciliation?.summary.drifted ?? Math.max(mappingHealth.length - healthyMappings, 0);
  return (
    <div className="stack">
      <VaultLiveSync
        t={t}
        syncedAt={syncedAt}
        syncing={syncing}
        error={syncError}
        onRefresh={onRefresh}
      />
      <VaultInventoryWarnings t={t} warnings={inventory?.warnings ?? []} />
      <section className="overviewPanel healthHero">
        <div>
          <span className="eyebrow">{localize(t, "Vault Health / Cluster Status", "Vault Health / Cluster Status")}</span>
          <h2>{localize(t, "Platform connectivity and mount reachability", "플랫폼 연결 및 Mount 접근 상태")}</h2>
          <p>
            {localize(
              t,
              "This view separates Vault platform health from business administration so operators can quickly validate seal state, version, cluster name, and namespace or mount reachability.",
              "Vault 플랫폼 상태를 업무 관리 화면에서 분리해 seal 상태, 버전, 클러스터명, Namespace/Mount 접근 가능 여부를 빠르게 확인합니다."
            )}
          </p>
        </div>
        <div className="summaryRail">
          <MiniStat
            label={localize(t, "Connected", "연결")}
            value={vaultHealth?.healthy ? 1 : 0}
            tone={vaultHealth?.healthy ? "good" : "risk"}
          />
          <MiniStat label={localize(t, "Vault mounts", "Vault Mount")} value={inventory?.summary.totalMounts ?? healthyMappings} tone="good" />
          <MiniStat label={localize(t, "Inspected targets", "검증 대상")} value={reconciliation?.summary.total ?? mappingHealth.length} />
          <MiniStat
            label={localize(t, "Vault drift", "Vault 불일치")}
            value={driftCount}
            tone={driftCount > 0 ? "risk" : "good"}
          />
        </div>
      </section>

      {reconciliation ? <VaultReconciliationHealthStrip report={reconciliation} t={t} /> : null}

      <div className="dashboardGrid">
        <section className="insightPanel">
          <h2>{localize(t, "Cluster status", "클러스터 상태")}</h2>
          <dl className="compactDl">
            <dt>{t.table.mode}</dt>
            <dd>{vaultHealth?.mode ?? t.admin.unknown}</dd>
            <dt>{t.table.healthy}</dt>
            <dd>{vaultHealth?.healthy === true ? t.admin.yes : vaultHealth?.healthy === false ? t.admin.no : t.admin.unknown}</dd>
            <dt>{localize(t, "Seal status", "Seal 상태")}</dt>
            <dd>{String(vaultHealth?.detail.sealed ?? vaultHealth?.detail.seal_status ?? "mock/unknown")}</dd>
            <dt>{t.table.version}</dt>
            <dd>{String(vaultHealth?.detail.version ?? "-")}</dd>
            <dt>{t.table.cluster}</dt>
            <dd>{String(vaultHealth?.detail.cluster_name ?? vaultHealth?.detail.clusterName ?? "-")}</dd>
            <dt>{localize(t, "Last synchronized", "마지막 동기화")}</dt>
            <dd>{syncedAt ? formatDate(syncedAt) : t.admin.unknown}</dd>
          </dl>
        </section>
        <section className="insightPanel">
          <h2>{localize(t, "Namespace / mount summary", "Namespace / Mount 요약")}</h2>
          <div className="dependencyChipCloud">
            {Array.from(new Set(mappingHealth.map((mapping) => mapping.namespace ?? "root"))).map((namespace) => (
              <span key={namespace}>{namespace}</span>
            ))}
          </div>
          <div className="dependencyOrbitStats">
            <MiniStat label={localize(t, "Mock", "Mock")} value={mappingHealth.filter((mapping) => mapping.status === "mock").length} />
            <MiniStat label={localize(t, "HTTP OK", "HTTP OK")} value={mappingHealth.filter((mapping) => mapping.status === 200 || mapping.reachable).length} tone="good" />
            <MiniStat label={localize(t, "Errors", "오류")} value={mappingHealth.filter((mapping) => !mapping.reachable).length} tone="risk" />
          </div>
        </section>
      </div>

      <Table
        title={localize(t, "Namespace and mount reachability", "Namespace 및 Mount 접근성")}
        columns={[t.table.system, t.table.type, t.table.namespace, t.table.mount, t.table.role, t.table.reachable]}
        rows={mappingHealth.map((mapping) => [
          mapping.systemName,
          mapping.requestType,
          mapping.namespace ?? "-",
          mapping.mountPath,
          mapping.roleName,
          mapping.reachable ? t.admin.yes : `${t.admin.no} (${mapping.status})`
        ])}
        emptyLabel={t.table.noData}
      />
      <Table
        title={localize(t, "Actual Vault mounts", "실제 Vault Mount")}
        columns={[
          localize(t, "Path", "경로"),
          localize(t, "Category", "구분"),
          localize(t, "Type", "Type"),
          localize(t, "Source", "소스"),
          t.table.version
        ]}
        rows={(inventory?.mounts ?? []).map((mount) => [
          `${mount.path}/`,
          mount.kind,
          mount.type,
          mount.source,
          mount.pluginVersion ?? "-"
        ])}
        emptyLabel={localize(t, "No live Vault mount data.", "실제 Vault Mount 데이터가 없습니다.")}
      />
    </div>
  );
}

function VaultReconciliationHealthStrip({
  report,
  t
}: {
  report: VaultReconciliationReport;
  t: Copy;
}) {
  const routingLabel = report.routing.mode === "fixed"
    ? `${localize(t, "Fixed Namespace", "고정 Namespace")} · ${report.routing.configuredNamespace ?? "root"}`
    : report.routing.mode === "system"
      ? localize(t, "System Namespace routing", "시스템별 Namespace 라우팅")
      : localize(t, "Root Namespace routing", "Root Namespace 라우팅");
  return (
    <section className={`reconciliationHealthStrip${report.summary.drifted > 0 ? " hasDrift" : ""}`}>
      <div>
        {report.summary.drifted > 0
          ? <ShieldAlert aria-hidden="true" size={19} />
          : <ShieldCheck aria-hidden="true" size={19} />}
        <span>
          <strong>{localize(t, "Vault state reconciliation", "Vault 상태 조정")}</strong>
          <small>{routingLabel}</small>
        </span>
      </div>
      <div className="reconciliationHealthMetrics">
        <span><strong>{report.summary.inSync}</strong>{localize(t, "Aligned", "정상")}</span>
        <span><strong>{report.summary.drifted}</strong>{localize(t, "Drift", "불일치")}</span>
        <span><strong>{report.summary.unknownChecks}</strong>{localize(t, "Unverified", "미검증")}</span>
      </div>
    </section>
  );
}

function VaultReconciliationCenter({
  report,
  t,
  onResolvePlugin
}: {
  report: VaultReconciliationReport | null;
  t: Copy;
  onResolvePlugin?: (item: VaultReconciliationItem) => void;
}) {
  const [filter, setFilter] = useState<"all" | VaultReconciliationItem["status"]>("all");
  const items = report?.items.filter((item) => filter === "all" || item.status === filter) ?? [];
  const routingLabel = report?.routing.mode === "fixed"
    ? `${localize(t, "Fixed", "고정")} · ${report.routing.configuredNamespace ?? "root"}`
    : report?.routing.mode === "system"
      ? localize(t, "Per system", "시스템별")
      : "root";
  const filters: Array<{ id: "all" | VaultReconciliationItem["status"]; label: string; count: number }> = [
    { id: "all", label: localize(t, "All", "전체"), count: report?.summary.total ?? 0 },
    { id: "drift", label: localize(t, "Drift", "불일치"), count: report?.summary.drifted ?? 0 },
    { id: "unknown", label: localize(t, "Review", "확인 필요"), count: report?.summary.unknown ?? 0 },
    { id: "in-sync", label: localize(t, "Aligned", "정상"), count: report?.summary.inSync ?? 0 }
  ];

  return (
    <section className="reconciliationPanel" id="vault-reconciliation">
      <header className="reconciliationHeader">
        <div className="reconciliationTitle">
          <span className="reconciliationIcon"><GitCompare aria-hidden="true" size={18} /></span>
          <div>
            <h2>Vault Reconciliation Center</h2>
            <p>{localize(t, "Desired Portal configuration compared with live Vault evidence", "Portal 기대 상태와 실제 Vault 검증 결과")}</p>
          </div>
        </div>
        <span className="reconciliationRouting"><span>{localize(t, "Namespace routing", "Namespace 라우팅")}</span><strong>{routingLabel}</strong></span>
      </header>

      {report?.warnings.length ? (
        <div className="reconciliationWarnings" role="status">
          <AlertTriangle aria-hidden="true" size={16} />
          <div>
            <strong>{localize(t, "Inspection warnings", "검증 경고")}</strong>
            {report.warnings.map((warning) => <span key={warning}>{reconciliationWarningCopy(warning, t)}</span>)}
          </div>
        </div>
      ) : null}

      <div className="reconciliationSummary" aria-label={localize(t, "Reconciliation summary", "상태 조정 요약")}>
        <MiniStat label={localize(t, "Inspected", "검증 대상")} value={report?.summary.total ?? 0} />
        <MiniStat label={localize(t, "Aligned", "정상")} value={report?.summary.inSync ?? 0} tone="good" />
        <MiniStat label={localize(t, "Drift", "불일치")} value={report?.summary.drifted ?? 0} tone={(report?.summary.drifted ?? 0) > 0 ? "risk" : "good"} />
        <MiniStat label={localize(t, "Critical", "심각")} value={report?.summary.critical ?? 0} tone={(report?.summary.critical ?? 0) > 0 ? "risk" : "default"} />
      </div>

      <div className="reconciliationToolbar">
        <div aria-label={localize(t, "Filter reconciliation status", "상태 조정 결과 필터")} className="reconciliationFilters" role="group">
          {filters.map((item) => (
            <button
              aria-pressed={filter === item.id}
              className={filter === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              <span>{item.label}</span><strong>{item.count}</strong>
            </button>
          ))}
        </div>
        <span className="reconciliationGate"><ShieldCheck aria-hidden="true" size={15} />{localize(t, "Approval required before change", "변경 전 승인 필요")}</span>
      </div>

      <div className="reconciliationList">
        {!report ? (
          <div className="reconciliationEmpty"><LoaderCircle aria-hidden="true" className="spinning" size={18} />{localize(t, "Loading live Vault evidence", "실제 Vault 검증 결과를 불러오는 중")}</div>
        ) : items.length === 0 ? (
          <div className="reconciliationEmpty"><CheckCircle2 aria-hidden="true" size={18} />{localize(t, "No targets match this filter.", "이 조건에 해당하는 대상이 없습니다.")}</div>
        ) : items.map((item) => (
          <VaultReconciliationRow item={item} key={item.id} onResolvePlugin={onResolvePlugin} t={t} />
        ))}
      </div>
    </section>
  );
}

function VaultReconciliationRow({
  item,
  t,
  onResolvePlugin
}: {
  item: VaultReconciliationItem;
  t: Copy;
  onResolvePlugin?: (item: VaultReconciliationItem) => void;
}) {
  const statusLabel = item.status === "drift"
    ? localize(t, "Drift", "불일치")
    : item.status === "unknown"
      ? localize(t, "Review", "확인 필요")
      : localize(t, "Aligned", "정상");
  const actionLabel = item.remediation.action === "open-plugin-factory"
    ? localize(t, "Open Plugin Factory", "Plugin Factory 열기")
    : item.remediation.action === "review-system"
      ? localize(t, "Review system mapping", "시스템 매핑 검토")
      : localize(t, "No action required", "조치 필요 없음");
  const actionHref = item.remediation.action === "open-plugin-factory"
    ? `/plugins${item.pluginName ? `?plugin=${encodeURIComponent(item.pluginName)}` : ""}`
    : item.remediation.action === "review-system"
      ? `/systems${item.systemName ? `?q=${encodeURIComponent(item.systemName)}` : ""}`
      : undefined;
  const subtitle = [item.systemName, item.requestType, item.targetType === "plugin" ? "Custom Plugin" : undefined]
    .filter(Boolean)
    .join(" · ");
  return (
    <details className={`reconciliationRow ${item.status} ${item.severity}`} id={reconciliationAnchor(item.id)}>
      <summary>
        <span className="reconciliationRowStatus" aria-hidden="true">
          {item.status === "drift" ? <AlertTriangle size={17} /> : item.status === "unknown" ? <CircleGauge size={17} /> : <CheckCircle2 size={17} />}
        </span>
        <span className="reconciliationRowTitle"><strong>{item.title}</strong><small>{subtitle}</small></span>
        <span className={`reconciliationStatus ${item.status}`}>{statusLabel}</span>
        <ArrowRight aria-hidden="true" className="reconciliationChevron" size={16} />
      </summary>
      <div className="reconciliationDetails">
        <div className="reconciliationChecks">
          {item.checks.map((check) => <VaultReconciliationCheckView check={check} key={check.kind} t={t} />)}
        </div>
        <div className="reconciliationRemediation">
          <span><ShieldCheck aria-hidden="true" size={17} /></span>
          <div className="reconciliationRemediationCopy">
            <strong>{actionLabel}</strong>
            <p>{checkDetailCopy(item.remediation.detail, t)}</p>
          </div>
          {item.remediation.requiresApproval ? <span className="reconciliationApproval">{localize(t, "Approval required", "승인 필요")}</span> : null}
          <div className="reconciliationRemediationActions">
            {item.status === "drift" && item.targetType === "plugin" && item.pluginType && onResolvePlugin ? (
              <button className="reconciliationResolveButton" onClick={() => onResolvePlugin(item)} type="button">
                <Wrench aria-hidden="true" size={14} />
                {localize(t, "Resolve mismatch", "불일치 해결")}
              </button>
            ) : null}
            {actionHref ? <Link href={actionHref}>{actionLabel}<ArrowRight aria-hidden="true" size={14} /></Link> : null}
          </div>
        </div>
      </div>
    </details>
  );
}

function VaultReconciliationCheckView({ check, t }: { check: VaultReconciliationCheck; t: Copy }) {
  const label = reconciliationCheckLabel(check.kind, t);
  const statusLabel = check.status === "pass"
    ? localize(t, "Pass", "정상")
    : check.status === "fail"
      ? localize(t, "Drift", "불일치")
      : check.status === "not-applicable"
        ? localize(t, "N/A", "해당 없음")
        : localize(t, "Review", "확인 필요");
  return (
    <article className={`reconciliationCheck ${check.status}`}>
      <header>
        <span>
          {check.status === "pass" ? <CheckCircle2 aria-hidden="true" size={15} /> : check.status === "fail" ? <AlertTriangle aria-hidden="true" size={15} /> : <CircleGauge aria-hidden="true" size={15} />}
          <strong>{label}</strong>
        </span>
        <em>{statusLabel}</em>
      </header>
      <dl>
        <dt>{localize(t, "Desired", "기대값")}</dt><dd>{check.expected}</dd>
        <dt>{localize(t, "Actual", "실제값")}</dt><dd>{check.actual}</dd>
      </dl>
      {check.detail ? <p>{checkDetailCopy(check.detail, t)}</p> : null}
    </article>
  );
}

function reconciliationCheckLabel(kind: VaultReconciliationCheck["kind"], t: Copy): string {
  const labels: Record<VaultReconciliationCheck["kind"], [string, string]> = {
    mount: ["Mount", "Mount"],
    namespace: ["Namespace", "Namespace"],
    role: ["Role", "Role"],
    capability: ["Runtime capability", "Runtime 권한"],
    catalog: ["Plugin Catalog", "Plugin Catalog"]
  };
  return localize(t, labels[kind][0], labels[kind][1]);
}

function checkDetailCopy(detail: string, t: Copy): string {
  const localized: Record<string, string> = {
    "Desired and actual Vault state are aligned for the inspected checks.": "검증한 항목의 Portal 기대 상태와 실제 Vault 상태가 일치합니다.",
    "A mounted external Plugin has no matching Catalog registration": "Mount된 외부 Plugin과 일치하는 Catalog 등록 정보가 없습니다.",
    "The external Plugin is present in the Vault Plugin Catalog": "외부 Plugin이 Vault Plugin Catalog에 등록되어 있습니다.",
    "Live Mount paths were matched to this Catalog entry": "실제 Mount 경로가 이 Catalog 항목과 일치합니다.",
    "A Catalog-only Plugin is valid, but its desired Mount state is not declared in the Portal": "Catalog 등록만 된 Plugin은 유효하지만 Portal에 기대 Mount 상태가 정의되어 있지 않습니다.",
    "Portal system configuration and the active Vault API routing target differ": "Portal 시스템 설정과 현재 Vault API가 사용하는 Namespace가 다릅니다.",
    "Portal configuration and Vault API routing use the same Namespace": "Portal 설정과 Vault API 라우팅이 같은 Namespace를 사용합니다.",
    "The configured Mount is absent from the target Namespace": "설정된 Mount가 대상 Namespace에 없습니다.",
    "The expected Mount is present in the live Vault inventory": "기대 Mount가 실제 Vault 인벤토리에 있습니다.",
    "KV mappings use this field as a data path, not a Vault Role": "KV 매핑에서는 이 값이 Vault Role이 아니라 데이터 경로로 사용됩니다.",
    "This custom Plugin does not declare a standard Role inspection endpoint": "이 Custom Plugin에는 표준 Role 검증 경로가 정의되어 있지 않습니다."
  };
  return t === copy.ko ? localized[detail] ?? detail : detail;
}

function reconciliationWarningCopy(warning: string, t: Copy): string {
  const knownWarning = vaultWarningLabel(t, warning);
  if (knownWarning !== warning) return knownWarning;
  if (t !== copy.ko) return warning;
  if (warning.startsWith("Detected ") && warning.includes("mounted external plugin")) {
    return warning.replace("Detected ", "감지: ").replace(" mounted external plugin", "개의 Mount된 외부 Plugin").replace(" without a catalog entry", "에 Catalog 등록 정보가 없습니다");
  }
  if (warning.startsWith("Unable to inspect runtime capabilities")) {
    return warning.replace("Unable to inspect runtime capabilities in ", "Runtime 권한 검증 실패 · Namespace ");
  }
  return warning;
}

function reconciliationAnchor(id: string): string {
  return `vault-reconciliation-${id.replace(/[^a-z0-9_-]/gi, "-")}`;
}

type ManagedVaultMountTarget = {
  pluginName: string;
  pluginType: VaultPluginType;
  mountPath: string;
};

type PluginCatalogRepairTarget = {
  pluginName: string;
  pluginType: VaultPluginType;
};

type AdminSection = "overview" | "reconciliation" | "plugins" | "mappings" | "notifications";

function Admin({
  t,
  systems,
  vaultHealth,
  mappingHealth,
  inventory,
  reconciliation,
  syncedAt,
  syncing,
  syncError,
  onRefresh
}: {
  t: Copy;
  systems: SystemSummary[];
  vaultHealth: VaultHealthResponse | null;
  mappingHealth: VaultMappingHealth[];
  inventory: VaultInventory | null;
  reconciliation: VaultReconciliationReport | null;
  syncedAt: string | null;
  syncing: boolean;
  syncError: string | null;
  onRefresh: () => void;
}) {
  const customPlugins = inventory?.plugins.filter((plugin) => !plugin.builtin) ?? [];
  const catalogMismatchCount =
    (inventory?.summary.registeredOnlyCustomPlugins ?? 0) +
    (inventory?.summary.unregisteredMountedPlugins ?? 0);
  const [unmountTarget, setUnmountTarget] = useState<ManagedVaultMountTarget | null>(null);
  const [unmountInspection, setUnmountInspection] = useState<VaultPluginMountInspectionResult | null>(null);
  const [unmountResult, setUnmountResult] = useState<VaultPluginMountRemovalResult | null>(null);
  const [unmountConfirmation, setUnmountConfirmation] = useState("");
  const [unmountOperation, setUnmountOperation] = useState<"inspect" | "remove" | null>(null);
  const [unmountError, setUnmountError] = useState<string | null>(null);
  const [catalogRepairTarget, setCatalogRepairTarget] = useState<PluginCatalogRepairTarget | null>(null);
  const [catalogRepairInspection, setCatalogRepairInspection] = useState<VaultPluginCatalogRepairInspection | null>(null);
  const [catalogRepairResult, setCatalogRepairResult] = useState<VaultPluginCatalogRepairResult | null>(null);
  const [catalogRepairOperation, setCatalogRepairOperation] = useState<"inspect" | "repair" | null>(null);
  const [catalogRepairError, setCatalogRepairError] = useState<string | null>(null);
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const adminSections: Array<{ id: AdminSection; label: string; icon: LucideIcon }> = [
    { id: "overview", label: localize(t, "Overview", "개요"), icon: Activity },
    { id: "reconciliation", label: localize(t, "Reconciliation", "상태 조정"), icon: GitCompare },
    { id: "plugins", label: localize(t, "Plugins and Mounts", "Plugin 및 Mount"), icon: PlugZap },
    { id: "mappings", label: localize(t, "Mappings", "Mapping"), icon: Workflow },
    { id: "notifications", label: localize(t, "Notifications", "Notification"), icon: Bell }
  ];
  const unmountConfirmationMatches = Boolean(
    unmountTarget && normalizeFactoryMountPath(unmountConfirmation) === unmountTarget.mountPath
  );

  function closeUnmountDialog() {
    if (unmountOperation) return;
    setUnmountTarget(null);
    setUnmountInspection(null);
    setUnmountResult(null);
    setUnmountConfirmation("");
    setUnmountError(null);
  }

  async function inspectManagedMount(target: ManagedVaultMountTarget) {
    setUnmountOperation("inspect");
    setUnmountInspection(null);
    setUnmountResult(null);
    setUnmountError(null);
    try {
      const response = await api<{ result: VaultPluginMountInspectionResult }>("/vault/plugin-mounts/inspect", {
        method: "POST",
        body: JSON.stringify(target)
      });
      setUnmountInspection(response.result);
      if (!response.result.exists) onRefresh();
    } catch (error) {
      setUnmountError(error instanceof Error ? error.message : String(error));
    } finally {
      setUnmountOperation(null);
    }
  }

  function openUnmountDialog(target: ManagedVaultMountTarget) {
    const normalizedTarget = { ...target, mountPath: normalizeFactoryMountPath(target.mountPath) };
    setUnmountTarget(normalizedTarget);
    setUnmountConfirmation("");
    void inspectManagedMount(normalizedTarget);
  }

  function closeCatalogRepairDialog() {
    if (catalogRepairOperation) return;
    setCatalogRepairTarget(null);
    setCatalogRepairInspection(null);
    setCatalogRepairResult(null);
    setCatalogRepairError(null);
  }

  async function inspectPluginCatalogRepair(target: PluginCatalogRepairTarget) {
    setCatalogRepairOperation("inspect");
    setCatalogRepairInspection(null);
    setCatalogRepairResult(null);
    setCatalogRepairError(null);
    try {
      const response = await api<{ inspection: VaultPluginCatalogRepairInspection }>(
        "/vault/reconciliation/plugin-catalog/inspect",
        {
          method: "POST",
          body: JSON.stringify(target)
        }
      );
      setCatalogRepairInspection(response.inspection);
      if (response.inspection.status === "resolved") onRefresh();
    } catch (error) {
      setCatalogRepairError(error instanceof Error ? error.message : String(error));
    } finally {
      setCatalogRepairOperation(null);
    }
  }

  function openCatalogRepairDialog(item: VaultReconciliationItem) {
    if (!item.pluginName || !item.pluginType) return;
    const target = { pluginName: item.pluginName, pluginType: item.pluginType };
    setCatalogRepairTarget(target);
    setCatalogRepairInspection(null);
    setCatalogRepairResult(null);
    setCatalogRepairError(null);
    void inspectPluginCatalogRepair(target);
  }

  async function repairPluginCatalog() {
    const candidate = catalogRepairInspection?.candidate;
    if (!catalogRepairTarget || catalogRepairInspection?.status !== "repairable" || !candidate) return;
    setCatalogRepairOperation("repair");
    setCatalogRepairError(null);
    try {
      const response = await api<{ result: VaultPluginCatalogRepairResult; jobId: string }>(
        "/vault/reconciliation/plugin-catalog/repair",
        {
          method: "POST",
          body: JSON.stringify({
            ...catalogRepairTarget,
            jobId: candidate.jobId,
            artifactFingerprint: candidate.artifactFingerprint
          })
        }
      );
      setCatalogRepairResult(response.result);
      notifyPortal(
        localize(
          t,
          `${response.result.pluginName} Catalog registration was repaired and verified.`,
          `${response.result.pluginName} Catalog 등록을 복구하고 재검증했습니다.`
        ),
        "success"
      );
      onRefresh();
    } catch (error) {
      setCatalogRepairError(error instanceof Error ? error.message : String(error));
    } finally {
      setCatalogRepairOperation(null);
    }
  }

  function moveCatalogRepairToUnmount(mountPath: string) {
    if (!catalogRepairTarget || catalogRepairOperation) return;
    const target = { ...catalogRepairTarget, mountPath };
    setCatalogRepairTarget(null);
    setCatalogRepairInspection(null);
    setCatalogRepairResult(null);
    setCatalogRepairError(null);
    openUnmountDialog(target);
  }

  async function removeManagedMount() {
    if (!unmountTarget || !unmountInspection?.fingerprint || !unmountConfirmationMatches) return;
    setUnmountOperation("remove");
    setUnmountError(null);
    try {
      const response = await api<{ result: VaultPluginMountRemovalResult }>("/vault/plugin-mounts/remove", {
        method: "POST",
        body: JSON.stringify({
          ...unmountTarget,
          confirmation: unmountConfirmation,
          expectedFingerprint: unmountInspection.fingerprint
        })
      });
      setUnmountResult(response.result);
      setUnmountInspection(null);
      setUnmountConfirmation("");
      notifyPortal(
        localize(
          t,
          `${response.result.mountPath}/ was unmounted and verified.`,
          `${response.result.mountPath}/ Mount 해제와 재확인을 완료했습니다.`
        ),
        "success"
      );
      onRefresh();
    } catch (error) {
      setUnmountInspection(null);
      setUnmountError(error instanceof Error ? error.message : String(error));
    } finally {
      setUnmountOperation(null);
    }
  }

  return (
    <div className="stack">
      <VaultLiveSync
        t={t}
        syncedAt={syncedAt}
        syncing={syncing}
        error={syncError}
        onRefresh={onRefresh}
      />
      <VaultInventoryWarnings t={t} warnings={inventory?.warnings ?? []} />
      <nav aria-label={localize(t, "Admin sections", "Admin 메뉴")} className="adminSectionTabs" role="tablist">
        {adminSections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              aria-controls={`admin-panel-${section.id}`}
              aria-selected={adminSection === section.id}
              className={adminSection === section.id ? "active" : ""}
              id={`admin-tab-${section.id}`}
              key={section.id}
              onClick={() => setAdminSection(section.id)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" size={16} />
              <span>{section.label}</span>
            </button>
          );
        })}
      </nav>
      {adminSection === "overview" ? (
        <div aria-labelledby="admin-tab-overview" className="adminSectionPanel" id="admin-panel-overview" role="tabpanel">
      <Table
        title={t.admin.health}
        columns={[t.table.mode, t.table.healthy, t.table.version, t.table.cluster]}
        rows={[
          [
            vaultHealth?.mode ?? t.admin.unknown,
            vaultHealth?.healthy === true ? t.admin.yes : vaultHealth?.healthy === false ? t.admin.no : t.admin.unknown,
            String(vaultHealth?.detail.version ?? "-"),
            String(vaultHealth?.detail.cluster_name ?? "-")
          ]
        ]}
        emptyLabel={t.table.noData}
      />
      <section className="summaryRail vaultInventorySummary" aria-label={localize(t, "Vault inventory summary", "Vault 인벤토리 요약")}>
        <MiniStat label={localize(t, "Actual mounts", "실제 Mount")} value={inventory?.summary.totalMounts ?? 0} tone="good" />
        <MiniStat label={localize(t, "Custom plugins", "Custom Plugin")} value={inventory?.summary.customPlugins ?? 0} />
        <MiniStat label={localize(t, "Mounted plugins", "Mount된 Plugin")} value={inventory?.summary.mountedCustomPlugins ?? 0} tone="good" />
        <MiniStat
          label={localize(t, "Catalog mismatch", "Catalog 불일치")}
          value={catalogMismatchCount}
          tone={catalogMismatchCount > 0 ? "risk" : "default"}
        />
      </section>
        </div>
      ) : null}
      {adminSection === "reconciliation" ? (
        <div aria-labelledby="admin-tab-reconciliation" className="adminSectionPanel" id="admin-panel-reconciliation" role="tabpanel">
          <VaultReconciliationCenter onResolvePlugin={openCatalogRepairDialog} report={reconciliation} t={t} />
        </div>
      ) : null}
      {adminSection === "plugins" ? (
        <div aria-labelledby="admin-tab-plugins" className="adminSectionPanel" id="admin-panel-plugins" role="tabpanel">
      <Table
        title={localize(t, "Actual Vault plugin catalog", "실제 Vault Plugin 카탈로그")}
        columns={[
          t.table.plugin,
          t.table.type,
          t.table.status,
          t.table.mount,
          t.table.version,
          localize(t, "Command", "Command")
        ]}
        rows={customPlugins.map((plugin) => [
          plugin.name,
          plugin.pluginType,
          plugin.status === "mounted"
            ? localize(t, "Mounted · Catalog OK", "Mount됨 · Catalog 정상")
            : plugin.status === "orphaned"
              ? localize(t, "Mounted · Catalog missing", "Mount됨 · Catalog 없음")
              : localize(t, "Catalog only", "Catalog 등록만"),
          plugin.mountedPaths.length > 0 ? plugin.mountedPaths.map((path) => `${path}/`).join(", ") : "-",
          plugin.version ?? "-",
          plugin.command ?? "-"
        ])}
        emptyLabel={localize(t, "No custom plugins are registered in the live Vault catalog.", "실제 Vault Catalog에 등록된 Custom Plugin이 없습니다.")}
      />
      <Table
        title={localize(t, "Actual Vault mounts", "실제 Vault Mount")}
        columns={[
          localize(t, "Path", "경로"),
          localize(t, "Category", "구분"),
          localize(t, "Type", "Type"),
          localize(t, "Source", "소스"),
          t.table.version,
          localize(t, "Action", "작업")
        ]}
        rows={(inventory?.mounts ?? []).map((mount) => {
          const target: ManagedVaultMountTarget = {
            pluginName: mount.type,
            pluginType: mount.catalogType ?? (mount.kind === "auth" ? "auth" : "secret"),
            mountPath: normalizeFactoryMountPath(mount.path)
          };
          return [
            `${mount.path}/`,
            mount.kind,
            mount.type,
            mount.source,
            mount.pluginVersion ?? "-",
            mount.source === "external" ? (
              <button
                className="tableMountAction"
                onClick={() => openUnmountDialog(target)}
                title={localize(t, `Unmount ${mount.path}/`, `${mount.path}/ Mount 해제`)}
                type="button"
              >
                <CircleStop aria-hidden="true" size={15} />
                {localize(t, "Unmount", "Mount 해제")}
              </button>
            ) : <span className="tableActionUnavailable">-</span>
          ];
        })}
        emptyLabel={localize(t, "No live Vault mount data.", "실제 Vault Mount 데이터가 없습니다.")}
      />
        </div>
      ) : null}
      {adminSection === "notifications" ? (
        <div aria-labelledby="admin-tab-notifications" className="adminSectionPanel" id="admin-panel-notifications" role="tabpanel">
      <section className="tablePanel">
        <h2>{localize(t, "Notification integrations", "Notification 연동")}</h2>
        <div className="notificationGrid">
          {["Slack", "Email", "Teams", "ServiceNow", "Jira"].map((channel) => (
            <div key={channel} className="notificationCard">
              <strong>{channel}</strong>
              <span>{localize(t, "mock enabled", "mock 활성화")}</span>
              <small>{localize(t, "Approval request, expiring soon, revoke failure", "승인 요청, 만료 임박, 폐기 실패")}</small>
            </div>
          ))}
        </div>
      </section>
        </div>
      ) : null}
      {adminSection === "mappings" ? (
        <div aria-labelledby="admin-tab-mappings" className="adminSectionPanel" id="admin-panel-mappings" role="tabpanel">
      <Table
        title={t.admin.mappings}
        columns={[t.table.system, t.table.namespace, t.table.mount, t.table.role, localize(t, "Policy", "Policy")]}
        rows={systems.flatMap((system) =>
          system.vaultMountMappings.map((mapping) => [
            system.name,
            system.vaultNamespace,
            mapping.mountPath,
            mapping.roleName,
            policyName({
              id: mapping.id,
              systemId: system.id,
              systemName: system.name,
              systemDescription: system.description,
              ownerGroup: system.ownerGroup,
              environment: system.environment,
              namespace: system.vaultNamespace,
              mountPath: mapping.mountPath,
              roleName: mapping.roleName,
              requestType: mapping.requestType,
              displayName: mapping.displayName,
              enabled: mapping.enabled
            })
          ])
        )}
        emptyLabel={t.table.noData}
      />
      <Table
        title={t.admin.inspection}
        columns={[t.table.system, t.table.type, t.table.mount, t.table.role, t.table.reachable]}
        rows={mappingHealth.map((mapping) => [
          mapping.systemName,
          mapping.requestType,
          mapping.mountPath,
          mapping.roleName,
          mapping.reachable ? t.admin.yes : `${t.admin.no} (${mapping.status})`
        ])}
        emptyLabel={t.table.noData}
      />
        </div>
      ) : null}
      {catalogRepairTarget ? (
        <PortalOverlay onDismiss={closeCatalogRepairDialog}>
          <section
            aria-busy={catalogRepairOperation !== null}
            aria-label={localize(t, "Resolve Vault mismatch", "Vault 불일치 해결")}
            aria-modal="true"
            className="impactDialog catalogRepairDialog"
            role="dialog"
          >
            <header>
              <div>
                <span>{localize(t, "Vault reconciliation", "Vault 상태 조정")}</span>
                <h2>{localize(t, "Resolve plugin mismatch", "Plugin 불일치 해결")}</h2>
              </div>
              <button
                aria-label={localize(t, "Close mismatch resolution", "불일치 해결 창 닫기")}
                className="iconButton"
                disabled={catalogRepairOperation !== null}
                onClick={closeCatalogRepairDialog}
                title={localize(t, "Close", "닫기")}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <div className="catalogRepairDialogBody">
              <div className="catalogRepairTarget">
                <span><Wrench aria-hidden="true" size={18} /></span>
                <div>
                  <strong>{catalogRepairTarget.pluginName}</strong>
                  <small>{catalogRepairTarget.pluginType} Plugin · Plugin Catalog</small>
                </div>
              </div>

              {catalogRepairOperation === "inspect" && !catalogRepairInspection ? (
                <div className="catalogRepairLoading" role="status">
                  <LoaderCircle aria-hidden="true" className="spinning" size={19} />
                  {localize(t, "Checking the live Catalog and approved artifacts", "실제 Catalog와 승인된 Artifact를 확인하는 중")}
                </div>
              ) : null}

              {catalogRepairResult ? (
                <section className="catalogRepairSuccess" role="status">
                  <header>
                    <CheckCircle2 aria-hidden="true" size={20} />
                    <div>
                      <strong>{localize(t, "Catalog mismatch resolved", "Catalog 불일치 해결 완료")}</strong>
                      <small>{localize(t, "Live Vault evidence was refreshed after registration.", "등록 후 실제 Vault 상태를 다시 동기화했습니다.")}</small>
                    </div>
                  </header>
                  <div className="catalogRepairSteps">
                    {catalogRepairResult.steps.map((step) => (
                      <div key={`${step.label}-${step.detail}`}>
                        <CheckCircle2 aria-hidden="true" size={16} />
                        <span>
                          <strong>{factoryResultStepLabel(step.label, t)}</strong>
                          <small>{factoryResultStepDetail(step.detail, t)}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {catalogRepairInspection?.status === "repairable" && catalogRepairInspection.candidate && !catalogRepairResult ? (
                <section className="catalogRepairPlan">
                  <header>
                    <span><BadgeCheck aria-hidden="true" size={18} /></span>
                    <div>
                      <strong>{localize(t, "Re-register with approved artifact", "승인된 Artifact로 Catalog 재등록")}</strong>
                      <small>{localize(t, "Recommended · Existing Mount remains active", "권장 · 기존 Mount는 그대로 유지")}</small>
                    </div>
                  </header>
                  <dl>
                    <dt>Mount</dt>
                    <dd>{catalogRepairInspection.mountedPaths.map((path) => `${path}/`).join(", ")}</dd>
                    <dt>{localize(t, "Version", "버전")}</dt>
                    <dd>{catalogRepairInspection.candidate.version}</dd>
                    <dt>Command</dt>
                    <dd>{catalogRepairInspection.candidate.command}</dd>
                    <dt>SHA-256</dt>
                    <dd title={catalogRepairInspection.candidate.artifactSha256}>{shortId(catalogRepairInspection.candidate.artifactSha256)}</dd>
                    <dt>Factory Job</dt>
                    <dd title={catalogRepairInspection.candidate.jobId}>{shortId(catalogRepairInspection.candidate.jobId)}</dd>
                    <dt>{localize(t, "Approved", "승인 시점")}</dt>
                    <dd>{formatDate(catalogRepairInspection.candidate.updatedAt)}</dd>
                  </dl>
                  <div className="catalogRepairSafety">
                    <ShieldCheck aria-hidden="true" size={17} />
                    <p>{localize(
                      t,
                      "The server rechecks the approval fingerprint, stored binary SHA-256, live Mount, and post-registration Catalog before completion.",
                      "서버가 승인 Fingerprint, 저장된 Binary SHA-256, 실제 Mount와 등록 후 Catalog를 다시 검증한 뒤 완료합니다."
                    )}</p>
                  </div>
                </section>
              ) : null}

              {catalogRepairInspection?.status === "artifact-required" && !catalogRepairResult ? (
                <section className="catalogRepairUnavailable">
                  <AlertTriangle aria-hidden="true" size={20} />
                  <div>
                    <strong>{localize(t, "Approved artifact required", "승인된 Artifact가 필요합니다")}</strong>
                    <p>{localize(
                      t,
                      "No verified Factory artifact matches this Plugin, version, and live Mount. Build and approve it before Catalog registration.",
                      "이 Plugin, 버전과 실제 Mount에 일치하는 검증된 Factory Artifact가 없습니다. Build와 승인을 완료한 뒤 Catalog를 등록할 수 있습니다."
                    )}</p>
                    <Link href={`/plugins?plugin=${encodeURIComponent(catalogRepairTarget.pluginName)}&repair=catalog`}>
                      <Sparkles aria-hidden="true" size={15} />
                      {localize(t, "Prepare artifact in Plugin Factory", "Plugin Factory에서 Artifact 준비")}
                    </Link>
                  </div>
                </section>
              ) : null}

              {catalogRepairInspection?.status === "resolved" && !catalogRepairResult ? (
                <section className="catalogRepairResolved" role="status">
                  <CheckCircle2 aria-hidden="true" size={20} />
                  <div>
                    <strong>{localize(t, "Already synchronized", "이미 동기화되었습니다")}</strong>
                    <p>{localize(t, "The live Plugin Catalog no longer has this mismatch.", "실제 Plugin Catalog에서 해당 불일치가 더 이상 확인되지 않습니다.")}</p>
                  </div>
                </section>
              ) : null}

              {catalogRepairInspection && catalogRepairInspection.status !== "resolved" && !catalogRepairResult && catalogRepairInspection.mountedPaths.length > 0 ? (
                <section className="catalogRepairAlternative">
                  <div>
                    <strong>{localize(t, "Unused plugin", "사용하지 않는 Plugin인가요?")}</strong>
                    <p>{localize(t, "Unmount instead of restoring the Catalog. Access through that path stops immediately.", "Catalog를 복구하지 않고 Mount를 해제할 수 있습니다. 해당 경로를 통한 접근은 즉시 중단됩니다.")}</p>
                  </div>
                  <div>
                    {catalogRepairInspection.mountedPaths.map((mountPath) => (
                      <button key={mountPath} onClick={() => moveCatalogRepairToUnmount(mountPath)} type="button">
                        <CircleStop aria-hidden="true" size={15} />
                        {mountPath}/ {localize(t, "Unmount", "Mount 해제")}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {catalogRepairError ? <div className="error" role="alert">{catalogRepairError}</div> : null}
            </div>

            <footer className="actions catalogRepairActions">
              <button disabled={catalogRepairOperation !== null} onClick={closeCatalogRepairDialog} type="button">
                {catalogRepairResult ? localize(t, "Close", "닫기") : localize(t, "Cancel", "취소")}
              </button>
              {!catalogRepairResult ? (
                <button
                  disabled={catalogRepairOperation !== null}
                  onClick={() => void inspectPluginCatalogRepair(catalogRepairTarget)}
                  type="button"
                >
                  {catalogRepairOperation === "inspect" ? <LoaderCircle aria-hidden="true" className="spinning" size={16} /> : <RefreshCw aria-hidden="true" size={16} />}
                  {localize(t, "Inspect again", "다시 확인")}
                </button>
              ) : null}
              {catalogRepairInspection?.status === "repairable" && catalogRepairInspection.candidate && !catalogRepairResult ? (
                <button
                  className="primary"
                  disabled={catalogRepairOperation !== null}
                  onClick={() => void repairPluginCatalog()}
                  type="button"
                >
                  {catalogRepairOperation === "repair" ? <LoaderCircle aria-hidden="true" className="spinning" size={16} /> : <Wrench aria-hidden="true" size={16} />}
                  {localize(t, "Repair Catalog", "Catalog 복구")}
                </button>
              ) : null}
            </footer>
          </section>
        </PortalOverlay>
      ) : null}
      {unmountTarget ? (
        <PortalOverlay onDismiss={closeUnmountDialog}>
          <section
            aria-busy={unmountOperation !== null}
            aria-label={localize(t, "Unmount Vault plugin", "Vault Plugin Mount 해제")}
            aria-modal="true"
            className="impactDialog vaultUnmountDialog"
            role="dialog"
          >
            <header>
              <div>
                <span>{localize(t, "Destructive Vault operation", "Vault 변경 작업")}</span>
                <h2>{localize(t, "Unmount custom plugin", "Custom Plugin Mount 해제")}</h2>
              </div>
              <button
                aria-label={localize(t, "Close unmount dialog", "Mount 해제 창 닫기")}
                className="iconButton"
                disabled={unmountOperation !== null}
                onClick={closeUnmountDialog}
                title={localize(t, "Close", "닫기")}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <div className="vaultUnmountDialogBody">
              <div className="vaultUnmountWarning">
                <AlertTriangle aria-hidden="true" size={19} />
                <div>
                  <strong>{localize(t, "Review the live Mount before continuing", "실제 Mount 정보를 확인한 뒤 진행하세요")}</strong>
                  <p>
                    {localize(
                      t,
                      "Unmounting stops access through this path and can affect leases or data managed by the engine. The Plugin Catalog entry is retained.",
                      "Mount를 해제하면 이 경로의 접근이 중단되고 엔진이 관리하는 Lease 또는 데이터에 영향을 줄 수 있습니다. Plugin Catalog 등록은 유지됩니다."
                    )}
                  </p>
                </div>
              </div>

              {unmountOperation === "inspect" && !unmountInspection ? (
                <div className="vaultUnmountLoading" role="status">
                  <LoaderCircle aria-hidden="true" className="spinning" size={19} />
                  {localize(t, "Inspecting the live Vault Mount", "실제 Vault Mount를 확인하는 중")}
                </div>
              ) : null}

              {unmountResult ? (
                <div className="vaultUnmountSuccess" role="status">
                  <div>
                    <CheckCircle2 aria-hidden="true" size={20} />
                    <span>
                      <strong>{localize(t, "Mount unmounted", "Mount 해제 완료")}</strong>
                      <small>{unmountResult.mountPath}/</small>
                    </span>
                  </div>
                  <div className="mountRemovalSteps">
                    {unmountResult.steps.map((step) => (
                      <div key={`${step.label}-${step.detail}`}>
                        <CheckCircle2 aria-hidden="true" size={17} />
                        <span>
                          <strong>{factoryResultStepLabel(step.label, t)}</strong>
                          <small>{factoryResultStepDetail(step.detail, t)}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {unmountInspection?.exists ? (
                <div className="mountInspectionBody">
                  <div className="mountIdentityGrid vaultUnmountIdentity">
                    <div><span>Plugin</span><strong title={unmountTarget.pluginName}>{unmountTarget.pluginName}</strong></div>
                    <div><span>{localize(t, "Mount path", "Mount 경로")}</span><strong title={`${unmountTarget.mountPath}/`}>{unmountTarget.mountPath}/</strong></div>
                    <div><span>{localize(t, "Plugin type", "Plugin 타입")}</span><strong>{unmountTarget.pluginType}</strong></div>
                    <div><span>{localize(t, "Version", "버전")}</span><strong>{unmountInspection.pluginVersion ?? "-"}</strong></div>
                    <div><span>Fingerprint</span><strong title={unmountInspection.fingerprint}>{shortId(unmountInspection.fingerprint ?? "")}</strong></div>
                  </div>
                  {unmountInspection.description ? <p className="mountDescription">{unmountInspection.description}</p> : null}
                  <label className="mountRemovalConfirm vaultUnmountConfirmation">
                    <span>
                      {localize(
                        t,
                        `Type ${unmountTarget.mountPath} to confirm`,
                        `확인하려면 ${unmountTarget.mountPath} 입력`
                      )}
                    </span>
                    <input
                      autoComplete="off"
                      disabled={unmountOperation !== null}
                      onChange={(event) => setUnmountConfirmation(event.target.value)}
                      placeholder={unmountTarget.mountPath}
                      spellCheck={false}
                      value={unmountConfirmation}
                    />
                    <small>{localize(t, "The current Fingerprint is checked again immediately before removal.", "실행 직전에 현재 Fingerprint를 다시 비교합니다.")}</small>
                  </label>
                </div>
              ) : null}

              {unmountInspection && !unmountInspection.exists ? (
                <div className="noticePanel compact">
                  {localize(t, "This Mount no longer exists. Refreshing the live inventory.", "이 Mount는 더 이상 존재하지 않습니다. 실제 인벤토리를 새로고침합니다.")}
                </div>
              ) : null}

              {unmountError ? <div className="error" role="alert">{unmountError}</div> : null}
            </div>

            <footer className="actions vaultUnmountActions">
              <button disabled={unmountOperation !== null} onClick={closeUnmountDialog} type="button">
                {unmountResult ? localize(t, "Close", "닫기") : localize(t, "Cancel", "취소")}
              </button>
              {!unmountResult ? (
                <button
                  disabled={unmountOperation !== null}
                  onClick={() => void inspectManagedMount(unmountTarget)}
                  type="button"
                >
                  {unmountOperation === "inspect" ? <LoaderCircle aria-hidden="true" className="spinning" size={16} /> : <RefreshCw aria-hidden="true" size={16} />}
                  {localize(t, "Inspect again", "다시 확인")}
                </button>
              ) : null}
              {unmountInspection?.exists && !unmountResult ? (
                <button
                  className="dangerButton"
                  disabled={!unmountConfirmationMatches || unmountOperation !== null}
                  onClick={() => void removeManagedMount()}
                  type="button"
                >
                  {unmountOperation === "remove" ? <LoaderCircle aria-hidden="true" className="spinning" size={16} /> : <CircleStop aria-hidden="true" size={16} />}
                  {localize(t, "Unmount", "Mount 해제")}
                </button>
              ) : null}
            </footer>
          </section>
        </PortalOverlay>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  href,
  tone = "default"
}: {
  label: string;
  value: number;
  detail?: string;
  href?: string;
  tone?: "default" | "risk";
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
      {href ? <ArrowRight aria-hidden="true" className="metricArrow" size={16} /> : null}
    </>
  );
  return href ? <Link className={`metric ${tone} actionable`} href={href}>{content}</Link> : <div className={`metric ${tone}`}>{content}</div>;
}

function MiniStat({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "risk";
}) {
  return (
    <div className={`miniStat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PostureRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(4, Math.round((value / max) * 100));
  return (
    <div className="postureRow">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="barTrack">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function tableCellBadgeKind(value: string): "status" | "risk" | undefined {
  if (["low", "medium", "high"].includes(value)) return "risk";
  if ([
    "active",
    "approved",
    "complete",
    "disabled",
    "executed",
    "expired",
    "failed",
    "failure",
    "healthy",
    "locked",
    "pending",
    "rejected",
    "revoke_failed",
    "revoked",
    "success",
    "warning"
  ].includes(value)) return "status";
  return undefined;
}

function Table({
  title,
  columns,
  rows,
  emptyLabel = "No data.",
  emptyAction
}: {
  title: string;
  columns: string[];
  rows: ReactNode[][];
  emptyLabel?: string;
  emptyAction?: { href: string; label: string };
}) {
  return (
    <section className="tablePanel">
      <div className="tablePanelHeader">
        <h2>{title}</h2>
        <span className="tableCount" aria-label={`${rows.length} rows`}>{rows.length.toLocaleString()}</span>
      </div>
      {rows.length === 0 ? (
        <div className={`empty compact${emptyAction ? " emptyWithAction" : ""}`}>
          <span>{emptyLabel}</span>
          {emptyAction ? <Link href={emptyAction.href}>{emptyAction.label}</Link> : null}
        </div>
      ) : (
        <div className="tableScroll">
          <table className="responsiveTable">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => {
                    const normalized = typeof cell === "string" ? cell.trim().toLowerCase() : "";
                    const badgeKind = tableCellBadgeKind(normalized);
                    return (
                      <td
                        className={typeof cell === "number" ? "numericCell" : badgeKind ? "statusCell" : undefined}
                        data-label={columns[cellIndex] ?? ""}
                        key={cellIndex}
                        title={typeof cell === "string" ? cell : undefined}
                      >
                        {badgeKind === "status" ? <span className={`statusBadge ${normalized}`}>{cell}</span> : null}
                        {badgeKind === "risk" ? <span className={`riskBadge ${normalized}`}>{cell}</span> : null}
                        {!badgeKind ? cell : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type RiskLevel = "low" | "medium" | "high";
type RiskScore = {
  level: RiskLevel;
  score: number;
  reasons: string[];
};
type LifecycleStep = {
  label: string;
  detail: string;
  state: "done" | "current" | "blocked" | "future";
};

function filterLabel(filter: PluginFilter, t: Copy): string {
  switch (filter) {
    case "all":
      return localize(t, "All", "전체");
    case "auth":
      return "Auth";
    case "secret":
      return localize(t, "Secret", "Secret");
    case "database":
      return localize(t, "Database", "Database");
    case "partner":
      return localize(t, "Partner", "파트너");
    case "community":
      return localize(t, "Community", "커뮤니티");
    case "learning":
      return localize(t, "Learning", "학습용");
  }
}

function filterForTemplate(template: VaultPluginTemplate): PluginFilter {
  if (template.source === "learning" || template.source === "community" || template.source === "partner") {
    return template.source;
  }
  return template.pluginType;
}

function templateMatchesFilter(template: VaultPluginTemplate, filter: PluginFilter): boolean {
  if (filter === "all") return true;
  if (filter === "partner" || filter === "community" || filter === "learning") return template.source === filter;
  return template.pluginType === filter;
}

function fileDiffSummary(original: string, edited: string): { added: number; removed: number; changed: boolean } {
  if (original === edited) return { added: 0, removed: 0, changed: false };
  const before = original.split("\n");
  const after = edited.split("\n");
  const remaining = new Map<string, number>();
  before.forEach((line) => remaining.set(line, (remaining.get(line) ?? 0) + 1));
  let sharedLines = 0;
  after.forEach((line) => {
    const matches = remaining.get(line) ?? 0;
    if (matches > 0) {
      sharedLines += 1;
      remaining.set(line, matches - 1);
    }
  });
  return {
    added: after.length - sharedLines,
    removed: before.length - sharedLines,
    changed: true
  };
}

function fileEditorModeLabel(mode: FileEditorMode, t: Copy): string {
  const labels: Record<FileEditorMode, [string, string]> = {
    preview: ["Preview", "미리보기"],
    edit: ["Edit", "편집"],
    diff: ["Diff", "변경 비교"]
  };
  return localize(t, labels[mode][0], labels[mode][1]);
}

function factoryActionLabel(action: string, t: Copy): string {
  const labels: Record<string, [string, string]> = {
    generate: ["Generate scaffold", "스캐폴드 생성"],
    "request-approval": ["Request approval", "승인 요청"],
    approve: ["Approve deployment", "배포 승인"],
    reject: ["Reject deployment", "배포 반려"],
    schedule: ["Schedule deployment", "배포 예약"],
    canary: ["Select canary rollout", "카나리 배포 선택"],
    full: ["Select full rollout", "전체 배포 선택"],
    retry: ["Retry job", "작업 재시도"],
    cancel: ["Cancel job", "작업 취소"],
    apply: ["Apply to Vault", "Vault 적용"],
    "apply-complete": ["Vault apply complete", "Vault 적용 완료"],
    rollback: ["Rollback", "롤백"],
    "approval-invalidated": ["Approval invalidated", "승인 무효화"]
  };
  const label = labels[action];
  return label ? localize(t, label[0], label[1]) : action;
}

function factoryLocalize(t: Copy, en: string, ko: string): string {
  return t === copy.ko ? ko : en;
}

function factoryRequirementQuestions(t: Copy, template?: VaultPluginTemplate): FactoryRequirementQuestion[] {
  const targetSuggestions = template?.integrationTarget ? [template.integrationTarget] : [];
  return [
    {
      field: "targetSystem",
      label: factoryLocalize(t, "Target system", "대상 시스템"),
      shortLabel: factoryLocalize(t, "System", "시스템"),
      question: factoryLocalize(t, "Which external system will this plugin connect to?", "플러그인이 연결할 외부 시스템은 무엇인가요?"),
      detail: factoryLocalize(t, "Enter the product or service name only, without any secret value.", "제품 또는 서비스 이름만 입력하고 Secret 값은 입력하지 마세요."),
      placeholder: factoryLocalize(t, "e.g. Sectigo SCM", "예: Sectigo SCM"),
      suggestions: targetSuggestions
    },
    {
      field: "authMethod",
      label: factoryLocalize(t, "Authentication", "인증 방식"),
      shortLabel: factoryLocalize(t, "Auth", "인증"),
      question: factoryLocalize(t, "How should the plugin authenticate to the upstream API?", "외부 API에는 어떤 방식으로 인증하나요?"),
      detail: factoryLocalize(t, "Describe the credential type and storage method. Never enter an actual token or password.", "Credential 유형과 저장 방식을 설명하고 실제 Token이나 Password는 입력하지 마세요."),
      placeholder: factoryLocalize(t, "e.g. API key in sealed configuration", "예: Seal-wrap 설정의 API Key"),
      suggestions: ["API Key", "OAuth 2.0 Client Credentials", "mTLS"]
    },
    {
      field: "apiBasePath",
      label: factoryLocalize(t, "API path", "API 경로"),
      shortLabel: "API",
      question: factoryLocalize(t, "What API base URL should the plugin call?", "호출할 API Base URL은 무엇인가요?"),
      detail: factoryLocalize(t, "Include the scheme, host, and version prefix used by the integration.", "연동에 사용할 Scheme, Host와 Version Prefix까지 입력하세요."),
      placeholder: "https://service.example/v1",
      suggestions: []
    },
    {
      field: "ttl",
      label: "TTL",
      shortLabel: "TTL",
      question: factoryLocalize(t, "How long should issued credentials remain valid?", "발급된 Credential은 얼마 동안 유효해야 하나요?"),
      detail: factoryLocalize(t, "Use a duration supported by Vault, such as 15m, 1h, or 24h.", "15m, 1h, 24h처럼 Vault에서 사용하는 Duration 형식으로 입력하세요."),
      placeholder: "15m",
      suggestions: ["15m", "1h", "24h"]
    },
    {
      field: "rotationStrategy",
      label: "Rotation",
      shortLabel: "Rotation",
      question: factoryLocalize(t, "When and how should credentials be rotated?", "Credential은 언제, 어떤 방식으로 교체해야 하나요?"),
      detail: factoryLocalize(t, "Define the regular schedule and whether operators can rotate on demand.", "정기 교체 주기와 운영자의 요청 시 교체 가능 여부를 함께 정하세요."),
      placeholder: factoryLocalize(t, "e.g. Every 30 days and on demand", "예: 30일 주기 및 요청 시 교체"),
      suggestions: [
        factoryLocalize(t, "Every 30 days and on demand", "30일 주기 및 요청 시 교체"),
        factoryLocalize(t, "Every 90 days and on demand", "90일 주기 및 요청 시 교체")
      ]
    },
    {
      field: "revokeStrategy",
      label: "Revoke",
      shortLabel: "Revoke",
      question: factoryLocalize(t, "What should happen when Vault revokes the credential?", "Vault에서 Credential을 폐기하면 외부 시스템에는 어떤 처리가 필요하나요?"),
      detail: factoryLocalize(t, "Describe the upstream disable or delete action and its timing.", "외부 시스템의 비활성화 또는 삭제 동작과 실행 시점을 정하세요."),
      placeholder: factoryLocalize(t, "e.g. Revoke upstream credential immediately", "예: 외부 시스템 Credential 즉시 폐기"),
      suggestions: [
        factoryLocalize(t, "Revoke upstream credential immediately", "외부 시스템 Credential 즉시 폐기"),
        factoryLocalize(t, "Disable immediately, delete after lease expiry", "즉시 비활성화 후 Lease 만료 시 삭제")
      ]
    },
    {
      field: "mountPath",
      label: factoryLocalize(t, "Mount path", "Mount 경로"),
      shortLabel: "Mount",
      question: factoryLocalize(t, "Which Vault mount path should enable this plugin?", "이 Plugin을 활성화할 Vault Mount 경로는 무엇인가요?"),
      detail: factoryLocalize(t, "Use a unique path without a leading or trailing slash.", "앞뒤의 /를 제외하고 다른 Mount와 겹치지 않는 경로를 입력하세요."),
      placeholder: factoryLocalize(t, "e.g. team/sectigo-pki", "예: team/sectigo-pki"),
      suggestions: []
    }
  ];
}

function factoryBuildPhaseLabel(phase: NonNullable<VaultPluginAutoRepairResult["phase"]>, t: Copy): string {
  const labels: Record<NonNullable<VaultPluginAutoRepairResult["phase"]>, [string, string]> = {
    queued: ["Waiting for an isolated runner", "격리 실행 환경 대기 중"],
    preparing: ["Preparing source and dependencies", "소스와 의존성 준비 중"],
    building: ["Compiling and running tests", "컴파일 및 테스트 실행 중"],
    verifying: ["Verifying the ARM64 artifact", "ARM64 아티팩트 검증 중"],
    repairing: ["Analyzing errors and repairing code", "오류 분석 및 코드 자동 수정 중"],
    complete: ["Build verification complete", "빌드 검증 완료"],
    cancelled: ["Build cancelled safely", "빌드가 안전하게 취소됨"]
  };
  return factoryLocalize(t, labels[phase][0], labels[phase][1]);
}

function factoryAutoRepairProgress(result: VaultPluginAutoRepairResult): number {
  if (result.status === "pass" || result.status === "failed" || result.status === "cancelled") return 100;
  switch (result.phase) {
    case "preparing":
      return 28;
    case "building":
      return 58;
    case "verifying":
      return 84;
    case "repairing":
      return 68;
    default:
      return 12;
  }
}

function formatElapsedDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function factoryStatusLabel(status: string, t: Copy): string {
  const labels: Record<string, [string, string]> = {
    approved: ["Approved", "승인됨"],
    blocked: ["Blocked", "차단됨"],
    cancelled: ["Cancelled", "취소됨"],
    complete: ["Complete", "완료"],
    draft: ["Draft", "초안"],
    fail: ["Failed", "실패"],
    failed: ["Failed", "실패"],
    high: ["High", "높음"],
    low: ["Low", "낮음"],
    medium: ["Medium", "보통"],
    "needs-review": ["Needs review", "검토 필요"],
    "not-requested": ["Not requested", "요청 전"],
    pass: ["Passed", "통과"],
    pending: ["Pending", "대기"],
    planned: ["Planned", "예정"],
    ready: ["Ready", "준비 완료"],
    rejected: ["Rejected", "반려됨"],
    requested: ["Requested", "승인 요청됨"],
    "rolled-back": ["Rolled back", "롤백됨"],
    running: ["Running", "진행 중"],
    scheduled: ["Scheduled", "예약됨"],
    skipped: ["Skipped", "건너뜀"],
    success: ["Success", "성공"],
    warn: ["Needs review", "검토 필요"],
    warning: ["Warning", "주의"],
    "waiting-approval": ["Waiting approval", "승인 대기"]
  };
  const label = labels[status];
  return label ? factoryLocalize(t, label[0], label[1]) : status;
}

function factoryModeLabel(mode: string, t: Copy): string {
  const labels: Record<string, [string, string]> = {
    "dry-run": ["Dry-run", "Dry-run"],
    mock: ["Mock", "Mock"],
    real: ["Real Vault", "실제 Vault"]
  };
  const label = labels[mode];
  return label ? factoryLocalize(t, label[0], label[1]) : mode;
}

function factoryGeneratedDisplay(generated: VaultPluginGenerateResult, t: Copy) {
  const korean = t === copy.ko;
  const buildStepLabels: Record<string, string> = {
    "Source package": "소스 패키지",
    "Go formatting": "Go 포맷 정리",
    "Dependency tidy": "의존성 정리",
    "Unit tests": "단위 테스트",
    "Plugin binary": "플러그인 바이너리",
    "ARM64 plugin binary": "ARM64 플러그인 바이너리",
    "Binary checksum": "바이너리 Checksum"
  };
  const buildStepDetails: Record<string, string> = {
    "Waiting for the isolated CodeBuild runner.": "격리 CodeBuild Runner 실행을 기다리고 있습니다.",
    "Generated unit tests have not run yet.": "생성된 단위 테스트가 아직 실행되지 않았습니다.",
    "Run this against the compiled binary before real Vault registration.": "실제 Vault 등록 전에 컴파일된 바이너리의 Checksum을 검증합니다.",
    "Formatting ran inside the isolated CodeBuild worker.": "격리 CodeBuild Worker에서 포맷 정리를 실행했습니다.",
    "Dependencies are resolved without Vault runtime credentials.": "Vault Runtime Credential 없이 의존성을 확인했습니다.",
    "Waiting for the isolated test runner.": "격리 테스트 Runner 실행을 기다리고 있습니다.",
    "No deployable binary is available yet.": "아직 배포 가능한 바이너리가 없습니다.",
    "Module file is generated with Vault API and SDK dependencies.": "Vault API 및 SDK 의존성이 포함된 Module 파일을 생성했습니다.",
    "Generated backend compiles against the logical framework scaffold.": "생성된 Backend를 Logical Framework Scaffold 기준으로 컴파일했습니다."
  };
  const buildSteps = generated.buildTest.steps.map((step) => {
    if (!korean) return step;
    let detail = buildStepDetails[step.detail] ?? step.detail;
    if (step.detail === `${generated.files.length} generated files will be compiled for linux/arm64.`) {
      detail = `생성 파일 ${generated.files.length}개를 linux/arm64 대상으로 컴파일합니다.`;
    } else if (step.detail === `${generated.files.length} files were packaged for an isolated build.`) {
      detail = `생성 파일 ${generated.files.length}개를 격리 빌드용으로 패키징했습니다.`;
    } else if (step.detail === `${generated.files.length} generated files are included in the build plan.`) {
      detail = `생성 파일 ${generated.files.length}개가 빌드 계획에 포함되었습니다.`;
    } else if (step.detail.startsWith("Binary SHA256 ")) {
      detail = `바이너리 SHA-256 ${step.detail.slice("Binary SHA256 ".length)}`;
    }
    return {
      ...step,
      label: buildStepLabels[step.label] ?? step.label,
      detail
    };
  });
  const pluginTypeLabel = generated.template.pluginType === "auth"
    ? "Auth"
    : generated.template.pluginType === "database"
      ? "Database"
      : "Secret";
  const koreanApplyPlan = [
    "Vault 상태, plugin_directory, api_addr 및 최소 권한 Plugin AppRole을 확인합니다.",
    "확정된 명세를 격리 Factory CodeBuild Runner에서 컴파일하고 테스트합니다.",
    `dist/${generated.command} 바이너리를 모든 Vault 노드의 plugin_directory에 복사합니다.`,
    `${generated.pluginName}: 바이너리 SHA-256을 사용해 ${pluginTypeLabel} Plugin Catalog에 등록합니다.`,
    `${generated.pluginName}: 등록 버전 ${generated.version}으로 ${generated.mountPath}/ 경로에 활성화합니다.`,
    "Mount/Read Smoke Test를 실행하고 Plugin 버전과 실행 중인 SHA-256을 기록합니다."
  ];
  const applyPlan = korean
    ? generated.applyPlan.map((step, index) => koreanApplyPlan[index] ?? step)
    : generated.applyPlan;
  const koreanWarnings = [
    "Scaffold SHA는 생성 소스 검토용입니다. 실제 Vault 등록에는 컴파일된 바이너리 SHA-256이 필요합니다.",
    "Mock 모드 적용은 안전하게 시뮬레이션됩니다. 실제 모드에서는 Vault plugin_directory에 바이너리가 먼저 배치되어야 합니다.",
    generated.template.pluginType === "auth"
      ? "Auth Plugin을 적용하려면 sys/auth에 대한 sudo 권한이 필요하며 승인 절차를 거쳐야 합니다."
      : "Secret 및 Database Plugin을 적용하려면 sys/mounts에 대한 create/update 권한과 Catalog 등록 권한이 필요합니다."
  ];
  const warnings = korean
    ? generated.warnings.map((warning, index) => koreanWarnings[index] ?? warning)
    : generated.warnings;
  const koreanDryRunChanges = [
    { before: "Vault 상태 미확인", after: "정상 Vault Cluster 필요" },
    { before: "Factory에서 등록하지 않은 Plugin", after: `${generated.command}를 ${generated.version}, 컴파일 바이너리 SHA-256으로 등록` },
    { before: `${generated.mountPath}/는 현재 Factory 작업에서 관리되지 않음`, after: `${generated.mountPath}/에 ${generated.pluginName} 활성화` },
    { before: "Mount 상태 미확인", after: `running_plugin_version이 ${generated.version}과 일치해야 함` }
  ];
  const dryRunChanges = generated.dryRun.changes.map((change, index) => {
    const localizedChange = korean ? koreanDryRunChanges[index] : undefined;
    return {
      ...change,
      actionLabel: factoryDryRunActionLabel(change.action, t),
      riskLabel: factoryStatusLabel(change.risk, t),
      before: localizedChange?.before ?? change.before,
      after: localizedChange?.after ?? change.after
    };
  });
  const sourceSafetyItems = generated.dryRun.collisions.concat(generated.dryRun.approvals);
  const koreanSafetyItems = [
    `${generated.mountPath}/ 경로에 다른 Plugin 유형이 이미 있으면 적용을 차단합니다.`,
    `${generated.pluginName} Catalog 항목의 command 또는 SHA-256이 다르면 적용을 차단합니다.`,
    "모든 적용 작업에는 vault-admin 역할이 필요합니다.",
    generated.template.pluginType === "auth"
      ? "Auth Method 활성화 전 Security Approver 승인이 필요합니다."
      : "운영 Mount 생성 전 Service Owner 승인이 필요합니다."
  ];
  const safetyItems = korean
    ? sourceSafetyItems.map((item, index) => koreanSafetyItems[index] ?? item)
    : sourceSafetyItems;

  return {
    applyPlan,
    buildSteps,
    dryRunChanges,
    dryRunSummary: korean
      ? `Dry-run에서 ${generated.pluginName} 등록, ${generated.mountPath}/ 활성화, 승격 전 실행 버전 검증을 수행합니다.`
      : generated.dryRun.summary,
    safetyItems,
    warnings
  };
}

function factoryDryRunActionLabel(action: string, t: Copy): string {
  const labels: Record<string, [string, string]> = {
    create: ["Create", "생성"],
    skip: ["Skip", "건너뜀"],
    update: ["Update", "수정"],
    verify: ["Verify", "검증"]
  };
  const label = labels[action];
  return label ? factoryLocalize(t, label[0], label[1]) : action;
}

function factoryResultStepLabel(label: string, t: Copy): string {
  const labels: Record<string, string> = {
    "Catalog registration": "Catalog 등록",
    "Catalog verification": "Catalog 검증",
    "Disable mount": "Mount 비활성화",
    "Disable existing mount": "기존 Mount 비활성화",
    "Enable mount": "Mount 활성화",
    "Remove catalog entry": "Catalog 항목 제거",
    "Smoke test": "Smoke Test",
    "Verify mount list": "Mount 목록 확인",
    "Verify mount removal": "Mount 삭제 확인"
  };
  return t === copy.ko ? labels[label] ?? label : label;
}

function factoryResultStepDetail(detail: string, t: Copy): string {
  if (t !== copy.ko) return detail;
  if (detail === "Verified the registered command and SHA-256") return "등록된 Command와 SHA-256을 확인했습니다.";
  if (detail === "Verified the existing command and SHA-256") return "기존 Command와 SHA-256이 승인된 Artifact와 일치합니다.";
  if (detail.endsWith("already matches the approved artifact")) {
    return detail.replace("already matches the approved artifact", "항목이 승인된 Artifact와 이미 일치합니다");
  }
  const mockRegistered = detail.match(/^Mock registered (.+) as (.+)$/);
  if (mockRegistered) return `Mock 등록: ${mockRegistered[1]} (${mockRegistered[2]})`;
  const mockEnabled = detail.match(/^Mock enabled (.+)$/);
  if (mockEnabled) return `Mock 활성화: ${mockEnabled[1]}`;
  const mockDisabled = detail.match(/^Mock disabled (.+)$/);
  if (mockDisabled) return `Mock 비활성화: ${mockDisabled[1]}`;
  const mockRemoved = detail.match(/^Mock removed (.+)$/);
  if (mockRemoved) return `Mock Catalog 제거: ${mockRemoved[1]}`;
  const returned = detail.match(/^(.*) returned (\d+)$/);
  if (returned) return `${returned[1]} 응답 코드 ${returned[2]}`;
  const verified = detail.match(/^Verified via (.+)$/);
  if (verified) return `${verified[1]}에서 확인했습니다.`;
  const mockVerifiedAbsent = detail.match(/^Mock verified (.+) is absent$/);
  if (mockVerifiedAbsent) return `Mock 확인: ${mockVerifiedAbsent[1]}가 없습니다.`;
  if (detail === "Run against a real Vault dev server before production promotion") {
    return "운영 승격 전 실제 Vault Dev Server에서 실행합니다.";
  }
  if (detail === "Catalog entry retained") return "Catalog 항목을 유지했습니다.";
  return detail;
}

function normalizeFactoryMountPath(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function resolveFactoryWorkspaceBuild(snapshot: FactoryWorkspaceSnapshot): {
  generated: VaultPluginGenerateResult | null;
  files: VaultPluginGeneratedFile[];
  artifactSha256: string;
  autoRepair: VaultPluginAutoRepairResult | null;
} {
  const autoRepair = snapshot.autoRepair ?? null;
  const originalGenerated = snapshot.generated ?? null;
  const completedRepair = Boolean(autoRepair && autoRepair.status !== "running");
  const generated = originalGenerated && autoRepair && completedRepair
    ? {
        ...originalGenerated,
        files: autoRepair.files,
        scaffoldSha256: autoRepair.scaffoldSha256,
        buildTest: autoRepair.buildTest,
        securityReview: autoRepair.securityReview,
        buildArtifact: autoRepair.artifact ?? originalGenerated.buildArtifact
      }
    : originalGenerated;
  const repairArtifactSha = autoRepair?.artifact?.sha256 ?? "";
  const snapshotNeedsRepair = Boolean(
    autoRepair?.status === "pass" &&
      repairArtifactSha &&
      (!snapshot.artifactSha256 ||
        snapshot.generated?.buildArtifact?.sha256 !== repairArtifactSha ||
        snapshot.generated?.buildTest.status !== autoRepair.buildTest.status)
  );
  const files = snapshotNeedsRepair
    ? autoRepair?.files ?? generated?.files ?? []
    : snapshot.draftFiles?.length
      ? snapshot.draftFiles
      : generated?.files ?? [];
  return {
    generated,
    files,
    artifactSha256:
      snapshot.artifactSha256?.trim() || generated?.buildArtifact?.sha256 || repairArtifactSha,
    autoRepair
  };
}

function factoryBuildFilesMatch(
  currentFiles: VaultPluginGeneratedFile[],
  builtFiles: VaultPluginGeneratedFile[]
): boolean {
  if (!currentFiles.length || currentFiles.length !== builtFiles.length) return false;
  const current = [...currentFiles].sort((left, right) => left.path.localeCompare(right.path));
  const built = [...builtFiles].sort((left, right) => left.path.localeCompare(right.path));
  return current.every((file, index) => file.path === built[index]?.path && file.content === built[index]?.content);
}

function factoryMountConflictPath(job: VaultPluginFactoryJob): string | null {
  for (const event of [...job.events].reverse()) {
    if (event.label === "mount-removed" || event.label === "apply-complete" || event.label === "rollback") return null;
    if (event.label !== "apply-failed") continue;
    const match = /Vault mount ([^\s]+) already exists/i.exec(event.detail);
    if (match?.[1]) return normalizeFactoryMountPath(match[1]);
  }
  return null;
}

function factoryRollbackSummary(generated: VaultPluginGenerateResult, t: Copy): string {
  return factoryLocalize(
    t,
    generated.rollbackPlan.summary,
    `Traffic Drain 후 ${generated.mountPath}/를 비활성화하고 선택에 따라 Plugin Catalog에서 ${generated.pluginName} ${generated.version}을 제거합니다.`
  );
}

function factoryRoleHome(
  user: PortalUser | null,
  jobs: VaultPluginFactoryJob[],
  generated: VaultPluginGenerateResult | null,
  favoriteCount: number,
  t: Copy
): { eyebrow: string; title: string; detail: string; metricLabel: string; metricValue: number; action: string; tab: FactoryTab } {
  const ownJobs = jobs.filter((job) => job.ownerId === user?.id);
  const approvalQueue = jobs.filter((job) => job.approval.status === "requested");

  if (user?.roles.includes("vault-admin")) {
    const hasDeploymentWork = approvalQueue.length > 0 || Boolean(generated);
    return {
      eyebrow: localize(t, "Vault administrator", "Vault 관리자"),
      title: hasDeploymentWork
        ? localize(t, "Review the release gate", "배포 게이트를 검토하세요")
        : localize(t, "Review Factory activity", "Factory 작업 이력을 확인하세요"),
      detail: hasDeploymentWork
        ? localize(t, "Confirm security evidence, approval, rollout mode, and rollback readiness before apply.", "적용 전 보안 근거, 승인, 배포 방식과 롤백 준비 상태를 확인합니다.")
        : localize(t, "Open saved jobs to inspect prior decisions and deployment events.", "저장된 작업에서 이전 결정과 배포 이벤트를 확인합니다."),
      metricLabel: localize(t, "Awaiting approval", "승인 대기"),
      metricValue: approvalQueue.length,
      action: hasDeploymentWork ? localize(t, "Open deployment review", "배포 검토 열기") : localize(t, "Open history", "이력 열기"),
      tab: hasDeploymentWork ? "deploy" : "history"
    };
  }

  if (user?.roles.includes("security-approver")) {
    const hasApprovalWork = approvalQueue.length > 0;
    return {
      eyebrow: localize(t, "Security approver", "보안 승인자"),
      title: hasApprovalWork
        ? localize(t, "Decide with evidence", "근거를 보고 승인하세요")
        : localize(t, "Review prior decisions", "이전 승인 이력을 확인하세요"),
      detail: hasApprovalWork
        ? localize(t, "Use the build, security, checksum, and impact summary together before making a decision.", "빌드, 보안, 체크섬과 영향도 요약을 함께 확인한 뒤 결정합니다.")
        : localize(t, "There are no pending requests. Saved jobs remain available in history.", "대기 중인 요청이 없습니다. 저장된 작업은 이력에서 확인할 수 있습니다."),
      metricLabel: localize(t, "Review queue", "검토 대기"),
      metricValue: approvalQueue.length,
      action: hasApprovalWork ? localize(t, "Review requests", "요청 검토") : localize(t, "Open history", "이력 열기"),
      tab: hasApprovalWork ? "deploy" : "history"
    };
  }

  if (user?.roles.includes("auditor")) {
    return {
      eyebrow: localize(t, "Auditor", "감사자"),
      title: localize(t, "Trace every Factory decision", "Factory 결정 이력을 추적하세요"),
      detail: localize(t, "Inspect preserved workspace snapshots, approvals, deployments, and rollback events.", "보존된 작업 스냅샷과 승인, 배포, 롤백 이벤트를 확인합니다."),
      metricLabel: localize(t, "Recorded jobs", "기록된 작업"),
      metricValue: jobs.length,
      action: localize(t, "Open history", "이력 열기"),
      tab: "history"
    };
  }

  return {
    eyebrow: localize(t, "Plugin author", "플러그인 작성자"),
    title: generated
      ? localize(t, "Continue your plugin workspace", "플러그인 작업을 이어가세요")
      : localize(t, "Find the right starting point", "알맞은 시작점을 찾아보세요"),
    detail: localize(t, "Search trusted templates, describe the integration in chat, and iterate on generated files.", "신뢰 정보를 갖춘 템플릿을 찾고, 채팅으로 연동 요구사항을 설명한 뒤 생성 파일을 다듬습니다."),
    metricLabel: localize(t, "My drafts", "내 초안"),
    metricValue: ownJobs.length || favoriteCount,
    action: generated ? localize(t, "Continue editing", "편집 계속") : localize(t, "Explore templates", "템플릿 탐색"),
    tab: generated ? "files" : "discover"
  };
}

function pluginTypeLabel(pluginType: VaultPluginType, t: Copy): string {
  switch (pluginType) {
    case "auth":
      return "Auth";
    case "secret":
      return localize(t, "Secret engine", "Secret engine");
    case "database":
      return localize(t, "Database", "Database");
  }
}

function sourceLabel(source: VaultPluginTemplate["source"], t: Copy): string {
  switch (source) {
    case "official":
      return localize(t, "Official", "공식");
    case "partner":
      return localize(t, "Partner", "파트너");
    case "learning":
      return localize(t, "Learning", "학습용");
    case "community":
      return localize(t, "Community", "커뮤니티");
  }
}

function normalizeFactoryPrompt(prompt: string): string {
  const normalized = prompt.toLowerCase();
  const synonyms: Array<[string, string]> = [
    ["카프카", "kafka"],
    ["컨플루언트", "confluent"],
    ["쿠버네티스", "kubernetes"],
    ["쿠버", "kubernetes"],
    ["레디스", "redis"],
    ["오라클", "oracle"],
    ["스노우플레이크", "snowflake"],
    ["몽고", "mongo"],
    ["미니오", "minio"],
    ["베나피", "venafi"],
    ["슬랙", "slack"],
    ["스파이어", "spire"],
    ["엘라스틱", "elasticsearch"],
    ["지씨피", "gcp"],
    ["구글", "gcp"],
    ["애저", "azure"],
    ["에이디", "ad"],
    ["엘디에이피", "ldap"],
    ["깃허브", "github"],
    ["퍼스널 액세스 토큰", "personal access token"],
    ["로테이션", "rotation"],
    ["섹티고", "sectigo"],
    ["디지서트", "digicert"],
    ["원패스워드", "onepassword"],
    ["원 패스워드", "onepassword"],
    ["키클록", "keycloak"],
    ["넷박스", "netbox"],
    ["넥서스", "nexus"],
    ["그라파나", "grafana"],
    ["오픈에이아이", "openai"],
    ["세일즈포스", "salesforce"],
    ["솔라스", "solace"],
    ["프록스목스", "proxmox"],
    ["스플렁크", "splunk"],
    ["아르고시디", "argocd"],
    ["아르고", "argocd"],
    ["도커허브", "dockerhub"],
    ["도커 허브", "dockerhub"],
    ["테일스케일", "tailscale"],
    ["데이터독", "datadog"],
    ["아이비엠 클라우드", "ibmcloud"],
    ["오리 인증", "ory"],
    ["클릭하우스", "clickhouse"],
    ["큐드란트", "qdrant"],
    ["클라우드플레어", "cloudflare"],
    ["오픈스택", "openstack"],
    ["셰프", "chef"],
    ["브이스피어", "vsphere"],
    ["에어로스파이크", "aerospike"],
    ["아랑고디비", "arangodb"],
    ["이벤트스토어", "eventstoredb"]
  ];
  return synonyms.reduce((value, [source, target]) => value.replaceAll(source, target), normalized);
}

function findTemplateFromPrompt(prompt: string, templates: VaultPluginTemplate[]): VaultPluginTemplate | null {
  const normalized = normalizeFactoryPrompt(prompt);
  const ignore = new Set([
    "plugin",
    "plugins",
    "vault",
    "make",
    "create",
    "generate",
    "scaffold",
    "apply",
    "enable",
    "register",
    "please",
    "플러그인",
    "만들어줘",
    "만들어",
    "생성",
    "제작",
    "적용",
    "등록",
    "활성",
    "해줘"
  ]);
  const tokens = normalized
    .split(/[^a-z0-9가-힣]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !ignore.has(token));

  let best: { template: VaultPluginTemplate; score: number } | null = null;
  for (const template of templates) {
    const targetPhrase = template.integrationTarget.toLowerCase().replace(/[-_]+/g, " ");
    const haystack = [
      template.name,
      template.displayName,
      template.description,
      template.integrationTarget,
      template.repository,
      template.tags.join(" ")
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    if (normalized.includes(template.name.toLowerCase())) score += 80;
    if (normalized.includes(template.integrationTarget.toLowerCase())) score += 35;
    if (targetPhrase !== template.integrationTarget.toLowerCase() && normalized.includes(targetPhrase)) score += 55;
    for (const token of tokens) {
      if (template.integrationTarget.toLowerCase() === token) score += 30;
      else if (template.name.toLowerCase().includes(token)) score += 18;
      else if (haystack.includes(token)) score += 8;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { template, score };
    }
  }
  return best && best.score >= 8 ? best.template : null;
}

function pluginCatalogSummary(templates: VaultPluginTemplate[], t: Copy, filter: PluginFilter = "all"): string {
  const selected = templates.filter((template) => templateMatchesFilter(template, filter));
  const groups = (["auth", "secret", "database"] as VaultPluginType[])
    .map((pluginType) => ({ pluginType, templates: selected.filter((template) => template.pluginType === pluginType) }))
    .filter((group) => group.templates.length > 0);
  const heading = localize(
    t,
    `I can currently make ${selected.length} ${filter === "all" ? "plugin" : filter} templates. Here is the complete list:`,
    `현재 만들 수 있는 ${filter === "all" ? "전체 플러그인" : filter} 템플릿은 ${selected.length}개입니다. 전체 목록은 다음과 같습니다:`
  );
  return [
    heading,
    ...groups.map((group) => {
      const label = group.pluginType === "auth" ? "Auth" : group.pluginType === "secret" ? "Secret engine" : "Database";
      return `${label} (${group.templates.length})\n${group.templates
        .map((template, index) => `${index + 1}. ${template.displayName}`)
        .join("\n")}`;
    })
  ].join("\n\n");
}

function factoryWelcomeMessage(t: Copy): string {
  return localize(
    t,
    "Describe the plugin you need in your own words. I will ask only for missing details, then generate, verify, and guide the Vault apply flow.",
    "만들고 싶은 Plugin을 편하게 말씀해주세요. 부족한 조건만 하나씩 확인한 뒤 생성·검증하고 Vault 적용까지 안내하겠습니다."
  );
}

function factoryStartMessage(template: VaultPluginTemplate, wantsApply: boolean, t: Copy): string {
  return localize(
    t,
    wantsApply
      ? `Good, I found the ${template.displayName} template. I will generate the scaffold first, then continue into the Vault apply step in the same flow.`
      : `Good, I found the ${template.displayName} template. I will generate the scaffold now and show each step in the console so you can see what the Factory is doing.`,
    wantsApply
      ? `좋아요, ${template.displayName} 템플릿을 찾았습니다. 먼저 스캐폴드를 만들고, 같은 흐름에서 Vault 적용 단계까지 이어가겠습니다.`
      : `좋아요, ${template.displayName} 템플릿을 찾았습니다. 지금 스캐폴드를 만들면서 Factory가 어떤 일을 하는지 콘솔에 단계별로 보여드릴게요.`
  );
}

function factoryGeneratedMessage(result: VaultPluginGenerateResult, wantsApply: boolean, t: Copy): string {
  return localize(
    t,
    wantsApply
      ? `The confirmed specification produced ${result.files.length} files for ${result.pluginName}, mounted at ${result.mountPath}/ with version ${result.version}. I will compile, test, and repair the source before checking approval and Vault apply gates.`
      : `The confirmed specification produced ${result.files.length} files for ${result.pluginName}, mounted at ${result.mountPath}/ with version ${result.version}. I will now compile and test the source in the isolated runner.`,
    wantsApply
      ? `확정된 명세로 ${result.pluginName}의 ${result.files.length}개 파일을 만들었습니다. Mount는 ${result.mountPath}/, Version은 ${result.version}입니다. 이제 컴파일과 테스트, 필요한 자동 수정을 마친 뒤 승인과 Vault 적용 단계를 확인하겠습니다.`
      : `확정된 명세로 ${result.pluginName}의 ${result.files.length}개 파일을 만들었습니다. Mount는 ${result.mountPath}/, Version은 ${result.version}입니다. 이제 격리된 환경에서 실제 컴파일과 테스트를 실행하겠습니다.`
  );
}

function factoryApplyAttemptMessage(attempt: PluginApplyAttempt, pluginName: string, t: Copy): string {
  if (attempt.status === "applied") return factoryAppliedMessage(attempt.result, t);
  if (attempt.status === "approval-required") {
    return localize(
      t,
      `The ${pluginName} scaffold is generated. Vault apply is paused at the approval gate; open Deployment review, request approval, then ask me to apply it again.`,
      `${pluginName} 스캐폴드 생성은 완료했습니다. Vault 적용은 승인 단계에서 안전하게 멈췄습니다. 배포 검토에서 승인을 요청한 뒤 다시 적용해달라고 말씀해주세요.`
    );
  }
  if (attempt.status === "preflight-blocked") {
    return localize(
      t,
      `${pluginName} is ready, but Vault apply is paused because a preflight check is incomplete. Open Deployment review to resolve the blocked item.`,
      `${pluginName} 생성은 완료했지만 사전 검증 항목이 남아 있어 Vault 적용을 멈췄습니다. 배포 검토에서 대기 항목을 확인해주세요.`
    );
  }
  return localize(
    t,
    `I understood the apply request, but the Vault operation returned an error${attempt.detail ? `: ${attempt.detail}` : "."}`,
    `적용 요청은 이해했지만 Vault 작업 중 오류가 발생했습니다${attempt.detail ? `: ${attempt.detail}` : "."}`
  );
}

function factoryAppliedMessage(result: VaultPluginApplyResult, t: Copy): string {
  return localize(
    t,
    `Done. I applied ${result.pluginName} to Vault at ${result.mountPath}/ in ${result.mode} mode. The Factory result is now ready for review in the apply plan below.`,
    `완료했습니다. ${result.pluginName}을 ${result.mountPath}/ 경로에 ${result.mode} 모드로 적용했습니다. 아래 적용 계획에서 결과를 바로 확인할 수 있어요.`
  );
}

function normalizeKoreanTechnicalTerms(value: string): string {
  return value
    .replaceAll("깃허브", "GitHub")
    .replaceAll("섹티고", "Sectigo")
    .replaceAll("디지서트", "DigiCert")
    .replaceAll("클릭하우스", "ClickHouse")
    .replaceAll("플러그인", "Plugin")
    .replaceAll("데이터베이스", "Database")
    .replaceAll("마운트", "Mount")
    .replaceAll("체크섬", "Checksum")
    .replaceAll("스캐폴드", "Scaffold")
    .replaceAll("템플릿", "Template")
    .replaceAll("롤백", "Rollback")
    .replaceAll("빌드", "Build")
    .replaceAll("테스트", "Test")
    .replaceAll("시크릿", "Secret");
}

function localize(t: Copy, en: string, ko: string): string {
  return t === copy.ko ? normalizeKoreanTechnicalTerms(ko) : en;
}

function savedViewLabels(t: Copy) {
  return {
    savedViews: localize(t, "Saved views", "저장된 보기"),
    saveCurrent: localize(t, "Save current view", "현재 보기 저장"),
    reset: localize(t, "Reset filters", "필터 초기화"),
    deleteView: localize(t, "Delete selected view", "선택한 보기 삭제"),
    namePlaceholder: localize(t, "View name", "보기 이름"),
    confirm: localize(t, "Save", "저장"),
    cancel: localize(t, "Cancel", "취소")
  };
}

function factoryStatusClassName(status: string): "error" | "success" | "warningLine" {
  if (/unable|failed|error|forbidden|실패|오류|못했습니다/i.test(status)) return "error";
  if (/required|blocked|resolve|필요|대기|해결/i.test(status)) return "warningLine";
  return "success";
}

function missingFactoryRequirementFields(spec: VaultPluginRequirements): VaultPluginRequirementField[] {
  const fields: VaultPluginRequirementField[] = [
    "targetSystem",
    "authMethod",
    "apiBasePath",
    "ttl",
    "rotationStrategy",
    "revokeStrategy",
    "mountPath"
  ];
  return fields.filter((field) => !spec[field].trim());
}

function toLocalDateTimeInputValue(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function scoreRisk({
  requestType,
  ttl,
  environment,
  scope,
  riskLevel
}: {
  requestType: RequestType;
  ttl?: string;
  environment?: SystemSummary["environment"];
  scope?: string;
  riskLevel?: RiskLevel;
}): RiskScore {
  const reasons: string[] = [];
  let score = 8;
  const normalizedScope = (scope ?? "").toLowerCase();
  const hours = parseTtlHours(ttl ?? "1h");

  if (environment === "prod") {
    score += 35;
    reasons.push("prod environment");
  } else if (environment === "staging") {
    score += 15;
    reasons.push("staging environment");
  } else {
    reasons.push("dev environment");
  }

  if (requestType.includes("DB")) {
    score += 22;
    reasons.push("database credential request");
  }
  if (requestType.includes("WRITE") || normalizedScope.includes("write")) {
    score += 20;
    reasons.push("write-capable permission");
  }
  if (requestType.includes("SSH") || requestType.includes("PKI")) {
    score += 14;
    reasons.push("certificate or SSH issuance");
  }
  if (requestType.includes("CUSTOM")) {
    score += 10;
    reasons.push("custom plugin token path");
  }
  if (requestType.includes("NETWORK")) {
    score += 30;
    reasons.push("network/security device rotation");
  }
  if (normalizedScope.includes("admin") || normalizedScope.includes("maintainer")) {
    score += 24;
    reasons.push("admin or maintainer scope");
  }
  if (hours >= 8) {
    score += 24;
    reasons.push("TTL is 8h or longer");
  } else if (hours >= 4) {
    score += 14;
    reasons.push("TTL is 4h or longer");
  } else {
    reasons.push("short TTL");
  }
  if (riskLevel === "high") score += 16;
  if (riskLevel === "medium") score += 8;

  return {
    score,
    level: score >= 66 ? "high" : score >= 36 ? "medium" : "low",
    reasons: Array.from(new Set(reasons))
  };
}

function parseTtlHours(ttl: string): number {
  const value = Number.parseFloat(ttl);
  if (Number.isNaN(value)) return 1;
  if (ttl.endsWith("m")) return value / 60;
  if (ttl.endsWith("d")) return value * 24;
  return value;
}

function RiskBadge({ risk }: { risk: RiskScore }) {
  return (
    <span className={`riskBadge ${risk.level}`}>
      {risk.level.toUpperCase()} · {risk.score}
    </span>
  );
}

function LifecycleTimeline({ steps, compact = false }: { steps: LifecycleStep[]; compact?: boolean }) {
  return (
    <ol className={`lifecycleTimeline ${compact ? "compactTimeline" : ""}`}>
      {steps.map((step) => (
        <li key={step.label} className={step.state}>
          <span />
          <div>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function credentialLifecycleSteps(
  t: Copy,
  request: AccessRequest | undefined,
  credential: IssuedCredential | undefined
): LifecycleStep[] {
  const requested = request?.createdAt ?? credential?.createdAt;
  const approved = request?.approvedAt;
  const issued = request?.executedAt ?? credential?.createdAt;
  const terminal = credential?.revokedAt ?? credential?.expiresAt;
  const credentialStatus = credential?.status ?? "active";
  return [
    {
      label: localize(t, "Requested", "요청됨"),
      detail: requested ? formatDate(requested) : "-",
      state: requested ? "done" : "future"
    },
    {
      label: localize(t, "Approved", "승인됨"),
      detail: approved ? formatDate(approved) : localize(t, "waiting approval", "승인 대기"),
      state: approved ? "done" : request?.status === "rejected" ? "blocked" : "future"
    },
    {
      label: localize(t, "Issued", "발급됨"),
      detail: issued ? formatDate(issued) : localize(t, "not issued", "미발급"),
      state: issued ? "done" : "future"
    },
    {
      label: localize(t, "In use", "사용 중"),
      detail: credential?.status ?? localize(t, "not active", "비활성"),
      state: credentialStatus === "active" ? "current" : credential ? "done" : "future"
    },
    {
      label: localize(t, "Expired / revoked", "만료/폐기"),
      detail: terminal ? formatDate(terminal) : localize(t, "scheduled by TTL", "TTL 기준 예정"),
      state: credentialStatus === "revoked" || credentialStatus === "expired" ? "done" : credentialStatus === "revoke_failed" ? "blocked" : "future"
    }
  ];
}

function requestLifecycleSteps(t: Copy, request: AccessRequest, events: AuditEvent[]): LifecycleStep[] {
  const relatedEvents = events.filter((event) => event.targetId === request.id);
  const latestEvent = relatedEvents[0];
  return [
    {
      label: localize(t, "Requested", "요청됨"),
      detail: formatDate(request.createdAt),
      state: "done"
    },
    {
      label: localize(t, "Reviewed", "검토됨"),
      detail: latestEvent ? `${latestEvent.action} / ${latestEvent.actorEmail}` : localize(t, "pending reviewer action", "승인자 작업 대기"),
      state: request.status === "pending" ? "current" : request.status === "rejected" ? "blocked" : "done"
    },
    {
      label: localize(t, "Executed", "실행됨"),
      detail: request.executedAt ? formatDate(request.executedAt) : localize(t, "not executed", "미실행"),
      state: request.executedAt ? "done" : request.status === "approved" ? "current" : "future"
    }
  ];
}

function buildSecretSurfaces(systems: SystemSummary[]): SecretSurface[] {
  return systems.flatMap((system) =>
    system.vaultMountMappings.map((mapping) => ({
      id: mapping.id,
      systemId: system.id,
      systemName: system.name,
      systemDescription: system.description,
      ownerGroup: system.ownerGroup,
      environment: system.environment,
      namespace: system.vaultNamespace,
      mountPath: mapping.mountPath,
      roleName: mapping.roleName,
      requestType: mapping.requestType,
      displayName: mapping.displayName,
      enabled: mapping.enabled
    }))
  );
}

function buildDependencyMapModel(
  systems: SystemSummary[],
  surfaces: SecretSurface[],
  credentials: IssuedCredential[]
): { nodes: DependencyNode[]; edges: DependencyEdge[] } {
  const namespaces = Array.from(new Set(systems.map((system) => system.vaultNamespace)));
  const nodes: DependencyNode[] = [
    { id: "vault", kind: "vault", label: "Vault", sublabel: "Enterprise core", x: 50, y: 10 }
  ];
  const edges: DependencyEdge[] = [];

  namespaces.forEach((namespace, index) => {
    const id = `namespace:${namespace}`;
    nodes.push({
      id,
      kind: "namespace",
      label: namespace,
      sublabel: "namespace",
      x: spread(index, namespaces.length, 18, 82),
      y: 27,
      namespace
    });
    edges.push({ from: "vault", to: id, tone: "vault" });
  });

  systems.forEach((system, index) => {
    const id = `system:${system.id}`;
    nodes.push({
      id,
      kind: "system",
      label: system.name,
      sublabel: `${system.environment} / ${system.ownerGroup}`,
      x: spread(index, systems.length, 12, 88),
      y: 40,
      namespace: system.vaultNamespace,
      systemName: system.name
    });
    edges.push({ from: `namespace:${system.vaultNamespace}`, to: id, tone: "namespace" });
  });

  const surfaceRows = Math.min(3, Math.max(surfaces.length, 1));
  const surfaceColumns = Math.max(Math.ceil(surfaces.length / surfaceRows), 1);
  surfaces.forEach((surface, index) => {
    const id = `surface:${surface.id}`;
    const surfaceRow = index % surfaceRows;
    const surfaceColumn = Math.floor(index / surfaceRows);
    nodes.push({
      id,
      kind: "surface",
      label: surface.displayName,
      sublabel: `${surface.mountPath} / ${surface.roleName}`,
      x: spread(surfaceColumn, surfaceColumns, 12, 88),
      y: 51 + surfaceRow * 9,
      namespace: surface.namespace,
      systemName: surface.systemName,
      surface
    });
    edges.push({ from: `system:${surface.systemId}`, to: id, tone: "system" });
  });

  const credentialRows = Math.min(3, Math.max(credentials.length, 1));
  const credentialColumns = Math.max(Math.ceil(credentials.length / credentialRows), 1);
  credentials.forEach((credential, index) => {
    const matchingSurface = surfaces.find(
      (surface) => surface.systemName === credential.systemName && surface.requestType === credential.requestType
    );
    const id = `credential:${credential.id}`;
    const credentialRow = index % credentialRows;
    const credentialColumn = Math.floor(index / credentialRows);
    nodes.push({
      id,
      kind: "credential",
      label: credential.requestType,
      sublabel: `${credential.status} / ${credential.ttl}`,
      x: spread(credentialColumn, credentialColumns, 16, 84),
      y: 80 + credentialRow * 8,
      namespace: matchingSurface?.namespace,
      systemName: credential.systemName,
      surface: matchingSurface,
      credential
    });
    if (matchingSurface) {
      edges.push({ from: `surface:${matchingSurface.id}`, to: id, tone: "lease" });
    }
  });

  return { nodes, edges };
}

function spread(index: number, total: number, min: number, max: number): number {
  if (total <= 1) return (min + max) / 2;
  return min + ((max - min) * index) / (total - 1);
}

function getRelatedSurfaces(node: DependencyNode, surfaces: SecretSurface[]): SecretSurface[] {
  if (node.kind === "surface" && node.surface) return [node.surface];
  if (node.kind === "credential" && node.surface) return [node.surface];
  if (node.kind === "system") return surfaces.filter((surface) => surface.systemName === node.systemName);
  if (node.kind === "namespace") return surfaces.filter((surface) => surface.namespace === node.namespace);
  return surfaces;
}

function getRelatedCredentials(
  node: DependencyNode,
  surfaces: SecretSurface[],
  credentials: IssuedCredential[]
): IssuedCredential[] {
  if (node.kind === "credential" && node.credential) return [node.credential];
  const relatedSurfaces = getRelatedSurfaces(node, surfaces);
  return credentials.filter((credential) =>
    relatedSurfaces.some(
      (surface) => surface.systemName === credential.systemName && surface.requestType === credential.requestType
    )
  );
}

function policyName(surface: SecretSurface): string {
  return `${slug(surface.systemName)}-${slug(surface.requestType)}-policy`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function requestTypeDescription(t: Copy, type: RequestType): string {
  const descriptions: Record<RequestType, [string, string]> = {
    KV_READ: ["Read a mapped KV secret without storing plaintext in the portal.", "KV Secret을 읽되 포털에는 평문을 저장하지 않습니다."],
    KV_WRITE: ["Register or update a KV secret through an approved workflow.", "승인 워크플로우를 통해 KV Secret을 등록/수정합니다."],
    DB_CREDENTIAL: ["Issue short-lived database credentials through Vault.", "Vault를 통해 단기 DB Credential을 발급합니다."],
    PKI_CERTIFICATE: ["Issue a certificate with governed TTL and role mapping.", "Role 매핑과 TTL 기준으로 인증서를 발급합니다."],
    SSH_CERTIFICATE: ["Issue an SSH certificate for temporary operational access.", "운영 접근용 임시 SSH 인증서를 발급합니다."],
    APPROLE_SECRET_ID: ["Issue a wrapped SecretID for application bootstrap.", "애플리케이션 부트스트랩용 Wrapped SecretID를 발급합니다."],
    CUSTOM_GITLAB_TOKEN: ["Request a GitLab project or group token via a Vault plugin.", "Vault Plugin을 통해 GitLab 프로젝트/그룹 토큰을 요청합니다."],
    CUSTOM_JENKINS_TOKEN: ["Request a temporary Jenkins API token via a Vault plugin.", "Vault Plugin을 통해 임시 Jenkins API 토큰을 요청합니다."],
    CUSTOM_ARTIFACTORY_TOKEN: ["Request an Artifactory token with lease tracking.", "Lease 추적이 가능한 Artifactory 토큰을 요청합니다."],
    CUSTOM_KAFKA_ACCESS: ["Request Kafka ACL metadata and client credential material.", "Kafka ACL 메타데이터와 클라이언트 Credential을 요청합니다."],
    CUSTOM_LEGACY_API_TOKEN: ["Request a legacy internal API token through Vault.", "Vault를 통해 Legacy 내부 API 토큰을 요청합니다."],
    NETWORK_DEVICE_ROTATION: ["Trigger governed network/security device credential rotation.", "네트워크/보안 장비 Credential 회전을 승인 기반으로 실행합니다."]
  };
  const [en, ko] = descriptions[type];
  return localize(t, en, ko);
}

function buildCsv(columns: string[], rows: string[][]): string {
  return [columns, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function buildAuditReport(title: string, columns: string[], rows: string[][]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#111827}h1{font-size:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d8dee8;padding:8px;text-align:left;font-size:12px}th{background:#f8fafc}</style></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.print()</script></body></html>`;
}

function dataDownloadHref(mimeType: string, content: string): string {
  return `data:${mimeType},${encodeURIComponent(content)}`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function portalAssistantWelcome(view: View, t: Copy): string {
  const page = t.nav[view];
  return localize(
    t,
    `I am looking at ${page} with you. Ask about the current status, items needing attention, or where to continue a task.`,
    `현재 ${page} 화면을 함께 보고 있습니다. 현재 상태, 확인이 필요한 항목, 다음 작업 위치를 질문해주세요.`
  );
}

function portalAssistantExamples(view: View, t: Copy): string[] {
  const examples: Record<View, Array<[string, string]>> = {
    dashboard: [
      ["What needs attention first?", "지금 먼저 확인할 항목 알려줘"],
      ["Summarize the current Vault status", "현재 Vault 상태를 요약해줘"],
      ["How many credentials expire soon?", "만료 예정 Credential이 몇 개야?"]
    ],
    secrets: [
      ["Summarize the Secret inventory", "Secret 현황을 요약해줘"],
      ["Are there any revoke failures?", "Revoke 실패 항목이 있어?"],
      ["Show me where to review active credentials", "활성 Credential 확인 화면으로 안내해줘"]
    ],
    systems: [
      ["Summarize my connected systems", "연결된 시스템을 요약해줘"],
      ["Are any Vault mappings unavailable?", "연결되지 않은 Vault Mapping이 있어?"],
      ["Where can I request a Secret?", "Secret 요청은 어디에서 해?"]
    ],
    requests: [
      ["Summarize my pending requests", "대기 중인 요청을 요약해줘"],
      ["Are there any high-risk requests?", "High Risk 요청이 있어?"],
      ["Where are requests approved?", "요청 승인은 어디에서 해?"]
    ],
    approvals: [
      ["Summarize the approval backlog", "승인 대기 건을 요약해줘"],
      ["How many high-risk requests are waiting?", "대기 중인 High Risk 요청이 몇 건이야?"],
      ["What should I review first?", "무엇부터 검토해야 해?"]
    ],
    credentials: [
      ["How many credentials are active?", "활성 Credential이 몇 개야?"],
      ["Are any credentials expiring soon?", "곧 만료되는 Credential이 있어?"],
      ["Are there any revoke failures?", "Revoke 실패 항목이 있어?"]
    ],
    audit: [
      ["Summarize recent failures", "최근 실패 이력을 요약해줘"],
      ["What does this Audit view contain?", "이 Audit 화면에는 무엇이 있어?"],
      ["Where can I check Vault health?", "Vault 상태는 어디에서 확인해?"]
    ],
    health: [
      ["Summarize the current Vault health", "현재 Vault 상태를 요약해줘"],
      ["Are any mappings unreachable?", "연결되지 않은 Mapping이 있어?"],
      ["Are there any Vault drifts?", "Vault Drift가 있어?"]
    ],
    plugins: [
      ["Create a GitHub PAT Rotation plugin", "GitHub PAT Rotation Plugin 만들어줘"],
      ["List available plugins", "만들 수 있는 Plugin을 알려줘"],
      ["Explain the approval flow", "승인 절차를 설명해줘"]
    ],
    users: [
      ["Explain the access roles", "접근 권한 Role을 설명해줘"],
      ["Where can I review Audit events?", "Audit Event는 어디에서 확인해?"],
      ["Summarize the current Vault status", "현재 Vault 상태를 요약해줘"]
    ],
    admin: [
      ["Summarize custom plugin status", "Custom Plugin 상태를 요약해줘"],
      ["Are there any Vault drifts?", "Vault Drift가 있어?"],
      ["What needs attention first?", "지금 먼저 확인할 항목 알려줘"]
    ]
  };
  return examples[view].map(([en, ko]) => localize(t, en, ko));
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string") {
        detail = payload.error;
      }
    } catch {
      // Keep the HTTP status text when the response is not JSON.
    }
    throw new Error(`${response.status} ${detail}`);
  }
  return (await response.json()) as T;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function normalizePortalMount(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function taskKindLabel(kind: PortalTask["kind"], t: Copy): string {
  const labels: Record<PortalTask["kind"], [string, string]> = {
    approval: ["Approval", "승인"],
    request: ["My request", "내 요청"],
    expiry: ["Expiry", "만료"],
    failure: ["Failure", "실패"]
  };
  return localize(t, labels[kind][0], labels[kind][1]);
}

function formatTaskSla(value: string, t: Copy): string {
  const remainingMs = new Date(value).getTime() - Date.now();
  const absoluteMinutes = Math.max(1, Math.round(Math.abs(remainingMs) / 60_000));
  const amount = absoluteMinutes >= 60 ? `${Math.round(absoluteMinutes / 60)}h` : `${absoluteMinutes}m`;
  return remainingMs < 0
    ? localize(t, `${amount} overdue`, `${amount} 지연`)
    : localize(t, `${amount} left`, `${amount} 남음`);
}

function createFactoryWorkspaceId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `factory-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function shortId(value: string): string {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
