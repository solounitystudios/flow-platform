import { Coins, Gift } from "lucide-react";
import { getCurrentUser, getFullProfile } from "@/lib/data/profile";
import { getRewardsCatalog, getLedgerHistory } from "@/lib/data/rewards";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RealRedeemButton } from "@/components/rewards/RealRedeemButton";
import { relativeTime, cn } from "@/lib/utils";

export default async function RewardsPage() {
  const user = await getCurrentUser();
  const full = user ? await getFullProfile(user.id) : null;
  const points = full?.passport.flow_points ?? 0;

  const [catalog, ledger] = await Promise.all([getRewardsCatalog(), user ? getLedgerHistory(user.id) : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-flow-radial p-6 text-white sm:p-7">
        <div className="flex items-center gap-2 text-flow-200">
          <Coins className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">FLOW Points balance</span>
        </div>
        <p className="mt-2 text-4xl font-black">{points.toLocaleString()}</p>
        <p className="mt-1 text-sm text-flow-200">Earn points for every completed gig, event check-in, and verified skill.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">Redeem rewards</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.map((r) => (
            <Card key={r.id}>
              <CardBody className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900 dark:text-white">{r.title}</p>
                  <p className="text-xs text-ink-400">{r.partner}</p>
                  <p className="mt-1.5 flex items-center gap-1 text-sm font-bold text-flow-600">
                    <Gift className="h-3.5 w-3.5" /> {r.points_required} pts
                  </p>
                </div>
                <RealRedeemButton rewardId={r.id} cost={r.points_required} balance={points} isMock={r.source === "mock"} />
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">History</h2>
        <Card>
          <CardHeader>
            <span className="text-sm text-ink-400">Recent activity</span>
          </CardHeader>
          {ledger.length > 0 ? (
            <div className="divide-y divide-ink-100 px-4 dark:divide-ink-800">
              {ledger.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{entry.description ?? entry.entry_type}</p>
                    <p className="text-xs text-ink-400">{relativeTime(entry.created_at)}</p>
                  </div>
                  <span className={cn("text-sm font-bold", entry.points >= 0 ? "text-flow-600" : "text-ink-400")}>
                    {entry.points >= 0 ? "+" : ""}
                    {entry.points} pts
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 pb-4">
              <p className="text-sm text-ink-400">No activity yet — complete a gig or check into an event to start earning.</p>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
