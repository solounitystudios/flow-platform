"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Input, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import { acceptInvitationAction, createEmployerOrganizationAction, type OnboardingState } from "./actions";

const initialOnboarding: OnboardingState = {};

export function InviteFlow({ token }: { token: string }) {
  const [phase, setPhase] = useState<"pending" | "accepted">("pending");
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [orgState, orgAction] = useActionState(createEmployerOrganizationAction, initialOnboarding);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    const result = await acceptInvitationAction(token);
    setAccepting(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong. Try again.");
      return;
    }
    setBusinessName(result.businessName ?? null);
    setPhase("accepted");
  }

  if (phase === "accepted") {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Invitation accepted{businessName ? ` for ${businessName}` : ""}. Set up your organization to finish.
        </p>
        <form action={orgAction} className="space-y-4">
          <Input label="Business name" name="name" defaultValue={businessName ?? ""} required />
          <Textarea label="Description" name="description" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" name="city" defaultValue="Buffalo" />
            <Input label="State" name="state" defaultValue="NY" />
          </div>
          {orgState.error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
              <AlertCircle className="h-4 w-4 shrink-0" /> {orgState.error}
            </p>
          )}
          <SubmitButton fullWidth pendingLabel="Creating…">
            Create organization
          </SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      <Button fullWidth disabled={accepting} onClick={handleAccept}>
        {accepting ? "Accepting…" : "Accept invitation"}
      </Button>
    </div>
  );
}
