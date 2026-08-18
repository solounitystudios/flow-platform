"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Ticket, Users2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { registerForEventAction, cancelEventRegistrationAction } from "@/lib/actions";

interface Attendance {
  id: string;
  status: string;
}

export function RealRegisterButton({
  eventId,
  isOwner,
  priceCents,
  initialAttendance,
}: {
  eventId: string;
  isOwner: boolean;
  priceCents: number;
  initialAttendance: Attendance | null;
}) {
  const [attendance, setAttendance] = useState(initialAttendance);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isOwner) {
    return (
      <Button href={`/business/events/${eventId}`} size="lg" fullWidth>
        <Users2 className="h-4 w-4" /> Manage attendees
      </Button>
    );
  }

  function handleRegister() {
    setError(null);
    startTransition(async () => {
      const result = await registerForEventAction(eventId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAttendance({ id: result.attendanceId ?? "", status: "registered" });
    });
  }

  function handleCancel() {
    if (!attendance) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelEventRegistrationAction(attendance.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAttendance({ ...attendance, status: "cancelled" });
    });
  }

  return (
    <div className="space-y-2">
      {!attendance && (
        <Button size="lg" fullWidth disabled={pending} onClick={handleRegister}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
          {pending ? "Reserving…" : priceCents === 0 ? "Get free ticket" : `Get ticket · $${(priceCents / 100).toFixed(2)}`}
        </Button>
      )}

      {attendance?.status === "registered" && (
        <>
          <Button href="/tickets" variant="outline" size="lg" fullWidth className="border-emerald-300 text-emerald-600">
            <Check className="h-4 w-4" /> You&apos;re registered — see it in Tickets
          </Button>
          <button onClick={handleCancel} disabled={pending} className="w-full text-center text-sm font-medium text-ink-400 hover:text-red-500">
            Cancel registration
          </button>
        </>
      )}

      {attendance?.status === "attended" && (
        <Button variant="outline" size="lg" fullWidth disabled className="border-emerald-300 text-emerald-600">
          <Check className="h-4 w-4" /> You checked in — thanks for coming!
        </Button>
      )}

      {attendance?.status === "cancelled" && (
        <Button variant="outline" size="lg" fullWidth disabled className="text-ink-400">
          <X className="h-4 w-4" /> You cancelled your registration
        </Button>
      )}

      {attendance?.status === "no_show" && (
        <Button variant="outline" size="lg" fullWidth disabled className="text-ink-400">
          Marked as no-show for this event
        </Button>
      )}

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
