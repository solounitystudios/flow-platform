"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { redeemRewardAction } from "@/lib/actions";

export function RealRedeemButton({ rewardId, cost, balance, isMock }: { rewardId: string; cost: number; balance: number; isMock: boolean }) {
  const [redeemed, setRedeemed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canAfford = balance >= cost;

  if (redeemed) {
    return (
      <Button size="sm" variant="outline" disabled className="shrink-0 border-emerald-300 text-emerald-600">
        <Check className="h-3.5 w-3.5" /> Redeemed
      </Button>
    );
  }

  if (isMock) {
    return (
      <Button size="sm" variant="outline" disabled className="shrink-0 text-ink-400">
        Coming soon
      </Button>
    );
  }

  function handleRedeem() {
    setError(null);
    startTransition(async () => {
      const result = await redeemRewardAction(rewardId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.result?.ok) {
        setRedeemed(true);
      } else {
        setError("Couldn't redeem this reward right now.");
      }
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button size="sm" variant={canAfford ? "primary" : "outline"} disabled={!canAfford || pending} onClick={handleRedeem}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {pending ? "Redeeming…" : canAfford ? "Redeem" : "Not enough"}
      </Button>
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-red-600">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
