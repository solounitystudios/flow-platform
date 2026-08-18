"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function RedeemButton({ cost, balance }: { cost: number; balance: number }) {
  const [redeemed, setRedeemed] = useState(false);
  const canAfford = balance >= cost;

  if (redeemed) {
    return (
      <Button size="sm" variant="outline" disabled className="shrink-0 border-emerald-300 text-emerald-600">
        <Check className="h-3.5 w-3.5" /> Redeemed
      </Button>
    );
  }

  return (
    <Button size="sm" variant={canAfford ? "primary" : "outline"} disabled={!canAfford} onClick={() => setRedeemed(true)} className="shrink-0">
      {canAfford ? "Redeem" : "Not enough"}
    </Button>
  );
}
