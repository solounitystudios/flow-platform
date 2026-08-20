"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function MessageButton({
  start,
  label = "Message",
  size = "sm",
}: {
  start: () => Promise<{ error?: string; conversationId?: string }>;
  label?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await start();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.conversationId) router.push(`/messages/${result.conversationId}`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size={size} variant="outline" onClick={handleClick} disabled={pending} className="shrink-0">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} {label}
      </Button>
      {error && <p className="max-w-[160px] text-right text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
