"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Phase = "loading" | "enroll" | "verify-existing" | "error" | "done";

/**
 * AAL2 on-ramp for admins. Never fakes or bypasses verification — every
 * path here ends in a real TOTP challenge against Supabase Auth. If the
 * account already has a verified factor, this goes straight to the
 * challenge instead of enrolling a second one.
 */
export function MfaEnrollment() {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (listError) {
        setError(listError.message);
        setPhase("error");
        return;
      }

      // data.totp only ever contains verified factors (per @supabase/auth-js's
      // own typing) — data.all is the one that includes unverified ones too.
      const totpFactors = data.all.filter((f) => f.factor_type === "totp");
      const verifiedTotp = totpFactors.find((f) => f.status === "verified");
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setPhase("verify-existing");
        return;
      }

      const unverified = totpFactors.find((f) => f.status === "unverified");
      if (unverified) {
        await supabase.auth.mfa.unenroll({ factorId: unverified.id });
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (cancelled) return;
      if (enrollError) {
        setError(enrollError.message);
        setPhase("error");
        return;
      }

      setFactorId(enrolled.id);
      setQrCode(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setPhase("enroll");
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setSubmitting(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setError("That code didn't match. Try again.");
      setSubmitting(false);
      return;
    }

    // Full reload so every server component re-reads the refreshed
    // session cookie and sees aal2 immediately.
    window.location.href = "/admin";
  }

  if (phase === "loading") {
    return <p className="text-sm text-ink-400">Loading…</p>;
  }

  if (phase === "error") {
    return (
      <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
        <AlertCircle className="h-4 w-4 shrink-0" /> {error ?? "Something went wrong. Try again."}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {phase === "enroll" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Scan this QR code with an authenticator app (1Password, Authy, Google Authenticator), then enter the 6-digit code it shows you.
          </p>
          {qrCode && (
            <div className="flex justify-center rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-700">
              {/* Supabase returns the TOTP QR as an inline SVG data URI. */}
              <img src={qrCode} alt="TOTP enrollment QR code" width={200} height={200} />
            </div>
          )}
          {secret && (
            <p className="break-all rounded-lg bg-ink-100 px-3 py-2 text-center font-mono text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              Can&apos;t scan? Enter manually: {secret}
            </p>
          )}
        </div>
      )}

      {phase === "verify-existing" && (
        <p className="flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-300">
          <ShieldCheck className="h-4 w-4 text-flow-600" /> You already have an authenticator set up — enter a current code to continue.
        </p>
      )}

      <form onSubmit={handleVerify} className="space-y-3">
        <Input
          label="6-digit code"
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
        />

        {error && (
          <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <Button type="submit" fullWidth disabled={submitting || code.length !== 6}>
          {submitting ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>
    </div>
  );
}
