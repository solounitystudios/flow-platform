"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CheckInResult, RedeemResult, ConnectionRpcResult } from "@/lib/database.types";

export interface ActionState {
  error?: string;
  success?: boolean;
  needsEmailConfirmation?: boolean;
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

  if (!email || !password || !fullName) {
    return { error: "Fill in your name, email, and password to continue." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, username: username || undefined } },
  });

  if (error) return { error: error.message };

  // If email confirmation is required, signUp succeeds but returns no session —
  // there's nothing to redirect into yet, so tell the user to check their inbox.
  if (!data.session) return { success: true, needsEmailConfirmation: true };

  redirect("/onboarding");
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first — check your inbox for the link we sent." };
    }
    return { error: "Incorrect email or password." };
  }

  redirect(next || "/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function completeOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const city = String(formData.get("city") ?? "Buffalo");
  const state = String(formData.get("state") ?? "NY");
  const bio = String(formData.get("bio") ?? "");
  const skillIds = formData.getAll("skills").map(String);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ city, state, bio, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (profileError) return { error: profileError.message };

  if (skillIds.length > 0) {
    const rows = skillIds.map((skill_id) => ({ profile_id: user.id, skill_id }));
    const { error: skillsError } = await supabase.from("profile_skills").upsert(rows, { onConflict: "profile_id,skill_id" });
    if (skillsError) return { error: skillsError.message };
  }

  redirect("/dashboard");
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const full_name = String(formData.get("full_name") ?? "");
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  const city = String(formData.get("city") ?? "");
  const state = String(formData.get("state") ?? "");
  const bio = String(formData.get("bio") ?? "");
  const available_now = formData.get("available_now") === "on";

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, username: username || null, city, state, bio, available_now, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message.includes("duplicate") ? "That username is taken." : error.message };

  revalidatePath("/settings");
  revalidatePath("/passport");
  revalidatePath("/profile");
  return { success: true };
}

export async function createOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const city = String(formData.get("city") ?? "Buffalo");
  const state = String(formData.get("state") ?? "NY");

  if (!name) return { error: "Give your business a name." };

  const { error } = await supabase.from("organizations").insert({ owner_id: user.id, name, description, city, state });
  if (error) return { error: error.message };

  revalidatePath("/business");
  return {};
}

export async function createOpportunityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const opportunity_type = String(formData.get("opportunity_type") ?? "gig");
  const city = String(formData.get("city") ?? "Buffalo");
  const state = String(formData.get("state") ?? "NY");
  const location_name = String(formData.get("location_name") ?? "");
  const organization_id = String(formData.get("organization_id") ?? "") || null;
  const slots = Number(formData.get("slots") ?? 1);
  const payDollars = formData.get("pay_dollars");
  const pay_cents = payDollars ? Math.round(Number(payDollars) * 100) : null;
  const starts_at = formData.get("starts_at") ? new Date(String(formData.get("starts_at"))).toISOString() : null;
  const category = String(formData.get("category") ?? "") || null;
  const is_remote = formData.get("is_remote") === "on";
  const instant_book = formData.get("instant_book") === "on";

  if (!title) return { error: "Give the opportunity a title." };

  const { error } = await supabase.from("opportunities").insert({
    created_by: user.id,
    organization_id,
    title,
    description,
    opportunity_type,
    city,
    state,
    location_name,
    slots: Number.isFinite(slots) && slots > 0 ? slots : 1,
    pay_cents,
    starts_at,
    status: "open",
    category,
    is_remote,
    instant_book,
  });

  if (error) return { error: error.message };

  revalidatePath("/business");
  redirect("/business");
}

export async function updateOpportunityStatusAction(id: string, status: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("opportunities").update({ status }).eq("id", id).eq("created_by", user.id);
  revalidatePath("/business");
}

export async function togglePassportVisibilityAction(isPublic: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").update({ public_passport: isPublic }).eq("id", user.id);
  revalidatePath("/passport");
  revalidatePath("/p", "layout");
}

export async function addProfileSkillAction(skillId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !skillId) return;

  await supabase.from("profile_skills").upsert({ profile_id: user.id, skill_id: skillId }, { onConflict: "profile_id,skill_id" });
  revalidatePath("/settings");
  revalidatePath("/passport");
}

export async function removeProfileSkillAction(skillId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profile_skills").delete().eq("profile_id", user.id).eq("skill_id", skillId);
  revalidatePath("/settings");
  revalidatePath("/passport");
}

export async function toggleAvailableNowAction(available: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").update({ available_now: available }).eq("id", user.id);
  revalidatePath("/dashboard");
  revalidatePath("/passport");
}

// ── Opportunity lifecycle ──────────────────────────────────────────────
// These map directly onto the applications state machine enforced in the
// database (enforce_application_lifecycle trigger). RLS decides which rows
// you can touch; that trigger decides which transitions are legal — an error
// raised there (e.g. "This opportunity is already full.") comes straight
// back through error.message.

export interface LifecycleResult {
  error?: string;
}

export async function applyToOpportunityAction(opportunityId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to apply." };

  const { error } = await supabase.from("applications").insert({ opportunity_id: opportunityId, applicant_id: user.id });
  if (error) {
    if (error.code === "23505") return { error: "You've already applied to this opportunity." };
    return { error: error.message };
  }

  revalidatePath(`/gigs/${opportunityId}`);
  revalidatePath("/applications");
  return {};
}

export async function claimOpportunityAction(opportunityId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to claim this opportunity." };

  const { error } = await supabase.from("applications").insert({ opportunity_id: opportunityId, applicant_id: user.id, status: "accepted" });
  if (error) {
    if (error.code === "23505") return { error: "You've already applied to this opportunity." };
    return { error: error.message };
  }

  revalidatePath(`/gigs/${opportunityId}`);
  revalidatePath("/work");
  revalidatePath("/applications");
  return {};
}

export async function withdrawApplicationAction(applicationId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ status: "withdrawn" }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath("/applications");
  return {};
}

export async function acceptApplicantAction(applicationId: string, opportunityId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ status: "accepted" }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/business/opportunities/${opportunityId}`);
  revalidatePath("/business");
  return {};
}

export async function rejectApplicantAction(applicationId: string, opportunityId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ status: "rejected" }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/business/opportunities/${opportunityId}`);
  return {};
}

export async function markCompletedAction(applicationId: string, opportunityId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ status: "completed" }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/business/opportunities/${opportunityId}`);
  revalidatePath("/business");
  return {};
}

export async function markNoShowAction(applicationId: string, opportunityId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ status: "no_show" }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/business/opportunities/${opportunityId}`);
  return {};
}

export async function cancelAcceptedApplicationAction(applicationId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ status: "cancelled" }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath("/work");
  revalidatePath("/business");
  return {};
}

export async function acknowledgeCompletionAction(applicationId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ worker_ack_at: new Date().toISOString() }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath("/work");
  return {};
}

export async function leaveRecommendationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const recipient_id = String(formData.get("recipient_id") ?? "");
  const opportunity_id = String(formData.get("opportunity_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const ratingRaw = String(formData.get("rating") ?? "");
  const rating = ratingRaw ? Number(ratingRaw) : null;
  const skills_demonstrated = formData.getAll("skills_demonstrated").map(String).filter(Boolean);

  if (!body || body.length < 10) return { error: "Write at least a sentence or two." };

  const { error } = await supabase.from("recommendations").insert({
    author_id: user.id,
    recipient_id,
    opportunity_id,
    body,
    rating,
    skills_demonstrated: skills_demonstrated.length > 0 ? skills_demonstrated : null,
  });

  if (error) {
    if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
      return { error: "You can only recommend someone you've actually hired and marked as completed." };
    }
    return { error: error.message };
  }

  revalidatePath(`/business/opportunities/${opportunity_id}`);
  return { success: true };
}

export async function markNotificationReadAction(notificationId: string) {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read: true }).eq("id", notificationId);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("notifications").update({ read: true }).eq("profile_id", user.id).eq("read", false);
  revalidatePath("/notifications");
}

// ── Events & tickets ────────────────────────────────────────────────────

function generateCheckinCode() {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const letters = Array.from({ length: 2 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  return `FLOW-${digits}-${letters}`;
}

export interface RegisterResult extends LifecycleResult {
  attendanceId?: string;
}

export async function registerForEventAction(eventId: string): Promise<RegisterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to register for this event." };

  const { data: event } = await supabase.from("events").select("ticket_price_cents").eq("id", eventId).maybeSingle();

  const { data, error } = await supabase
    .from("event_attendance")
    .insert({
      event_id: eventId,
      profile_id: user.id,
      checkin_code: generateCheckinCode(),
      price_cents: event?.ticket_price_cents ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "You're already registered for this event." };
    return { error: error.message };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/tickets");
  return { attendanceId: data.id };
}

export async function cancelEventRegistrationAction(attendanceId: string): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_attendance").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", attendanceId);
  if (error) return { error: error.message };

  revalidatePath("/tickets");
  return {};
}

export interface CheckInActionResult {
  error?: string;
  result?: CheckInResult;
}

export async function checkInByCodeAction(eventId: string, code: string): Promise<CheckInActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_ticket", { p_event_id: eventId, p_checkin_code: code, p_method: "code" });
  if (error) return { error: error.message };

  revalidatePath(`/business/events/${eventId}`);
  return { result: data as unknown as CheckInResult };
}

export async function checkInByProfileAction(eventId: string, profileId: string): Promise<CheckInActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_ticket", { p_event_id: eventId, p_profile_id: profileId, p_method: "manual" });
  if (error) return { error: error.message };

  revalidatePath(`/business/events/${eventId}`);
  return { result: data as unknown as CheckInResult };
}

export async function markNoShowEventAction(eventId: string, profileId: string): Promise<CheckInActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_no_show", { p_event_id: eventId, p_profile_id: profileId });
  if (error) return { error: error.message };

  revalidatePath(`/business/events/${eventId}`);
  return { result: data as unknown as CheckInResult };
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const category = String(formData.get("category") ?? "") || null;
  const organization_id = String(formData.get("organization_id") ?? "") || null;
  const venue = String(formData.get("venue") ?? "") || null;
  const address = String(formData.get("address") ?? "") || null;
  const city = String(formData.get("city") ?? "Buffalo");
  const state = String(formData.get("state") ?? "NY");
  const capacityRaw = formData.get("capacity");
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  const priceDollars = formData.get("ticket_price_dollars");
  const ticket_price_cents = priceDollars ? Math.round(Number(priceDollars) * 100) : 0;
  const starts_at = formData.get("starts_at") ? new Date(String(formData.get("starts_at"))).toISOString() : null;
  const ends_at = formData.get("ends_at") ? new Date(String(formData.get("ends_at"))).toISOString() : null;

  if (!title) return { error: "Give the event a title." };
  if (!starts_at) return { error: "Set a start date and time." };

  const { error } = await supabase.from("events").insert({
    created_by: user.id,
    organization_id,
    title,
    description,
    category,
    venue,
    address,
    city,
    state,
    capacity: capacity && capacity > 0 ? capacity : null,
    ticket_price_cents,
    is_paid: ticket_price_cents > 0,
    starts_at,
    ends_at,
    status: "published",
  });

  if (error) return { error: error.message };

  revalidatePath("/business");
  revalidatePath("/events");
  redirect("/business");
}

export async function updateEventStatusAction(id: string, status: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("events").update({ status }).eq("id", id).eq("created_by", user.id);
  revalidatePath("/business");
  revalidatePath(`/business/events/${id}`);
  revalidatePath("/events");
}

// ── Rewards ─────────────────────────────────────────────────────────────

export interface RedeemActionResult {
  error?: string;
  result?: RedeemResult;
}

export async function redeemRewardAction(rewardId: string): Promise<RedeemActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to redeem rewards." };

  const { data, error } = await supabase.rpc("redeem_reward", { p_reward_id: rewardId });
  if (error) return { error: error.message };

  revalidatePath("/rewards");
  return { result: data as unknown as RedeemResult };
}

// ── Connections ─────────────────────────────────────────────────────────
// Every mutation goes through a SECURITY DEFINER RPC (see the harden_connections
// migration) — the client never writes to the connections table directly, so
// the state machine and race-condition handling live in one place, in the DB.

export interface ConnectionActionResult {
  error?: string;
  status?: string;
  connectionId?: string;
  autoAccepted?: boolean;
}

const CONNECTION_ERROR_TEXT: Record<string, string> = {
  not_authenticated: "Log in to manage connections.",
  self: "You can't do that with your own profile.",
  not_found: "That profile or request couldn't be found.",
  blocked: "You can't connect with this member.",
  already_connected: "You're already connected with this person.",
  already_pending: "You already have a pending request with this person.",
  not_authorized: "You're not able to do that.",
  not_pending: "That request has already been handled.",
  not_connected: "You're not connected with this person.",
  not_blocked: "This member isn't blocked.",
  invalid_action: "That action isn't supported.",
  missing_reason: "Choose a reason before submitting your report.",
  unknown_state: "Something went wrong. Try again.",
};

function toConnectionResult(data: unknown, error: { message: string } | null): ConnectionActionResult {
  if (error) return { error: error.message };

  const result = data as unknown as ConnectionRpcResult;
  if (!result.ok) return { error: CONNECTION_ERROR_TEXT[result.reason ?? ""] ?? "Something went wrong. Try again." };

  revalidatePath("/connections");
  revalidatePath("/discover");
  revalidatePath("/p", "layout");
  return { status: result.status, connectionId: result.connection_id, autoAccepted: result.auto_accepted };
}

export async function sendConnectionRequestAction(recipientId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_connection_request", { p_recipient_id: recipientId });
  return toConnectionResult(data, error);
}

export async function acceptConnectionRequestAction(connectionId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_connection_request", { p_connection_id: connectionId, p_action: "accept" });
  return toConnectionResult(data, error);
}

export async function declineConnectionRequestAction(connectionId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_connection_request", { p_connection_id: connectionId, p_action: "decline" });
  return toConnectionResult(data, error);
}

export async function cancelConnectionRequestAction(connectionId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_connection_request", { p_connection_id: connectionId });
  return toConnectionResult(data, error);
}

export async function removeConnectionAction(connectionId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_connection", { p_connection_id: connectionId });
  return toConnectionResult(data, error);
}

export async function blockProfileAction(targetId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("block_profile", { p_target_id: targetId });
  return toConnectionResult(data, error);
}

export async function unblockProfileAction(targetId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unblock_profile", { p_target_id: targetId });
  return toConnectionResult(data, error);
}

export async function reportProfileAction(targetId: string, reason: string, details?: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_profile", { p_target_id: targetId, p_reason: reason, p_details: details ?? undefined });
  return toConnectionResult(data, error);
}
