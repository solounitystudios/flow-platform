"use server";

import { randomBytes, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/url";
import { requireSecureAdmin } from "@/lib/admin/auth";
import type { StageChangeResult, VerificationDecisionResult, ImportLeadsResult, GenerateFollowupsResult, Json } from "@/lib/database.types";

export interface AdminActionState {
  error?: string;
}

/** Logs the real error server-side and returns a generic message — raw
 * Postgres/PostgREST errors must never reach the admin UI either. */
function sanitizeDbError(context: string, error: { message: string }): string {
  console.error(`[admin:${context}]`, error.message);
  return "Something went wrong. Try again.";
}

// ── Leads ───────────────────────────────────────────────────────────────

export async function createLeadAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireSecureAdmin();
  const supabase = await createClient();

  const business_name = String(formData.get("business_name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  if (!business_name) return { error: "Give the business a name." };
  if (!category) return { error: "Choose a category." };

  const typical_roles = String(formData.get("typical_roles") ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  const { data, error } = await supabase
    .from("business_leads")
    .insert({
      business_name,
      category,
      address: String(formData.get("address") ?? "") || null,
      neighborhood: String(formData.get("neighborhood") ?? "") || null,
      city: String(formData.get("city") ?? "Buffalo"),
      region: String(formData.get("region") ?? "NY"),
      postal_code: String(formData.get("postal_code") ?? "") || null,
      website_url: String(formData.get("website_url") ?? "") || null,
      social_url: String(formData.get("social_url") ?? "") || null,
      general_email: String(formData.get("general_email") ?? "") || null,
      general_phone: String(formData.get("general_phone") ?? "") || null,
      staffing_problems: String(formData.get("staffing_problems") ?? "") || null,
      typical_roles,
      hiring_frequency: String(formData.get("hiring_frequency") ?? "") || null,
      best_contact_method: String(formData.get("best_contact_method") ?? "") || null,
      source: String(formData.get("source") ?? "") || null,
      consent_notes: String(formData.get("consent_notes") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
      created_by: admin.userId,
    })
    .select("id")
    .single();

  if (error) return { error: sanitizeDbError("createLead", error) };

  revalidatePath("/admin/leads");
  redirect(`/admin/leads/${data.id}`);
}

export async function updateLeadAction(leadId: string, _prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const business_name = String(formData.get("business_name") ?? "").trim();
  if (!business_name) return { error: "Give the business a name." };

  const typical_roles = String(formData.get("typical_roles") ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  const { error } = await supabase
    .from("business_leads")
    .update({
      business_name,
      category: String(formData.get("category") ?? "").trim(),
      address: String(formData.get("address") ?? "") || null,
      neighborhood: String(formData.get("neighborhood") ?? "") || null,
      city: String(formData.get("city") ?? "Buffalo"),
      region: String(formData.get("region") ?? "NY"),
      postal_code: String(formData.get("postal_code") ?? "") || null,
      website_url: String(formData.get("website_url") ?? "") || null,
      social_url: String(formData.get("social_url") ?? "") || null,
      general_email: String(formData.get("general_email") ?? "") || null,
      general_phone: String(formData.get("general_phone") ?? "") || null,
      staffing_problems: String(formData.get("staffing_problems") ?? "") || null,
      typical_roles,
      hiring_frequency: String(formData.get("hiring_frequency") ?? "") || null,
      best_contact_method: String(formData.get("best_contact_method") ?? "") || null,
      interest_level: String(formData.get("interest_level") ?? "unknown"),
      source: String(formData.get("source") ?? "") || null,
      consent_notes: String(formData.get("consent_notes") ?? "") || null,
      assigned_to: String(formData.get("assigned_to") ?? "") || null,
      next_action: String(formData.get("next_action") ?? "") || null,
      next_action_at: String(formData.get("next_action_at") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    })
    .eq("id", leadId);

  if (error) return { error: sanitizeDbError("updateLead", error) };

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
  return {};
}

/** The only path a lead's pipeline_stage ever changes through — both the
 * lead detail page's StageSelect and the pipeline board call this. The
 * database RPC (not this function) is the actual authority: it re-checks
 * is_flow_admin(true) itself and atomically records the change in
 * lead_stage_history, so a direct REST call to the RPC is exactly as safe
 * as going through this Server Action. */
export async function updateLeadStageAction(leadId: string, stage: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("change_lead_stage", { p_lead_id: leadId, p_new_stage: stage });
  if (error) return { error: sanitizeDbError("updateLeadStage", error) };
  const result = data as StageChangeResult | null;
  if (!result?.ok) return { error: result?.reason === "not_found" ? "Lead not found." : "Unable to change stage." };

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin");
  return {};
}

// ── Archive lifecycle ──────────────────────────────────────────────────
// Archiving/restoring is a plain, RLS-gated table update rather than a
// SECURITY DEFINER RPC — requireSecureAdmin() already enforces AAL2
// server-side, business_leads' existing is_flow_admin(true) ALL policy is
// the RLS second layer, and the existing business_leads_audit trigger
// captures the change automatically. Never a hard delete.

export async function archiveLeadAction(leadId: string, _prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireSecureAdmin();
  const supabase = await createClient();

  const reason = String(formData.get("archived_reason") ?? "").trim();
  if (!reason) return { error: "Give a reason for archiving." };

  const { error } = await supabase
    .from("business_leads")
    .update({ archived: true, archived_at: new Date().toISOString(), archived_reason: reason, archived_by: admin.userId })
    .eq("id", leadId);

  if (error) return { error: sanitizeDbError("archiveLead", error) };

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin");
  return {};
}

export async function restoreLeadAction(leadId: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_leads")
    .update({ archived: false, archived_at: null, archived_reason: null, archived_by: null })
    .eq("id", leadId);

  if (error) return { error: sanitizeDbError("restoreLead", error) };

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin");
  return {};
}

// ── Contacts ────────────────────────────────────────────────────────────

export async function createContactAction(leadId: string, _prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Give the contact a name." };

  const { error } = await supabase.from("business_contacts").insert({
    lead_id: leadId,
    full_name,
    title: String(formData.get("title") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    preferred_method: String(formData.get("preferred_method") ?? "") || null,
    is_decision_maker: formData.get("is_decision_maker") === "on",
    notes: String(formData.get("notes") ?? "") || null,
  });

  if (error) return { error: sanitizeDbError("createContact", error) };

  revalidatePath(`/admin/leads/${leadId}`);
  return {};
}

// ── Outreach activity ───────────────────────────────────────────────────

export async function logActivityAction(leadId: string, _prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireSecureAdmin();
  const supabase = await createClient();

  const method = String(formData.get("method") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  if (!method) return { error: "Choose how you reached out." };
  if (!outcome) return { error: "Describe the outcome." };

  const followUpAt = String(formData.get("follow_up_at") ?? "");

  const { error } = await supabase.from("outreach_activities").insert({
    lead_id: leadId,
    contact_id: String(formData.get("contact_id") ?? "") || null,
    method,
    outcome,
    notes: String(formData.get("notes") ?? "") || null,
    objections: String(formData.get("objections") ?? "") || null,
    interest_level: String(formData.get("interest_level") ?? "") || null,
    follow_up_at: followUpAt || null,
    created_by: admin.userId,
  });

  if (error) return { error: sanitizeDbError("logActivity", error) };

  await supabase.from("business_leads").update({ last_contact_at: new Date().toISOString() }).eq("id", leadId);

  revalidatePath(`/admin/leads/${leadId}`);
  return {};
}

// ── Tasks ───────────────────────────────────────────────────────────────

export async function createTaskAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireSecureAdmin();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const due_at = String(formData.get("due_at") ?? "");
  if (!title) return { error: "Give the task a title." };
  if (!due_at) return { error: "Set a due date." };

  const { error } = await supabase.from("outreach_tasks").insert({
    lead_id: String(formData.get("lead_id") ?? "") || null,
    title,
    details: String(formData.get("details") ?? "") || null,
    task_type: String(formData.get("task_type") ?? "follow_up"),
    due_at,
    created_by: admin.userId,
  });

  if (error) return { error: sanitizeDbError("createTask", error) };

  revalidatePath("/admin/tasks");
  const leadId = String(formData.get("lead_id") ?? "");
  if (leadId) revalidatePath(`/admin/leads/${leadId}`);
  return {};
}

export async function completeTaskAction(taskId: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("outreach_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { error: sanitizeDbError("completeTask", error) };

  revalidatePath("/admin/tasks");
  return {};
}

export async function cancelTaskAction(taskId: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("outreach_tasks").update({ status: "cancelled" }).eq("id", taskId);
  if (error) return { error: sanitizeDbError("cancelTask", error) };

  revalidatePath("/admin/tasks");
  return {};
}

export async function rescheduleTaskAction(taskId: string, dueAt: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  if (!dueAt) return { error: "Choose a new due date." };

  const { error } = await supabase.from("outreach_tasks").update({ due_at: dueAt }).eq("id", taskId);
  if (error) return { error: sanitizeDbError("rescheduleTask", error) };

  revalidatePath("/admin/tasks");
  return {};
}

/** Reopens a completed or cancelled task — clears completed_at and puts it
 * back in the open queue. Reversing a task's status is itself a change
 * the existing outreach_tasks_audit trigger captures automatically. */
export async function reopenTaskAction(taskId: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("outreach_tasks").update({ status: "open", completed_at: null }).eq("id", taskId);
  if (error) return { error: sanitizeDbError("reopenTask", error) };

  revalidatePath("/admin/tasks");
  return {};
}

/** On-demand replacement for a cron job: scans for stalled-onboarding
 * conditions (invitation accepted with no organization, verification
 * stuck open, verified-but-nothing-posted) and opens one deduplicated
 * follow-up task per lead per condition. There is no scheduled/automatic
 * invocation of this — see supabase/migrations/20260819050000_admin_batch2_operations.sql
 * for why (no tested scheduler in this app yet). */
export async function generateOnboardingTasksAction(): Promise<{ error?: string; created?: number }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("generate_onboarding_followup_tasks");
  if (error) return { error: sanitizeDbError("generateOnboardingTasks", error) };
  const result = data as GenerateFollowupsResult | null;
  if (!result?.ok) return { error: "Unable to generate follow-ups." };

  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return { created: result.created };
}

// ── Employer invitations ───────────────────────────────────────────────

export interface InvitationActionState {
  error?: string;
  inviteUrl?: string;
}

/**
 * Generates a random invitation token, stores only its SHA-256 hash
 * (employer_invitations.token_hash), and returns the plaintext token to
 * the admin exactly once so they can copy the invite link. The plaintext
 * is never persisted anywhere — accept_employer_invitation only ever
 * receives and compares the hash.
 */
export async function createInvitationAction(leadId: string, _prev: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const admin = await requireSecureAdmin();
  const supabase = await createClient();

  const intendedEmail = String(formData.get("intended_email") ?? "").trim();
  const days = Number(formData.get("expires_days") ?? 14) || 14;

  const token = randomBytes(32).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const expires_at = new Date(Date.now() + days * 86_400_000).toISOString();

  const { error } = await supabase.from("employer_invitations").insert({
    lead_id: leadId,
    token_hash,
    intended_email: intendedEmail || null,
    expires_at,
    created_by: admin.userId,
  });

  if (error) return { error: sanitizeDbError("createInvitation", error) };

  const origin = await getRequestOrigin();
  revalidatePath(`/admin/leads/${leadId}`);
  return { inviteUrl: `${origin}/employer/invite/${token}` };
}

export async function revokeInvitationAction(invitationId: string, leadId: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("employer_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invitationId);
  if (error) return { error: sanitizeDbError("revokeInvitation", error) };

  revalidatePath(`/admin/leads/${leadId}`);
  return {};
}

/** Revokes an expired (or still-active) invitation and issues a fresh one
 * in its place, linked via replaces_invitation_id for lineage. The old
 * token's hash stays in the table (nothing is deleted) — it just becomes
 * unusable the moment revoked_at is set, same as revokeInvitationAction. */
export async function replaceInvitationAction(oldInvitationId: string, leadId: string, _prev: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const admin = await requireSecureAdmin();
  const supabase = await createClient();

  const intendedEmail = String(formData.get("intended_email") ?? "").trim();
  const days = Number(formData.get("expires_days") ?? 14) || 14;

  const { error: revokeError } = await supabase
    .from("employer_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", oldInvitationId)
    .is("revoked_at", null);
  if (revokeError) return { error: sanitizeDbError("replaceInvitation:revoke", revokeError) };

  const token = randomBytes(32).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const expires_at = new Date(Date.now() + days * 86_400_000).toISOString();

  const { error } = await supabase.from("employer_invitations").insert({
    lead_id: leadId,
    token_hash,
    intended_email: intendedEmail || null,
    expires_at,
    created_by: admin.userId,
    replaces_invitation_id: oldInvitationId,
  });

  if (error) return { error: sanitizeDbError("replaceInvitation:create", error) };

  const origin = await getRequestOrigin();
  revalidatePath(`/admin/leads/${leadId}`);
  return { inviteUrl: `${origin}/employer/invite/${token}` };
}

// ── Verification queue ─────────────────────────────────────────────────

/** The only path a verification case's status ever changes through — the
 * database RPC re-checks is_flow_admin(true) itself, records the decision
 * in verification_decisions, and (only on approval) advances the lead's
 * pipeline stage forward via change_lead_stage. Approval alone never
 * verifies the organization or completes onboarding on its own — that
 * marketplace-facing flag is a separate, deliberate step untouched here. */
export async function decideVerificationCaseAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const caseId = String(formData.get("case_id") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  if (!caseId || !status) return { error: "Missing case or status." };

  const reasonCode = String(formData.get("decision_reason_code") ?? "") || undefined;
  const notes = String(formData.get("decision_reason") ?? "") || undefined;
  const assignedTo = String(formData.get("assigned_to") ?? "") || undefined;

  const { data, error } = await supabase.rpc("decide_verification_case", {
    p_case_id: caseId,
    p_new_status: status,
    p_reason_code: reasonCode,
    p_notes: notes,
    p_assigned_to: assignedTo,
  });

  if (error) return { error: sanitizeDbError("decideVerificationCase", error) };
  const result = data as VerificationDecisionResult | null;
  if (!result?.ok) return { error: result?.reason === "not_found" ? "Case not found." : "Unable to save decision." };

  revalidatePath("/admin/verification");
  revalidatePath("/admin");
  return {};
}

// ── CSV lead import ─────────────────────────────────────────────────────

export interface ImportPreviewRow {
  rowIndex: number;
  data: Record<string, string>;
  errors: string[];
  duplicate: { id: string; business_name: string; matchReason: string } | null;
  decision: "create" | "update" | "skip";
}

export interface ImportPreviewState {
  error?: string;
  rows?: ImportPreviewRow[];
}

const MAX_IMPORT_ROWS = 500;

export async function previewLeadImportAction(_prev: ImportPreviewState, formData: FormData): Promise<ImportPreviewState> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const csvText = String(formData.get("csv_text") ?? "").trim();
  if (!csvText) return { error: "Paste or upload a CSV first." };

  const { parseCsvWithHeader, normalizeBusinessName, normalizePhone, normalizeWebsiteDomain, CONTACT_METHOD_ALIASES, LEAD_IMPORT_COLUMNS } = await import("@/lib/admin/csv");

  const { headers, rows } = parseCsvWithHeader(csvText);
  if (!headers.includes("business_name") || !headers.includes("category")) {
    return { error: "CSV must include at least business_name and category columns." };
  }
  if (rows.length === 0) return { error: "No data rows found." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `Too many rows — max ${MAX_IMPORT_ROWS} per import.` };

  const { data: existing } = await supabase.from("business_leads").select("id, business_name, website_url, general_phone, archived");
  const existingLeads = existing ?? [];

  const previewRows: ImportPreviewRow[] = rows.map((raw, i) => {
    const data: Record<string, string> = {};
    for (const col of LEAD_IMPORT_COLUMNS) data[col] = raw[col] ?? "";

    const errors: string[] = [];
    if (!data.business_name.trim()) errors.push("Missing business name.");
    if (!data.category.trim()) errors.push("Missing category.");

    if (data.best_contact_method) {
      const mapped = CONTACT_METHOD_ALIASES[data.best_contact_method.toLowerCase()];
      if (!mapped) errors.push(`Unrecognized contact method "${data.best_contact_method}".`);
      else data.best_contact_method = mapped;
    }

    let duplicate: ImportPreviewRow["duplicate"] = null;
    const normName = normalizeBusinessName(data.business_name);
    const normPhone = data.phone ? normalizePhone(data.phone) : "";
    const normDomain = data.website ? normalizeWebsiteDomain(data.website) : "";

    for (const lead of existingLeads) {
      const leadNorm = normalizeBusinessName(lead.business_name);
      const leadPhone = lead.general_phone ? normalizePhone(lead.general_phone) : "";
      const leadDomain = lead.website_url ? normalizeWebsiteDomain(lead.website_url) : "";

      if (normDomain && leadDomain && normDomain === leadDomain) {
        duplicate = { id: lead.id, business_name: lead.business_name, matchReason: "website domain" };
        break;
      }
      if (normPhone && leadPhone && normPhone === leadPhone) {
        duplicate = { id: lead.id, business_name: lead.business_name, matchReason: "phone number" };
        break;
      }
      if (normName && leadNorm && normName === leadNorm) {
        duplicate = { id: lead.id, business_name: lead.business_name, matchReason: "business name" };
        break;
      }
    }

    return {
      rowIndex: i,
      data,
      errors,
      duplicate,
      decision: errors.length > 0 ? "skip" : duplicate ? "skip" : "create",
    };
  });

  return { rows: previewRows };
}

export interface ImportCommitState {
  error?: string;
  result?: { created: number; updated: number };
}

/** Executes exactly the admin's confirmed per-row decisions from the
 * preview step — this never re-derives or re-guesses anything, and never
 * writes a row the preview flagged with an error. */
export async function commitLeadImportAction(_prev: ImportCommitState, formData: FormData): Promise<ImportCommitState> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const rowsJson = String(formData.get("rows_json") ?? "");
  let rows: Json[];
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return { error: "Malformed import batch." };
  }

  if (!Array.isArray(rows) || rows.length === 0) return { error: "Nothing to import." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `Too many rows — max ${MAX_IMPORT_ROWS} per import.` };

  const { data, error } = await supabase.rpc("import_business_leads", { p_rows: rows });
  if (error) return { error: sanitizeDbError("commitLeadImport", error) };
  const result = data as ImportLeadsResult | null;
  if (!result?.ok) return { error: result?.reason === "batch_too_large" ? `Too many rows — max ${MAX_IMPORT_ROWS} per import.` : "Import failed." };

  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  return { result: { created: result.created ?? 0, updated: result.updated ?? 0 } };
}

// ── V1+ Passport evidence review ────────────────────────────────────────
// The only path a member's evidence claim ever changes status through —
// decide_evidence_verification() re-checks is_flow_admin(true) itself,
// records an immutable verification_reviews row, flips profile_skills.
// verified when applicable, and mints/revokes the matching
// profile_credentials badge. Mirrors decide_verification_case() exactly.

export async function decideEvidenceAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const verificationId = String(formData.get("verification_id") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  if (!verificationId || !status) return { error: "Missing claim or status." };

  const method = String(formData.get("method") ?? "") || undefined;
  const reasonCode = String(formData.get("reason_code") ?? "") || undefined;
  const notes = String(formData.get("notes") ?? "") || undefined;
  const expiresRaw = String(formData.get("expires_at") ?? "");

  const { data, error } = await supabase.rpc("decide_evidence_verification", {
    p_verification_id: verificationId,
    p_new_status: status,
    p_method: method,
    p_reason_code: reasonCode,
    p_notes: notes,
    p_expires_at: expiresRaw || undefined,
  });

  if (error) return { error: sanitizeDbError("decideEvidence", error) };
  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) return { error: result?.reason === "not_found" ? "Claim not found." : "Unable to save decision." };

  revalidatePath("/admin/evidence");
  return {};
}

export async function grantFoundingClassAction(profileId: string, reason: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  if (!reason.trim()) return { error: "Give a reason for the founding-class grant." };

  const { data, error } = await supabase.rpc("grant_founding_class", { p_profile_id: profileId, p_reason: reason });
  if (error) return { error: sanitizeDbError("grantFoundingClass", error) };
  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) return { error: "Unable to grant founding-class status." };

  revalidatePath("/admin/evidence");
  return {};
}

// ── Content moderation: opportunities / events ─────────────────────────────
// admin_set_opportunity_status / admin_set_event_status (see
// supabase/migrations/20260819171934_admin_content_read_and_moderation_rpcs.sql)
// are the only path either table's status ever changes through when an
// admin — not the row's creator — makes the change. Both RPCs re-check
// is_flow_admin(true) inside the function itself and audit-log every call
// to admin_audit_log, mirroring change_lead_stage/decide_verification_case
// exactly: requireSecureAdmin() here is defense in depth, not the only gate.

export async function adminSetOpportunityStatusAction(opportunityId: string, status: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_set_opportunity_status", { p_opportunity_id: opportunityId, p_status: status });
  if (error) return { error: sanitizeDbError("adminSetOpportunityStatus", error) };
  const result = data as { ok?: boolean } | null;
  if (!result?.ok) return { error: "Unable to change status." };

  revalidatePath("/admin/opportunities");
  return {};
}

export async function adminSetEventStatusAction(eventId: string, status: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_set_event_status", { p_event_id: eventId, p_status: status });
  if (error) return { error: sanitizeDbError("adminSetEventStatus", error) };
  const result = data as { ok?: boolean } | null;
  if (!result?.ok) return { error: "Unable to change status." };

  revalidatePath("/admin/events");
  return {};
}
