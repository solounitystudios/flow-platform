"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { checkInByCodeAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const REASON_TEXT: Record<string, string> = {
  event_not_found: "Event not found.",
  not_authorized: "You're not authorized to check in attendees for this event.",
  no_identifier: "Enter a ticket code.",
  invalid_code: "That code doesn't match a ticket for this event.",
  wrong_event: "That ticket is for a different event.",
  cancelled: "That registration was cancelled.",
  no_show: "That attendee was already marked as a no-show.",
  already_checked_in: "That ticket is already checked in.",
};

export function CheckInForm({ eventId }: { eventId: string }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await checkInByCodeAction(eventId, trimmed.toUpperCase());
      if (result.error) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      if (result.result?.ok) {
        setMessage({ ok: true, text: result.result.attendee_name ? `${result.result.attendee_name} checked in.` : "Checked in." });
        setCode("");
        router.refresh();
      } else {
        setMessage({ ok: false, text: REASON_TEXT[result.result?.reason ?? ""] ?? "Couldn't check in that code." });
      }
    });
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="FLOW-8832-KQ"
          className="flex-1 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm uppercase outline-none focus:border-flow-500 focus:ring-2 focus:ring-flow-500/20 dark:border-ink-700 dark:bg-ink-900"
        />
        <Button type="submit" disabled={pending}>
          <ScanLine className="h-4 w-4" /> {pending ? "Checking…" : "Check in"}
        </Button>
      </form>
      {message && <p className={cn("text-sm", message.ok ? "text-emerald-600" : "text-red-600")}>{message.text}</p>}
    </div>
  );
}
