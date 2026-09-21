import type { ClaimExplanation, ClaimStatus, VerificationMethod } from "@flow/passport-contracts";

/**
 * Turns the (already viewer-scoped) explanation the database returned into
 * plain language. It ADDS no facts and reveals nothing the response didn't
 * contain — so a public viewer's narrative can only ever say what a public
 * viewer was allowed to be told.
 */

/** Deliberately descriptive and NOT ordered: methods are different kinds of assurance, not a score. */
export const VERIFICATION_METHOD_LABEL: Record<VerificationMethod, string> = {
  self_attested: "Self-reported (not independently verified)",
  peer_attested: "Confirmed by a peer",
  employer_verified: "Verified by an employer",
  organization_verified: "Verified by an organization",
  licensed_provider: "Confirmed by a licensed provider",
  education_provider: "Confirmed by an education provider",
  platform_verified: "Verified by Flow",
  government_issued: "Issued by a government source",
  external_source_verified: "Confirmed by an external source",
};

export interface StatusPresentation {
  label: string;
  tone: "verified" | "warning" | "neutral" | "danger";
}

const STATUS_LABEL: Record<ClaimStatus, StatusPresentation> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted — not yet verified", tone: "neutral" },
  under_review: { label: "Waiting for a reviewer", tone: "neutral" },
  verified: { label: "Verified", tone: "verified" },
  rejected: { label: "Not verified", tone: "danger" },
  expired: { label: "Expired", tone: "warning" },
  revoked: { label: "Withdrawn", tone: "danger" },
  superseded: { label: "Replaced by a newer claim", tone: "neutral" },
  stale: { label: "Source not recently confirmed", tone: "warning" },
  disconnected: { label: "Source disconnected", tone: "warning" },
};

/** The one place status wording lives, so a claims list and its "why" page can never disagree. */
export const claimStatusPresentation = (status: ClaimStatus): StatusPresentation => STATUS_LABEL[status];

const SOURCE_LABEL = (system: string): string => {
  if (system === "flow_platform") return "Flow's own records";
  if (system === "manual") return "Added by the member";
  if (system === "flow_capture") return "Flow Capture";
  if (system.startsWith("external:")) return `An external source (${system.slice("external:".length)})`;
  return system;
};

const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  document: "Document",
  photo: "Photo",
  video: "Video",
  audio: "Audio",
  form: "Form",
  signed_record: "Signed record",
  checkin: "Check-in",
  activity_outcome: "Flow activity record",
  api_record: "Record from a connected system",
  link: "Link",
  note: "Note",
};

/** Human wording for a machine reason code, e.g. `source_record` -> "Confirmed from Flow's own record". */
const REASON_LABEL: Record<string, string> = {
  source_record: "Confirmed from the source record",
  documents_checked: "Documents were checked",
  insufficient_evidence: "There wasn't enough evidence",
  issued_in_error: "It was issued in error",
  withdrawn_by_subject: "The member withdrew it",
  window_closed: "Its validity window closed",
};
export const reasonLabel = (code: string): string => REASON_LABEL[code] ?? code.replace(/_/g, " ");

/** "verified by Buffalo Welding Guild", "confirmed by a peer" — natural, per-method wording. */
function methodPhrase(method: VerificationMethod, verifier: string | null): string {
  switch (method) {
    case "platform_verified":
      return "verified by Flow";
    case "organization_verified":
      return `verified by ${verifier ?? "an organization"}`;
    case "employer_verified":
      return `verified by ${verifier ?? "an employer"}`;
    case "peer_attested":
      return `confirmed by ${verifier ?? "a peer"}`;
    case "licensed_provider":
      return `confirmed by ${verifier ?? "a licensed provider"}`;
    case "education_provider":
      return `confirmed by ${verifier ?? "an education provider"}`;
    case "government_issued":
      return `issued by ${verifier ?? "a government source"}`;
    case "external_source_verified":
      return `confirmed by ${verifier ?? "an external source"}`;
    case "self_attested":
      return "stated by the member (not independently verified)";
  }
}

export interface ExplanationStep {
  label: string;
  detail: string;
}

export interface ExplanationView {
  status: StatusPresentation;
  /** One-sentence answer to "why does Passport show this?" */
  headline: string;
  steps: ExplanationStep[];
  /** Evidence lines (owner/admin/reviewer only); empty for the public. */
  evidenceLines: string[];
  /** Shown only to owner/admin: what happened, in order. */
  timeline: Array<{ what: string; at: string }>;
}

const date = (iso: string | null): string | null => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null);

export function explainClaim(explanation: ClaimExplanation): ExplanationView {
  const { claim, verification, issuer, source, evidence } = explanation;
  const status = claimStatusPresentation(claim.effective_status);
  const steps: ExplanationStep[] = [];

  steps.push({ label: "Source", detail: SOURCE_LABEL(source.system) });

  if (issuer.kind === "subject") steps.push({ label: "Stated by", detail: "The member themselves" });
  else if (issuer.kind === "external") steps.push({ label: "Issued by", detail: issuer.label ?? "An external issuer" });
  else steps.push({ label: "Issued by", detail: issuer.label ?? (issuer.entity_type === "organization" ? "An organization" : "A person") });

  const evidenceLines: string[] = [];
  if (Array.isArray(evidence)) {
    steps.push({ label: "Evidence", detail: evidence.length === 0 ? "None attached" : `${evidence.length} item${evidence.length === 1 ? "" : "s"}` });
    for (const item of evidence) {
      const when = date(item.captured_at);
      evidenceLines.push(`${EVIDENCE_TYPE_LABEL[item.evidence_type] ?? item.evidence_type}${when ? ` · ${when}` : ""}${item.sensitivity !== "standard" ? " · restricted" : ""}`);
    }
  } else {
    steps.push({ label: "Evidence", detail: evidence.count === 0 ? "None attached" : `${evidence.count} item${evidence.count === 1 ? "" : "s"} (not shown)` });
  }

  if (verification) {
    const who = verification.verifier.label;
    steps.push({ label: "Verification", detail: VERIFICATION_METHOD_LABEL[verification.method] + (who ? ` — ${who}` : "") });
    const decided = date(verification.decided_at);
    if (decided) steps.push({ label: "Decided", detail: decided });
    if (verification.reason_code) steps.push({ label: "Basis", detail: reasonLabel(verification.reason_code) });
  } else if (explanation.pending_verifications.length > 0) {
    steps.push({ label: "Verification", detail: `Waiting on ${explanation.pending_verifications.length} reviewer${explanation.pending_verifications.length === 1 ? "" : "s"}` });
  } else {
    steps.push({ label: "Verification", detail: "No one has verified this" });
  }

  const validUntil = date(claim.expires_at);
  if (validUntil) steps.push({ label: claim.effective_status === "expired" ? "Expired" : "Valid until", detail: validUntil });
  if (claim.status_reason_code && claim.effective_status !== "verified") steps.push({ label: "Reason", detail: reasonLabel(claim.status_reason_code) });

  const headline = (() => {
    if (verification && (claim.effective_status === "verified" || claim.effective_status === "expired")) {
      const phrase = methodPhrase(verification.method, verification.verifier.label);
      return claim.effective_status === "expired" ? `This was ${phrase}, but it has since expired.` : `Passport shows this because it was ${phrase}.`;
    }
    if (claim.effective_status === "verified") return "Passport shows this because it was verified.";
    return `This is ${status.label.toLowerCase()}.`;
  })();

  return {
    status,
    headline,
    steps,
    evidenceLines,
    timeline: explanation.history.map((h) => ({ what: h.type.replace(".", " · ").replace(/_/g, " "), at: h.at })),
  };
}
