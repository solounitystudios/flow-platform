"use server";

import { randomBytes, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/url";
import { requireSecureAdmin } from "@/lib/admin/auth";

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

export async function updateLeadStageAction(leadId: string, stage: string): Promise<{ error?: string }> {
  await requireSecureAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_leads")
    .update({ pipeline_stage: stage })
    .eq("id", leadId);

  if (error) return { error: sanitizeDbError("updateLeadStage", error) };

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
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

// ── Verification queue ─────────────────────────────────────────────────

export async function updateVerificationCaseAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireSecureAdmin();
  const supabase = await createClient();

  const caseId = String(formData.get("case_id") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  if (!caseId || !status) return { error: "Missing case or status." };

  const isDecision = status === "approved" || status === "rejected";

  const { error } = await supabase
    .from("organization_verification_cases")
    .update({
      status,
      decision_reason: String(formData.get("decision_reason") ?? "") || null,
      ...(isDecision ? { decided_by: admin.userId, decided_at: new Date().toISOString() } : {}),
    })
    .eq("id", caseId);

  if (error) return { error: sanitizeDbError("updateVerificationCase", error) };

  // Approval alone does not verify the organization or complete onboarding —
  // that remains a separate, deliberate step, never an automatic side effect
  // of a status change here.
  revalidatePath("/admin/verification");
  return {};
}
