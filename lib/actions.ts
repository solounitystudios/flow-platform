"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
