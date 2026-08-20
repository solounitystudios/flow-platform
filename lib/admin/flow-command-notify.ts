/**
 * FLOW COMMAND notification adapter — design scaffolding only.
 *
 * Nothing in this file is wired into the /admin/command page or called
 * automatically by anything in this batch. It exists so a future batch can
 * add a real notification path (in-app banner + tab-title flip already
 * exist client-side in FlowCommandMissionComplete; this file is for
 * out-of-band channels: email/Slack/etc.) without inventing the interface
 * from scratch, and without anyone mistaking it for an active integration.
 *
 * No API keys, webhook URLs, or other credentials live here or should ever
 * be hardcoded here — a real adapter would read those from environment
 * variables at call time, never from a committed file.
 */

export type FlowCommandEventType = "mission_complete" | "qa_fail" | "founder_approval_required" | "blocker";

export interface FlowCommandEvent {
  type: FlowCommandEventType;
  mission: string;
  summary: string;
}

export interface FlowCommandNotifier {
  notify(event: FlowCommandEvent): Promise<void>;
}

/**
 * The only implementation actually included in this batch: logs to the
 * server console. Safe by construction (no network calls, no secrets) but
 * still not invoked anywhere automatically — a future batch would need to
 * explicitly call this from wherever flow-lead's state updates land.
 */
export class ConsoleNotifier implements FlowCommandNotifier {
  async notify(event: FlowCommandEvent): Promise<void> {
    console.log(`[flow-command:${event.type}] ${event.mission} — ${event.summary}`);
  }
}

// ── Future adapters (not implemented — design notes only) ────────────────
//
// EmailNotifier
//   Would need: a transactional email provider (e.g. Resend/Postmark) API
//   key read from an environment variable, a verified sender address, and
//   a founder recipient address (also config, not hardcoded). Should
//   degrade to a no-op with a logged warning if the API key is absent.
//
// SlackNotifier
//   Would need: an incoming webhook URL (Slack app config) read from an
//   environment variable. POST a small JSON payload ({ text: summary }).
//   Never post secrets or full file diffs — summary text only.
//
// DiscordNotifier
//   Would need: a Discord webhook URL, same shape as Slack. Respect
//   Discord's message length limits and rate limits.
//
// MobilePushNotifier
//   Would need: a push provider (e.g. web push / APNs / FCM) with the
//   founder's device token(s) stored server-side, plus VAPID or provider
//   credentials in environment variables. Out of scope until FLOW has a
//   registered device to push to.
//
// WebhookNotifier
//   Generic outbound webhook: a founder-configured URL (stored in a
//   settings table, not env, since it's per-installation) and an optional
//   shared secret used to sign the payload (HMAC) so the receiving end can
//   verify authenticity. Never follow redirects to an unexpected host.
