"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface IntentActionState {
  error?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createIntentAction(_prev: IntentActionState, formData: FormData): Promise<IntentActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Log in to set a goal." };

  const intent_type = String(formData.get("intent_type") ?? "");
  if (!intent_type) return { error: "Choose what you're trying to do." };

  const target_categories = String(formData.get("target_categories") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const radiusRaw = String(formData.get("radius_miles") ?? "");
  const expiresRaw = String(formData.get("expires_at") ?? "");

  const { error } = await supabase.from("member_intents").insert({
    profile_id: user.id,
    intent_type,
    goal: String(formData.get("goal") ?? "") || null,
    target_categories,
    location_city: String(formData.get("location_city") ?? "") || null,
    location_state: String(formData.get("location_state") ?? "") || null,
    radius_miles: radiusRaw ? Number(radiusRaw) : null,
    availability: String(formData.get("availability") ?? "") || null,
    remote_preference: String(formData.get("remote_preference") ?? "either"),
    visible: formData.get("visible") === "on",
    expires_at: expiresRaw || null,
  });

  if (error) {
    console.error("[createIntent]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  await supabase.rpc("evaluate_achievements", { p_profile_id: user.id });
  revalidatePath("/settings");
  revalidatePath("/passport");
  return {};
}

export async function toggleIntentActiveAction(intentId: string, active: boolean): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Log in first." };

  const { error } = await supabase.from("member_intents").update({ active }).eq("id", intentId).eq("profile_id", user.id);
  if (error) return { error: "Something went wrong. Try again." };

  revalidatePath("/settings");
  return {};
}

export async function toggleIntentVisibleAction(intentId: string, visible: boolean): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Log in first." };

  const { error } = await supabase.from("member_intents").update({ visible }).eq("id", intentId).eq("profile_id", user.id);
  if (error) return { error: "Something went wrong. Try again." };

  revalidatePath("/settings");
  return {};
}

export async function deleteIntentAction(intentId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Log in first." };

  const { error } = await supabase.from("member_intents").delete().eq("id", intentId).eq("profile_id", user.id);
  if (error) return { error: "Something went wrong. Try again." };

  revalidatePath("/settings");
  return {};
}
