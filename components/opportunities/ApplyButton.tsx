"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ApplyButton({ full = false }: { full?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "applied">("idle");

  if (state === "applied") {
    return (
      <Button variant="outline" size="lg" fullWidth={full} disabled className="border-emerald-300 text-emerald-600">
        <Check className="h-4 w-4" /> Applied — you&apos;ll hear back soon
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
        setTimeout(() => setState("applied"), 600);
      }}
    >
      {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {state === "loading" ? "Applying…" : "Apply now"}
    </Button>
  );
}
