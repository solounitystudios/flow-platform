import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/profile";
import { getMatchRecommendations, hasAnyRecommendations } from "@/lib/data/recommendations";
import { createClient } from "@/lib/supabase/server";
import { RecommendationFeed } from "@/components/recommendations/RecommendationFeed";

export default async function RecommendationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const hasAny = await hasAnyRecommendations(user.id);
  if (!hasAny) {
    // First visit with nothing generated yet — run the deterministic
    // engine once so the page isn't empty on arrival. Every subsequent
    // visit reads persisted rows only; this never recomputes on every view.
    const supabase = await createClient();
    await supabase.rpc("generate_match_recommendations", { p_profile_id: user.id });
  }

  const grouped = await getMatchRecommendations(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Recommended for you</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Every recommendation is grounded in your goals, skills, and activity — never a black box. Set goals in{" "}
          <a href="/settings" className="text-flow-600 hover:underline">
            Settings
          </a>{" "}
          to get better matches.
        </p>
      </div>
      <RecommendationFeed grouped={grouped} />
    </div>
  );
}
