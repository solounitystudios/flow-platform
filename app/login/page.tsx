"use client";

import { useActionState } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AuthShell } from "@/components/marketing/AuthShell";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { signInAction, type ActionState } from "@/lib/actions";

const initialState: ActionState = {};

function LoginForm() {
  const [state, formAction] = useActionState(signInAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const signupHref = next && next !== "/dashboard" ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your FLOW Passport."
      footer={
        <>
          New to FLOW? <Link href={signupHref} className="font-medium text-flow-600">Create an account</Link>
        </>
      }
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Input label="Email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
        <Input label="Password" name="password" type="password" placeholder="Your password" required autoComplete="current-password" />

        {state.error && (
          <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
          </p>
        )}

        <SubmitButton fullWidth pendingLabel="Logging in…">
          Log in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
