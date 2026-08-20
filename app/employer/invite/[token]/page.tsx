import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/marketing/AuthShell";
import { Button } from "@/components/ui/Button";
import { InviteFlow } from "./InviteFlow";

export default async function EmployerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nextPath = `/employer/invite/${token}`;

  if (!user) {
    return (
      <AuthShell
        title="You're invited to FLOW"
        subtitle="Log in or create a free account to accept your invitation."
        footer="This invitation is tied to the account you use to accept it."
      >
        <div className="flex flex-col gap-3">
          <Button href={`/login?next=${encodeURIComponent(nextPath)}`} fullWidth>
            Log in
          </Button>
          <Button href={`/signup?next=${encodeURIComponent(nextPath)}`} variant="outline" fullWidth>
            Create an account
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="You're invited to FLOW"
      subtitle="Accept your invitation, then set up your business."
      footer={
        <>
          Not the right account? <Link href="/settings" className="font-medium text-flow-600">Switch in Settings</Link>
        </>
      }
    >
      <InviteFlow token={token} />
    </AuthShell>
  );
}
