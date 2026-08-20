import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin, isSafeInternalPath } from "@/lib/url";

// PKCE callback for Supabase Auth email links (signup confirmation, password
// reset, etc.) — @supabase/ssr's browser/server clients are both hard-set to
// flowType: "pkce", so the confirmation link lands here with a `?code=`
// rather than a token in the URL fragment.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const next = isSafeInternalPath(rawNext) ? rawNext : "/onboarding";
  const origin = await getRequestOrigin();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
