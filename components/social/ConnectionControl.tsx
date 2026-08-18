"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  sendConnectionRequestAction,
  acceptConnectionRequestAction,
  declineConnectionRequestAction,
  cancelConnectionRequestAction,
  removeConnectionAction,
} from "@/lib/actions";
import type { ConnectionUiStatus } from "@/lib/data/connections";

export function ConnectionControl({
  personId,
  personName,
  initialStatus,
  initialConnectionId,
  size = "sm",
  onStatusChange,
}: {
  personId: string;
  personName: string;
  initialStatus: ConnectionUiStatus;
  initialConnectionId: string | null;
  size?: "sm" | "md";
  onStatusChange?: (status: ConnectionUiStatus, connectionId: string | null) => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [connectionId, setConnectionId] = useState(initialConnectionId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit(next: ConnectionUiStatus, id: string | null) {
    setStatus(next);
    setConnectionId(id);
    onStatusChange?.(next, id);
  }

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const result = await sendConnectionRequestAction(personId);
      if (result.error) {
        setError(result.error);
        return;
      }
      commit(result.autoAccepted ? "connected" : "pending_outgoing", result.connectionId ?? null);
    });
  }

  function handleAccept() {
    if (!connectionId) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptConnectionRequestAction(connectionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      commit("connected", connectionId);
    });
  }

  function handleDecline() {
    if (!connectionId) return;
    setError(null);
    startTransition(async () => {
      const result = await declineConnectionRequestAction(connectionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      commit("suggested", null);
    });
  }

  function handleCancel() {
    if (!connectionId) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelConnectionRequestAction(connectionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      commit("suggested", null);
    });
  }

  function handleRemove() {
    if (!connectionId) return;
    if (!confirm(`Remove ${personName} from your connections?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeConnectionAction(connectionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      commit("suggested", null);
    });
  }

  if (status === "blocked") {
    return <span className="text-xs font-medium text-ink-300">Blocked</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "suggested" && (
        <Button size={size} variant="outline" onClick={handleConnect} disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Connect
        </Button>
      )}

      {status === "pending_outgoing" && (
        <div className="flex shrink-0 items-center gap-2">
          <Button size={size} variant="outline" disabled className="shrink-0">
            Pending
          </Button>
          <button onClick={handleCancel} disabled={pending} className="text-xs font-medium text-ink-400 hover:text-red-500">
            Cancel
          </button>
        </div>
      )}

      {status === "pending_incoming" && (
        <div className="flex shrink-0 gap-1.5">
          <Button size={size} onClick={handleAccept} disabled={pending}>
            <Check className="h-3.5 w-3.5" /> Accept
          </Button>
          <Button size={size} variant="ghost" onClick={handleDecline} disabled={pending} aria-label="Decline request">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {status === "connected" && (
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-xs font-medium text-ink-400">Connected</span>
          <button onClick={handleRemove} disabled={pending} className="text-xs font-medium text-ink-300 hover:text-red-500">
            Remove
          </button>
        </div>
      )}

      {error && <p className="max-w-[160px] text-right text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
