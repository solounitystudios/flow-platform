"use client";

import { useState } from "react";
import { Check, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function RegisterButton({ price_cents, full = false }: { price_cents: number; full?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "registered">("idle");

  if (state === "registered") {
    return (
      <Button variant="outline" size="lg" fullWidth={full} disabled className="border-emerald-300 text-emerald-600">
        <Check className="h-4 w-4" /> You&apos;re registered — see it in Tickets
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      fullWidth={full}
      disabled={state === "loading"}
      onClick={() => {
        setState("loading");
        setTimeout(() => setState("registered"), 600);
      }}
    >
      {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
      {state === "loading" ? "Reserving…" : price_cents === 0 ? "Get free ticket" : `Get ticket · $${(price_cents / 100).toFixed(2)}`}
    </Button>
  );
}
