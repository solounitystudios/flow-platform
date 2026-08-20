"use client";

import { useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/marketing/AuthShell";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { signUpAction, type ActionState } from "@/lib/actions";

const initialState: ActionState = {};

function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  if (state.needsEmailConfirmation) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="Almost there."
        footer={
          <>
            Already confirmed? <Link href={loginHref} className="font-medium text-flow-600">Log in</Link>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <MailCheck className="h-10 w-10 text-flow-600" />
          <p className="text-sm text-ink-600 dark:text-ink-300">
            We sent a confirmation link to your email. Click it to activate your FLOW account — it will pick up right where you left off.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your FLOW account"
      subtitle="Free forever. Takes about a minute."
      footer={
        <>
          Already on FLOW? <Link href={loginHref} className="font-medium text-flow-600">Log in</Link>
        </>
      }
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Input label="Full name" name="full_name" placeholder="Jordan Martinez" required autoComplete="name" />
        <Input label="Username" name="username" placeholder="jmartinez" hint="Letters, numbers, underscores only." autoComplete="username" />
        <Input label="Email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
        <Input label="Password" name="password" type="password" placeholder="At least 8 characters" required autoComplete="new-password" minLength={8} />

        {state.error && (
          <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
          </p>
        )}

        <SubmitButton fullWidth pendingLabel="Creating account…">
          Create account
        </SubmitButton>

        <p className="text-center text-xs text-ink-400">
          By joining, you agree FLOW&apos;s core membership is always free. Premium features may be offered separately.
        </p>
      </form>
    </AuthShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
