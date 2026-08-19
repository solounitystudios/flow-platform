import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/marketing/AuthShell";
import { Button } from "@/components/ui/Button";
import { ReferralFlow } from "./ReferralFlow";

// An unauthenticated visitor gets only a login/signup CTA with `next`
// preserved — never a pre-auth validity check, so there's no separate
// endpoint that could leak whether a token is valid/expired/claimed to
// someone not yet signed in. accept_referral() (which requires auth.uid())
// is the only thing that ever evaluates token validity.
export default async function ReferralPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nextPath = `/r/${token}`;

  if (!user) {
    return (
      <AuthShell title="You're invited to FLOW" subtitle="Log in or create a free account to accept your referral." footer="This referral is tied to the account you use to accept it.">
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
    <AuthShell title="You're invited to FLOW" subtitle="Accept your referral to connect with the friend who sent it." footer="This referral is tied to the account you use to accept it.">
      <ReferralFlow token={token} />
    </AuthShell>
  );
}
