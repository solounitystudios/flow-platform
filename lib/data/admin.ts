import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { PIPELINE_STAGE_ORDER } from "@/lib/admin/constants";

function stageRank(stage: string): number {
  const i = PIPELINE_STAGE_ORDER.indexOf(stage as (typeof PIPELINE_STAGE_ORDER)[number]);
  return i;
}

// ── Dashboard funnel + operational metrics ─────────────────────────────
// Every number here comes from a real count against live tables — nothing
// is invented, and archived/not-interested prospects are excluded from
// the "active" funnel by default (shown separately instead).

export interface StageConversion {
  fromStage: string;
  toStage: string;
  fromCount: number;
  toCount: number;
  rate: number | null;
}

export interface CategoryPerformance {
  category: string;
  total: number;
  advanced: number;
}

export interface AdminMetrics {
  totalLeads: number;
  newThisWeek: number;
  contacted: number;
  decisionMakersReached: number;
  demosScheduled: number;
  demosCompleted: number;
  pilotsOffered: number;
  pilotsAccepted: number;
  onboardingStarted: number;
  organizationsVerified: number;
  firstOpportunitiesPosted: number;
  repeatEmployers: number;
  archivedCount: number;
  notInterestedCount: number;
  stageCounts: Record<string, number>;
  conversions: StageConversion[];
  openTasks: number;
  dueToday: number;
  overdueTasks: number;
  noResponseProspects: number;
  stalledOnboarding: number;
  pendingVerification: number;
  activeInvitations: number;
  categoryPerformance: CategoryPerformance[];
  neighborhoodDistribution: { neighborhood: string; count: number }[];
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const supabase = await createClient();

  const [{ data: allLeads }, { data: tasks }, { data: cases }, { data: invites }, { data: links }, { data: opportunities }] = await Promise.all([
    supabase.from("business_leads").select("id, pipeline_stage, category, neighborhood, created_at, archived, last_contact_at"),
    supabase.from("outreach_tasks").select("due_at, status"),
    supabase.from("organization_verification_cases").select("id, status, decided_at, lead_id"),
    supabase.from("employer_invitations").select("id, lead_id, accepted_at, revoked_at, expires_at"),
    supabase.from("lead_organization_links").select("lead_id, organization_id"),
    supabase.from("opportunities").select("organization_id"),
  ]);

  const leads = (allLeads ?? []).filter((l) => !l.archived);
  const archivedCount = (allLeads ?? []).filter((l) => l.archived).length;
  const notInterestedCount = leads.filter((l) => l.pipeline_stage === "not_interested").length;

  const stageCounts: Record<string, number> = {};
  for (const l of leads) stageCounts[l.pipeline_stage] = (stageCounts[l.pipeline_stage] ?? 0) + 1;

  const atOrBeyond = (stage: string) => leads.filter((l) => stageRank(l.pipeline_stage) >= stageRank(stage)).length;

  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;
  const newThisWeek = leads.filter((l) => new Date(l.created_at).getTime() >= weekAgo).length;

  const conversions: StageConversion[] = [];
  for (let i = 0; i < PIPELINE_STAGE_ORDER.length - 1; i++) {
    const fromStage = PIPELINE_STAGE_ORDER[i];
    const toStage = PIPELINE_STAGE_ORDER[i + 1];
    const fromCount = atOrBeyond(fromStage);
    const toCount = atOrBeyond(toStage);
    conversions.push({ fromStage, toStage, fromCount, toCount, rate: fromCount > 0 ? toCount / fromCount : null });
  }

  const openTasks = (tasks ?? []).filter((t) => t.status === "open");
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const dueToday = openTasks.filter((t) => new Date(t.due_at).getTime() <= todayEnd.getTime() && new Date(t.due_at).getTime() >= new Date().setHours(0, 0, 0, 0)).length;
  const overdueTasks = openTasks.filter((t) => new Date(t.due_at).getTime() < now).length;

  const noResponseProspects = leads.filter(
    (l) => l.pipeline_stage === "contact_attempted" && (!l.last_contact_at || new Date(l.last_contact_at).getTime() < weekAgo),
  ).length;

  const linkedOrgIds = new Set((links ?? []).map((l) => l.organization_id));
  const orgOpportunityCounts = new Map<string, number>();
  for (const o of opportunities ?? []) {
    if (!o.organization_id) continue;
    orgOpportunityCounts.set(o.organization_id, (orgOpportunityCounts.get(o.organization_id) ?? 0) + 1);
  }

  const leadsByOrgLink = new Map((links ?? []).map((l) => [l.lead_id, l.organization_id]));
  let stalledOnboarding = 0;
  for (const l of leads) {
    if (l.pipeline_stage !== "onboarding_started" && l.pipeline_stage !== "organization_verified") continue;
    const orgId = leadsByOrgLink.get(l.id);
    const openCase = (cases ?? []).find((c) => c.lead_id === l.id && !["approved", "rejected", "closed"].includes(c.status));
    const approvedCase = (cases ?? []).find((c) => c.lead_id === l.id && c.status === "approved");
    const noOrgYet = !orgId;
    const verificationStuck = Boolean(openCase);
    const verifiedNoOpportunity = Boolean(approvedCase) && orgId !== undefined && !orgOpportunityCounts.has(orgId as string);
    if (noOrgYet || verificationStuck || verifiedNoOpportunity) stalledOnboarding++;
  }
  void linkedOrgIds;

  const categoryMap = new Map<string, { total: number; advanced: number }>();
  for (const l of leads) {
    const entry = categoryMap.get(l.category) ?? { total: 0, advanced: 0 };
    entry.total++;
    if (stageRank(l.pipeline_stage) >= stageRank("pilot_accepted")) entry.advanced++;
    categoryMap.set(l.category, entry);
  }
  const categoryPerformance = Array.from(categoryMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total);

  const neighborhoodMap = new Map<string, number>();
  for (const l of leads) {
    const key = l.neighborhood?.trim() || "Unspecified";
    neighborhoodMap.set(key, (neighborhoodMap.get(key) ?? 0) + 1);
  }
  const neighborhoodDistribution = Array.from(neighborhoodMap.entries())
    .map(([neighborhood, count]) => ({ neighborhood, count }))
    .sort((a, b) => b.count - a.count);

  const activeInvitations = (invites ?? []).filter((i) => !i.revoked_at && !i.accepted_at && new Date(i.expires_at) > new Date()).length;
  const pendingVerification = (cases ?? []).filter((c) => ["pending", "in_review", "information_requested"].includes(c.status)).length;

  return {
    totalLeads: leads.length,
    newThisWeek,
    contacted: atOrBeyond("contact_attempted"),
    decisionMakersReached: atOrBeyond("decision_maker_reached"),
    demosScheduled: atOrBeyond("demo_scheduled"),
    demosCompleted: atOrBeyond("demo_completed"),
    pilotsOffered: atOrBeyond("pilot_offered"),
    pilotsAccepted: atOrBeyond("pilot_accepted"),
    onboardingStarted: atOrBeyond("onboarding_started"),
    organizationsVerified: atOrBeyond("organization_verified"),
    firstOpportunitiesPosted: atOrBeyond("first_opportunity_posted"),
    repeatEmployers: stageCounts["repeat_employer"] ?? 0,
    archivedCount,
    notInterestedCount,
    stageCounts,
    conversions,
    openTasks: openTasks.length,
    dueToday,
    overdueTasks,
    noResponseProspects,
    stalledOnboarding,
    pendingVerification,
    activeInvitations,
    categoryPerformance,
    neighborhoodDistribution,
  };
}

// ── Leads list + filters ────────────────────────────────────────────────

export interface LeadListItem {
  id: string;
  business_name: string;
  category: string;
  neighborhood: string | null;
  pipeline_stage: string;
  interest_level: string;
  best_contact_method: string | null;
  next_action_at: string | null;
  last_contact_at: string | null;
  assigned_to: string | null;
  archived: boolean;
  updated_at: string;
}

export interface LeadFilters {
  search?: string;
  stage?: string;
  category?: string;
  neighborhood?: string;
  interestLevel?: string;
  contactMethod?: string;
  followUp?: "overdue" | "upcoming" | "none";
  assignedTo?: string;
  invitationStatus?: "active" | "accepted" | "expired" | "revoked" | "none";
  verificationStatus?: string;
  archived?: "active" | "archived" | "all";
  lastContactFrom?: string;
  lastContactTo?: string;
}

export async function getLeads(filters: LeadFilters): Promise<LeadListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_leads")
    .select("id, business_name, category, neighborhood, pipeline_stage, interest_level, best_contact_method, next_action_at, last_contact_at, assigned_to, archived, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (filters.search) query = query.ilike("business_name", `%${filters.search}%`);
  if (filters.stage) query = query.eq("pipeline_stage", filters.stage);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.neighborhood) query = query.eq("neighborhood", filters.neighborhood);
  if (filters.interestLevel) query = query.eq("interest_level", filters.interestLevel);
  if (filters.contactMethod) query = query.eq("best_contact_method", filters.contactMethod);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters.lastContactFrom) query = query.gte("last_contact_at", filters.lastContactFrom);
  if (filters.lastContactTo) query = query.lte("last_contact_at", filters.lastContactTo);

  if (!filters.archived || filters.archived === "active") query = query.eq("archived", false);
  else if (filters.archived === "archived") query = query.eq("archived", true);

  const { data, error } = await query;
  if (error) {
    console.error("[getLeads] query failed:", error.message);
    throw new Error("Unable to load leads.");
  }

  let rows = data ?? [];

  if (filters.followUp) {
    const now = Date.now();
    rows = rows.filter((l) => {
      if (filters.followUp === "none") return !l.next_action_at;
      if (!l.next_action_at) return false;
      const t = new Date(l.next_action_at).getTime();
      return filters.followUp === "overdue" ? t < now : t >= now;
    });
  }

  if (filters.invitationStatus) {
    const { data: invites } = await supabase.from("employer_invitations").select("lead_id, accepted_at, revoked_at, expires_at");
    const byLead = new Map<string, Tables<"employer_invitations">[]>();
    for (const i of invites ?? []) {
      const list = byLead.get(i.lead_id) ?? [];
      list.push(i as Tables<"employer_invitations">);
      byLead.set(i.lead_id, list);
    }
    const now = Date.now();
    rows = rows.filter((l) => {
      const list = byLead.get(l.id) ?? [];
      if (filters.invitationStatus === "none") return list.length === 0;
      if (filters.invitationStatus === "accepted") return list.some((i) => i.accepted_at);
      if (filters.invitationStatus === "revoked") return list.some((i) => i.revoked_at);
      if (filters.invitationStatus === "expired") return list.some((i) => !i.revoked_at && !i.accepted_at && new Date(i.expires_at).getTime() < now);
      if (filters.invitationStatus === "active") return list.some((i) => !i.revoked_at && !i.accepted_at && new Date(i.expires_at).getTime() >= now);
      return true;
    });
  }

  if (filters.verificationStatus) {
    const { data: cases } = await supabase.from("organization_verification_cases").select("lead_id, status").order("created_at", { ascending: false });
    const latestByLead = new Map<string, string>();
    for (const c of cases ?? []) {
      if (c.lead_id && !latestByLead.has(c.lead_id)) latestByLead.set(c.lead_id, c.status);
    }
    rows = rows.filter((l) => latestByLead.get(l.id) === filters.verificationStatus);
  }

  return rows;
}

export async function getDistinctCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("business_leads").select("category");
  return Array.from(new Set((data ?? []).map((r) => r.category))).sort();
}

export async function getDistinctNeighborhoods(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("business_leads").select("neighborhood");
  return Array.from(new Set((data ?? []).map((r) => r.neighborhood).filter((n): n is string => Boolean(n)))).sort();
}

export async function getAssignableAdmins(): Promise<{ profile_id: string; full_name: string | null; username: string | null }[]> {
  const supabase = await createClient();
  const { data: admins } = await supabase.from("admins").select("profile_id").eq("active", true);
  if (!admins || admins.length === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .in("id", admins.map((a) => a.profile_id));
  return (profiles ?? []).map((p) => ({ profile_id: p.id, full_name: p.full_name, username: p.username }));
}

// ── Lead detail ──────────────────────────────────────────────────────────

export type LeadDetail = Tables<"business_leads">;
export type ContactRow = Tables<"business_contacts">;
export type ActivityRow = Tables<"outreach_activities"> & { contact: Pick<Tables<"business_contacts">, "id" | "full_name"> | null };
export type TaskRow = Tables<"outreach_tasks">;
export type InvitationRow = Tables<"employer_invitations">;
export type StageHistoryRow = Tables<"lead_stage_history"> & { changed_by_profile: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null };

export interface LeadWithRelations {
  lead: LeadDetail;
  contacts: ContactRow[];
  activities: ActivityRow[];
  tasks: TaskRow[];
  invitations: InvitationRow[];
  stageHistory: StageHistoryRow[];
  organization: Pick<Tables<"organizations">, "id" | "name" | "verified"> | null;
  verificationCase: Tables<"organization_verification_cases"> | null;
}

export async function getLeadWithRelations(id: string): Promise<LeadWithRelations | null> {
  const supabase = await createClient();

  const { data: lead } = await supabase.from("business_leads").select("*").eq("id", id).maybeSingle();
  if (!lead) return null;

  const [{ data: contacts }, { data: activities }, { data: tasks }, { data: invitations }, { data: stageHistory }, { data: link }, { data: verificationCase }] = await Promise.all([
    supabase.from("business_contacts").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("outreach_activities").select("*, contact:business_contacts(id, full_name)").eq("lead_id", id).order("occurred_at", { ascending: false }),
    supabase.from("outreach_tasks").select("*").eq("lead_id", id).order("due_at", { ascending: true }),
    supabase.from("employer_invitations").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("lead_stage_history").select("*, changed_by_profile:profiles(id, full_name, username)").eq("lead_id", id).order("changed_at", { ascending: false }),
    supabase.from("lead_organization_links").select("organization_id").eq("lead_id", id).maybeSingle(),
    supabase.from("organization_verification_cases").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  let organization: LeadWithRelations["organization"] = null;
  if (link?.organization_id) {
    const { data: org } = await supabase.from("organizations").select("id, name, verified").eq("id", link.organization_id).maybeSingle();
    organization = org ?? null;
  }

  return {
    lead,
    contacts: contacts ?? [],
    activities: (activities ?? []) as ActivityRow[],
    tasks: tasks ?? [],
    invitations: invitations ?? [],
    stageHistory: (stageHistory ?? []) as StageHistoryRow[],
    organization,
    verificationCase: verificationCase ?? null,
  };
}

// ── Pipeline board ───────────────────────────────────────────────────────

export interface PipelineCard {
  id: string;
  business_name: string;
  category: string;
  interest_level: string;
  updated_at: string;
  next_action_at: string | null;
}

export async function getPipelineBoard(): Promise<Record<string, PipelineCard[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_leads")
    .select("id, business_name, category, interest_level, pipeline_stage, updated_at, next_action_at")
    .eq("archived", false)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[getPipelineBoard] query failed:", error.message);
    throw new Error("Unable to load the pipeline board.");
  }

  const board: Record<string, PipelineCard[]> = {};
  for (const stage of PIPELINE_STAGE_ORDER) board[stage] = [];
  board["not_interested"] = [];
  board["follow_up_later"] = [];

  for (const l of data ?? []) {
    const list = board[l.pipeline_stage] ?? (board[l.pipeline_stage] = []);
    list.push({ id: l.id, business_name: l.business_name, category: l.category, interest_level: l.interest_level, updated_at: l.updated_at, next_action_at: l.next_action_at });
  }

  return board;
}

// ── Task signals: lead-derived groupings that aren't outreach_tasks rows ──

export interface LeadSignal {
  id: string;
  business_name: string;
  detail: string;
}

export interface TaskSignals {
  noResponse: LeadSignal[];
  demosThisWeek: LeadSignal[];
  onboardingStalled: LeadSignal[];
}

export async function getTaskSignals(): Promise<TaskSignals> {
  const supabase = await createClient();
  const [{ data: leads }, { data: links }, { data: cases }, { data: opportunities }] = await Promise.all([
    supabase.from("business_leads").select("id, business_name, pipeline_stage, last_contact_at, next_action_at, archived").eq("archived", false),
    supabase.from("lead_organization_links").select("lead_id, organization_id"),
    supabase.from("organization_verification_cases").select("lead_id, status"),
    supabase.from("opportunities").select("organization_id"),
  ]);

  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;
  const weekAhead = now + 7 * 86_400_000;

  const noResponse: LeadSignal[] = (leads ?? [])
    .filter((l) => l.pipeline_stage === "contact_attempted" && (!l.last_contact_at || new Date(l.last_contact_at).getTime() < weekAgo))
    .map((l) => ({ id: l.id, business_name: l.business_name, detail: l.last_contact_at ? `Last contacted ${new Date(l.last_contact_at).toLocaleDateString()}` : "Never followed up" }));

  const demosThisWeek: LeadSignal[] = (leads ?? [])
    .filter((l) => l.pipeline_stage === "demo_scheduled" && l.next_action_at && new Date(l.next_action_at).getTime() >= now && new Date(l.next_action_at).getTime() <= weekAhead)
    .map((l) => ({ id: l.id, business_name: l.business_name, detail: `Demo ${new Date(l.next_action_at as string).toLocaleString()}` }));

  const orgIdsWithOpportunity = new Set((opportunities ?? []).map((o) => o.organization_id).filter(Boolean));
  const linkByLead = new Map((links ?? []).map((l) => [l.lead_id, l.organization_id]));
  const openCaseByLead = new Set((cases ?? []).filter((c) => c.lead_id && !["approved", "rejected", "closed"].includes(c.status)).map((c) => c.lead_id));
  const approvedCaseByLead = new Set((cases ?? []).filter((c) => c.lead_id && c.status === "approved").map((c) => c.lead_id));

  const onboardingStalled: LeadSignal[] = (leads ?? [])
    .filter((l) => l.pipeline_stage === "onboarding_started" || l.pipeline_stage === "organization_verified")
    .filter((l) => {
      const orgId = linkByLead.get(l.id);
      if (!orgId) return true;
      if (openCaseByLead.has(l.id)) return true;
      if (approvedCaseByLead.has(l.id) && !orgIdsWithOpportunity.has(orgId)) return true;
      return false;
    })
    .map((l) => {
      const orgId = linkByLead.get(l.id);
      const detail = !orgId ? "No organization created yet" : openCaseByLead.has(l.id) ? "Verification still open" : "Verified, no opportunity posted yet";
      return { id: l.id, business_name: l.business_name, detail };
    });

  return { noResponse, demosThisWeek, onboardingStalled };
}

// ── Tasks (follow-up command center) ────────────────────────────────────

export interface OpenTask extends Tables<"outreach_tasks"> {
  lead: Pick<Tables<"business_leads">, "id" | "business_name" | "pipeline_stage"> | null;
  overdue: boolean;
}

export interface TaskFilters {
  taskType?: string;
  stage?: string;
  dueFrom?: string;
  dueTo?: string;
  status?: "open" | "completed" | "cancelled" | "all";
}

export async function getTasks(filters: TaskFilters = {}): Promise<OpenTask[]> {
  const supabase = await createClient();
  let query = supabase.from("outreach_tasks").select("*, lead:business_leads(id, business_name, pipeline_stage)").order("due_at", { ascending: true });

  if (!filters.status || filters.status === "open") query = query.eq("status", "open");
  else if (filters.status !== "all") query = query.eq("status", filters.status);

  if (filters.taskType) query = query.eq("task_type", filters.taskType);
  if (filters.dueFrom) query = query.gte("due_at", filters.dueFrom);
  if (filters.dueTo) query = query.lte("due_at", filters.dueTo);

  const { data, error } = await query;
  if (error) {
    console.error("[getTasks] query failed:", error.message);
    throw new Error("Unable to load tasks.");
  }

  let rows = ((data ?? []) as unknown as Omit<OpenTask, "overdue">[]).map((t) => ({ ...t, overdue: t.status === "open" && new Date(t.due_at).getTime() < Date.now() }));
  if (filters.stage) rows = rows.filter((t) => t.lead?.pipeline_stage === filters.stage);
  return rows;
}

/** Backward-compatible alias for the plain open-tasks list. */
export async function getOpenTasks(): Promise<OpenTask[]> {
  return getTasks({ status: "open" });
}

export async function getTemplates(): Promise<Tables<"outreach_templates">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("outreach_templates").select("*").eq("active", true).order("created_at", { ascending: true });
  if (error) {
    console.error("[getTemplates] query failed:", error.message);
    throw new Error("Unable to load templates.");
  }
  return data ?? [];
}

// ── Verification queue ───────────────────────────────────────────────────

export interface VerificationCaseRow extends Tables<"organization_verification_cases"> {
  lead: Pick<Tables<"business_leads">, "id" | "business_name"> | null;
  organization: Pick<Tables<"organizations">, "id" | "name"> | null;
  assigned_reviewer: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null;
}

export async function getVerificationQueue(): Promise<VerificationCaseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_verification_cases")
    .select("*, lead:business_leads(id, business_name), organization:organizations(id, name), assigned_reviewer:profiles!organization_verification_cases_assigned_to_fkey(id, full_name, username)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getVerificationQueue] query failed:", error.message);
    throw new Error("Unable to load the verification queue.");
  }
  return (data ?? []) as unknown as VerificationCaseRow[];
}

export type VerificationDecisionRow = Tables<"verification_decisions"> & { actor: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null };

export async function getVerificationDecisions(caseId: string): Promise<VerificationDecisionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verification_decisions")
    .select("*, actor:profiles(id, full_name, username)")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getVerificationDecisions] query failed:", error.message);
    throw new Error("Unable to load the decision history.");
  }
  return (data ?? []) as unknown as VerificationDecisionRow[];
}

// ── Audit log ─────────────────────────────────────────────────────────────

export interface AuditLogRow extends Tables<"admin_audit_log"> {
  actor: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null;
}

export async function getAuditLog(limit = 100): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*, actor:profiles(id, full_name, username)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getAuditLog] query failed:", error.message);
    throw new Error("Unable to load the audit log.");
  }
  return (data ?? []) as unknown as AuditLogRow[];
}

// ── Content moderation: opportunities / events / organizations ────────────
// getAdminOpportunities/getAdminEvents rely on the opportunities_admin_read /
// events_admin_read permissive SELECT policies (see
// supabase/migrations/20260819171934_admin_content_read_and_moderation_rpcs.sql,
// live in production as 20260820053340_admin_content_read_and_moderation_rpcs)
// to see every row regardless of status or owner — the public-facing
// getOpenOpportunities/getUpcomingEvents-style queries elsewhere only ever
// see published, non-draft rows via the existing owner-or-published policy.
//
// getAdminOrganizations needs no new policy at all — orgs_public_read is
// already `using (true)`, fully public, so this is a plain query gated only
// by requireSecureAdmin() at the page/action layer.

export interface AdminOpportunityRow extends Tables<"opportunities"> {
  organization: Pick<Tables<"organizations">, "id" | "name"> | null;
}

export async function getAdminOpportunities(status?: string): Promise<AdminOpportunityRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("opportunities")
    .select("*, organization:organizations(id, name)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[getAdminOpportunities] query failed:", error.message);
    throw new Error("Unable to load opportunities.");
  }
  return (data ?? []) as unknown as AdminOpportunityRow[];
}

export interface AdminEventRow extends Tables<"events"> {
  organization: Pick<Tables<"organizations">, "id" | "name"> | null;
}

export async function getAdminEvents(status?: string): Promise<AdminEventRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("*, organization:organizations(id, name)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[getAdminEvents] query failed:", error.message);
    throw new Error("Unable to load events.");
  }
  return (data ?? []) as unknown as AdminEventRow[];
}

export interface AdminOrganizationRow extends Tables<"organizations"> {
  owner: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null;
}

export async function getAdminOrganizations(): Promise<AdminOrganizationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*, owner:profiles!organizations_owner_id_fkey(id, full_name, username)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getAdminOrganizations] query failed:", error.message);
    throw new Error("Unable to load organizations.");
  }
  return (data ?? []) as unknown as AdminOrganizationRow[];
}
