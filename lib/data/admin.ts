import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export interface AdminMetrics {
  totalLeads: number;
  stageCounts: Record<string, number>;
  openTasks: number;
  overdueTasks: number;
  pendingVerification: number;
  activeInvitations: number;
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const supabase = await createClient();

  const [{ data: leads }, { data: tasks }, { data: cases }, { data: invites }] = await Promise.all([
    supabase.from("business_leads").select("pipeline_stage"),
    supabase.from("outreach_tasks").select("due_at, status").eq("status", "open"),
    supabase.from("organization_verification_cases").select("id").in("status", ["pending", "in_review", "information_requested"]),
    supabase.from("employer_invitations").select("id").is("revoked_at", null).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
  ]);

  const stageCounts: Record<string, number> = {};
  for (const l of leads ?? []) stageCounts[l.pipeline_stage] = (stageCounts[l.pipeline_stage] ?? 0) + 1;

  const now = Date.now();
  const overdueTasks = (tasks ?? []).filter((t) => new Date(t.due_at).getTime() < now).length;

  return {
    totalLeads: leads?.length ?? 0,
    stageCounts,
    openTasks: tasks?.length ?? 0,
    overdueTasks,
    pendingVerification: cases?.length ?? 0,
    activeInvitations: invites?.length ?? 0,
  };
}

export interface LeadListItem {
  id: string;
  business_name: string;
  category: string;
  neighborhood: string | null;
  pipeline_stage: string;
  interest_level: string;
  next_action_at: string | null;
  updated_at: string;
}

export async function getLeads(filters: { search?: string; stage?: string; category?: string }): Promise<LeadListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_leads")
    .select("id, business_name, category, neighborhood, pipeline_stage, interest_level, next_action_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (filters.search) query = query.ilike("business_name", `%${filters.search}%`);
  if (filters.stage) query = query.eq("pipeline_stage", filters.stage);
  if (filters.category) query = query.eq("category", filters.category);

  const { data, error } = await query;
  if (error) {
    console.error("[getLeads] query failed:", error.message);
    throw new Error("Unable to load leads.");
  }
  return data ?? [];
}

export type LeadDetail = Tables<"business_leads">;
export type ContactRow = Tables<"business_contacts">;
export type ActivityRow = Tables<"outreach_activities"> & { contact: Pick<Tables<"business_contacts">, "id" | "full_name"> | null };
export type TaskRow = Tables<"outreach_tasks">;
export type InvitationRow = Tables<"employer_invitations">;

export interface LeadWithRelations {
  lead: LeadDetail;
  contacts: ContactRow[];
  activities: ActivityRow[];
  tasks: TaskRow[];
  invitations: InvitationRow[];
}

export async function getLeadWithRelations(id: string): Promise<LeadWithRelations | null> {
  const supabase = await createClient();

  const { data: lead } = await supabase.from("business_leads").select("*").eq("id", id).maybeSingle();
  if (!lead) return null;

  const [{ data: contacts }, { data: activities }, { data: tasks }, { data: invitations }] = await Promise.all([
    supabase.from("business_contacts").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("outreach_activities").select("*, contact:business_contacts(id, full_name)").eq("lead_id", id).order("occurred_at", { ascending: false }),
    supabase.from("outreach_tasks").select("*").eq("lead_id", id).order("due_at", { ascending: true }),
    supabase.from("employer_invitations").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);

  return {
    lead,
    contacts: contacts ?? [],
    activities: (activities ?? []) as ActivityRow[],
    tasks: tasks ?? [],
    invitations: invitations ?? [],
  };
}

export interface OpenTask extends Tables<"outreach_tasks"> {
  lead: Pick<Tables<"business_leads">, "id" | "business_name"> | null;
  overdue: boolean;
}

export async function getOpenTasks(): Promise<OpenTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_tasks")
    .select("*, lead:business_leads(id, business_name)")
    .eq("status", "open")
    .order("due_at", { ascending: true });

  if (error) {
    console.error("[getOpenTasks] query failed:", error.message);
    throw new Error("Unable to load tasks.");
  }
  const now = Date.now();
  return ((data ?? []) as Omit<OpenTask, "overdue">[]).map((t) => ({ ...t, overdue: new Date(t.due_at).getTime() < now }));
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

export interface VerificationCaseRow extends Tables<"organization_verification_cases"> {
  lead: Pick<Tables<"business_leads">, "id" | "business_name"> | null;
  organization: Pick<Tables<"organizations">, "id" | "name"> | null;
}

export async function getVerificationQueue(): Promise<VerificationCaseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_verification_cases")
    .select("*, lead:business_leads(id, business_name), organization:organizations(id, name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getVerificationQueue] query failed:", error.message);
    throw new Error("Unable to load the verification queue.");
  }
  return (data ?? []) as VerificationCaseRow[];
}

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
  return (data ?? []) as AuditLogRow[];
}
