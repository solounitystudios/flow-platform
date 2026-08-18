"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Star } from "lucide-react";
import { Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { leaveRecommendationAction, type ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

export function RecommendationForm({
  opportunityId,
  recipientId,
  recipientName,
  onDone,
}: {
  opportunityId: string;
  recipientId: string;
  recipientName: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(leaveRecommendationAction, initialState);
  const [rating, setRating] = useState(5);

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <input type="hidden" name="recipient_id" value={recipientId} />
      <input type="hidden" name="rating" value={rating} />

      <div>
        <p className="mb-1 text-xs font-medium text-ink-500 dark:text-ink-400">Rating</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star className={cn("h-5 w-5", n <= rating ? "fill-gold-500 text-gold-500" : "text-ink-200 dark:text-ink-700")} />
            </button>
          ))}
        </div>
      </div>

      <Textarea name="body" placeholder={`How was working with ${recipientName}? Would you hire them again?`} rows={3} required minLength={10} />

      {state.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {state.error}
        </p>
      )}

      <SubmitButton size="sm" pendingLabel="Posting…">
        Post recommendation
      </SubmitButton>
    </form>
  );
}
