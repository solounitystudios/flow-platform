import type { ClaimStatus, Sensitivity } from "@flow/passport-contracts";
import { effectiveClaimStatus } from "./claim-lifecycle";

/**
 * Contextual Passport projections. There is no single "Passport object" that
 * everyone receives: each view is a purpose-bound projection that includes
 * only what that audience is entitled to. Row-level access is decided by RLS;
 * projections decide which COLUMNS and which VALUE FIELDS survive.
 *
 * Implemented views (real data, tested): OWNER, PUBLIC, CREDENTIAL_CHECK.
 * The rest are DESIGNED — named here so they can't be bolted on without their
 * own purpose, consent and authority gates.
 */
export const PASSPORT_VIEWS = {
  owner: { implemented: true, basis: "the subject themselves" },
  public: { implemented: true, basis: "the subject's public switch + the claim's public switch" },
  credential_check: { implemented: true, basis: "an active, purpose-bound consent grant — answers only" },
  employer: { implemented: false, basis: "designed: consent (hiring_review) + data_requester authority" },
  business: { implemented: false, basis: "designed: business authority" },
  event: { implemented: false, basis: "designed: event_operator authority + attendee consent" },
  program: { implemented: false, basis: "designed: program_administrator authority + participant consent" },
  guardian: { implemented: false, basis: "designed: awaits the Youth/Guardian consent model" },
  agency: { implemented: false, basis: "designed: purpose + authority + legal basis + minimum projection + audit + expiry — never full-Passport browsing" },
  crew: { implemented: false, basis: "designed: team subjects have no ownership resolver yet" },
} as const;

export type PassportView = keyof typeof PASSPORT_VIEWS;

export interface ClaimRowInput {
  id: string;
  claim_type: string;
  value: Record<string, unknown> | null;
  status: ClaimStatus;
  effective_at: string | null;
  expires_at: string | null;
  visibility: "private" | "public";
  sensitivity: Sensitivity;
  /** Where the assertion came from. A user-created claim is always "manual"; Passport-derived ones are "flow_platform". */
  source_system: string;
  created_at: string;
}

/**
 * Which fields of a claim's value a PUBLIC viewer may see, per claim type.
 * Default deny: an unlisted claim type contributes no value fields at all.
 */
export const PUBLIC_VALUE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "participation.activity": ["title", "activity_type"],
};

const CLAIM_TYPE_LABEL = (claimType: string): string => {
  const [family, ...rest] = claimType.split(".");
  const tail = rest.join(" ").replace(/_/g, " ");
  const head = { credential: "Credential", skill: "Skill", attendance: "Attendance", participation: "Participation", attestation: "Attestation" }[family] ?? family;
  return tail ? `${head} — ${tail}` : head;
};

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  workshop: "Workshop", volunteer_shift: "Volunteer shift", training: "Training", class: "Class", networking: "Networking",
  mentoring: "Mentoring", creative_session: "Creative session", recreational: "Recreational", community: "Community",
};

/** A display title built ONLY from the fields allowed for the audience. */
export function claimTitle(claimType: string, value: Record<string, unknown> | null, audience: "owner" | "public"): string {
  const allowed = audience === "owner" ? Object.keys(value ?? {}) : (PUBLIC_VALUE_FIELDS[claimType] ?? []);
  const pick = (key: string) => (allowed.includes(key) && typeof value?.[key] === "string" ? (value[key] as string) : null);
  if (claimType === "participation.activity") {
    const title = pick("title");
    const type = pick("activity_type");
    return title ? `${title}${type ? ` (${ACTIVITY_TYPE_LABEL[type] ?? type})` : ""}` : "Completed a Flow activity";
  }
  const title = pick("title");
  return title ?? CLAIM_TYPE_LABEL(claimType);
}

export interface OwnerClaimView {
  id: string;
  claim_type: string;
  title: string;
  status: ClaimStatus;
  effective_at: string | null;
  expires_at: string | null;
  visibility: "private" | "public";
  sensitivity: Sensitivity;
}

export function projectClaimForOwner(row: ClaimRowInput, now: Date): OwnerClaimView {
  return {
    id: row.id,
    claim_type: row.claim_type,
    title: claimTitle(row.claim_type, row.value, "owner"),
    status: effectiveClaimStatus(row, now),
    effective_at: row.effective_at,
    expires_at: row.expires_at,
    visibility: row.visibility,
    sensitivity: row.sensitivity,
  };
}

export interface PublicClaimView {
  id: string;
  claim_type: string;
  title: string;
  effective_at: string | null;
  expires_at: string | null;
}

/**
 * One row of passport_public_claims(): the DATABASE's allow-listed public shape. Eligibility — the Passport
 * itself is public, the claim is public + verified + unexpired + standard-sensitivity + Passport-derived, and
 * the viewer isn't blocked — is decided there, where it cannot be bypassed; the raw passport_claims table is not
 * readable by the public at all (RLS cannot hide columns, so it must never be the public API).
 */
export interface PublicClaimRow {
  id: string;
  claim_type: string;
  effective_at: string | null;
  expires_at: string | null;
  public_value: Record<string, unknown> | null;
}

/**
 * The public face of a claim. The title is built ONLY from the fields allow-listed for the claim type
 * (default deny), so even a row that over-returned could not put a private field on screen. Deliberately carries
 * no status, sensitivity, source or reason — a public viewer is told a claim is verified by its very presence,
 * and nothing else.
 */
export function presentPublicClaim(row: PublicClaimRow): PublicClaimView {
  return { id: row.id, claim_type: row.claim_type, title: claimTitle(row.claim_type, row.public_value, "public"), effective_at: row.effective_at, expires_at: row.expires_at };
}

// ── credential-check view (consent-bound answers) ───────────────────────

export interface CredentialCheckAnswer {
  question: "claim_valid" | "credential_held";
  answer: boolean;
  /** The claim type or credential type the question was about. */
  about: string;
  expires_at: string | null;
}

export interface CredentialCheckView {
  items: Array<{ about: string; satisfied: boolean; expires_at: string | null }>;
  /** true only if EVERY asked item is satisfied — never a score. */
  all_satisfied: boolean;
}

export function buildCredentialCheckView(answers: CredentialCheckAnswer[]): CredentialCheckView {
  const items = answers.map((a) => ({ about: a.about, satisfied: a.answer, expires_at: a.answer ? a.expires_at : null }));
  return { items, all_satisfied: items.length > 0 && items.every((i) => i.satisfied) };
}
