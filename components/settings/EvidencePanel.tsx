"use client";

import { useActionState, useState } from "react";
import { Plus, Clock, ShieldCheck, XCircle, AlertTriangle, Ban, Link2, Check } from "lucide-react";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitEvidenceAction, type EvidenceActionState } from "@/lib/verification-actions";
import type { Verification, CredentialType, MyCreativeProject, ApplicationEvidenceContext } from "@/lib/data/verifications";
import type { Tables } from "@/lib/database.types";

const initialState: EvidenceActionState = {};

const STATUS_ICON = {
  pending: { icon: Clock, className: "text-ink-400" },
  verified: { icon: ShieldCheck, className: "text-verified-500" },
  rejected: { icon: XCircle, className: "text-red-500" },
  expired: { icon: AlertTriangle, className: "text-amber-500" },
  revoked: { icon: Ban, className: "text-red-500" },
} as const;

export function EvidencePanel({
  verifications,
  credentialTypes,
  skills,
  creativeProjects,
  defaultTitle,
  applicationEvidence,
}: {
  verifications: Verification[];
  credentialTypes: CredentialType[];
  skills: Tables<"skills">[];
  creativeProjects: MyCreativeProject[];
  defaultTitle?: string;
  /** Set when arriving from WorkCard.tsx's "Submit evidence for this gig"
   * link (?evidenceApplicationId=...). Server-derived — never trust the
   * query string itself for identity, only which application to look up
   * (see getApplicationEvidenceContext, lib/data/verifications.ts). When
   * present and eligible, the reference/witness are fixed to that
   * application and the skill/creative-project/witness-username inputs are
   * hidden entirely rather than left as a bypassable no-op. */
  applicationEvidence?: ApplicationEvidenceContext | null;
}) {
  const isApplicationClaim = !!applicationEvidence?.eligible;
  const [showForm, setShowForm] = useState(!!defaultTitle || isApplicationClaim);
  const [source, setSource] = useState<"self_reported" | "external_link">("self_reported");
  const [state, formAction] = useActionState(submitEvidenceAction, initialState);
  const typeLabel = new Map(credentialTypes.map((t) => [t.key, t.label]));

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {verifications.map((v) => {
          const cfg = STATUS_ICON[v.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.pending;
          const Icon = cfg.icon;
          return (
            <li key={v.id} className="rounded-xl border border-ink-200 p-3 text-sm dark:border-ink-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink-900 dark:text-white">{v.title}</p>
                  <p className="text-xs text-ink-400">
                    {typeLabel.get(v.credential_type ?? "") ?? "Uncategorized"} · {v.source === "external_link" ? "External link" : "Self-reported"}
                  </p>
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium capitalize ${cfg.className}`}>
                  <Icon className="h-3.5 w-3.5" /> {v.status}
                </span>
              </div>
              {v.status === "pending" && v.witness_profile_id && (
                <ConfirmationLinkRow verificationId={v.id} title={v.title} typeLabel={typeLabel.get(v.credential_type ?? "") ?? ""} />
              )}
            </li>
          );
        })}
        {verifications.length === 0 && <p className="text-sm text-ink-400">No evidence submitted yet.</p>}
      </ul>

      {applicationEvidence && !applicationEvidence.eligible && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          That gig isn&apos;t eligible for evidence yet — it must be your own completed work.
        </p>
      )}

      {showForm ? (
        <form action={formAction} className="space-y-3 rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
          {isApplicationClaim && applicationEvidence ? (
            <>
              <input type="hidden" name="application_id" value={applicationEvidence.application_id} />
              <input type="hidden" name="credential_type" value="work" />
              <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                <p>
                  For: <span className="font-medium text-ink-900 dark:text-white">{applicationEvidence.opportunity_title}</span>
                  {applicationEvidence.organization_name ? ` at ${applicationEvidence.organization_name}` : ""}
                </p>
                <p className="mt-0.5">
                  Will be confirmed by: <span className="font-medium text-ink-900 dark:text-white">{applicationEvidence.confirmer_name ?? "the business that posted this opportunity"}</span>
                </p>
              </div>
              <Input
                label="Title"
                name="title"
                defaultValue={`${applicationEvidence.opportunity_title}${applicationEvidence.organization_name ? ` at ${applicationEvidence.organization_name}` : ""}`}
                required
              />
            </>
          ) : (
            <>
              <Select label="Credential type" name="credential_type" required>
                {credentialTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Input label="Title" name="title" placeholder="e.g. ServSafe certification" defaultValue={defaultTitle} required />
              <Select label="Related skill (optional)" name="skill_id">
                <option value="">None</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select label="Related creative project (optional)" name="creative_project_id">
                <option value="">None</option>
                {creativeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </>
          )}
          <Select label="Source" name="source" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="self_reported">Self-reported</option>
            <option value="external_link">External link</option>
          </Select>
          {source === "external_link" && <Input label="Evidence URL" name="evidence_url" type="url" required />}
          <Textarea label="Notes (optional)" name="evidence_note" />
          {!isApplicationClaim && (
            <Input
              label="Ask a collaborator to confirm (optional)"
              name="witness_username"
              placeholder="their FLOW username"
              hint="They'll get a link to confirm your claim directly — this doesn't replace admin review, it's an extra path to get verified."
            />
          )}
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingLabel="Submitting…">
              Submit for review
            </SubmitButton>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-ink-400 hover:text-ink-600">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-ink-300 px-3 py-2 text-sm font-medium text-ink-500 hover:border-flow-400 hover:text-flow-600 dark:border-ink-700"
        >
          <Plus className="h-4 w-4" /> Submit evidence
        </button>
      )}
    </div>
  );
}

/** The claim's own row is readable by RLS only to the claimant and admins —
 * a named witness can't browse to it on their own, so the claimant is the
 * one who has to hand them the link. The link's query params are
 * display-only context for the witness's convenience; the confirm page
 * never trusts them for anything security-relevant — authorization happens
 * entirely inside confirm_verification_as_collaborator(), which checks
 * witness_profile_id server-side regardless of what the URL says. */
function ConfirmationLinkRow({ verificationId, title, typeLabel }: { verificationId: string; title: string | null; typeLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const params = new URLSearchParams();
    if (title) params.set("title", title);
    if (typeLabel) params.set("type", typeLabel);
    const query = params.toString();
    const url = `${window.location.origin}/passport/confirm/${verificationId}${query ? `?${query}` : ""}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="mt-2 flex items-center gap-1 text-xs font-medium text-flow-600 hover:text-flow-700"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      {copied ? "Link copied" : "Copy confirmation link for your collaborator"}
    </button>
  );
}
