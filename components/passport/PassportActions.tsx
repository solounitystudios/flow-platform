"use client";

import { useState, useTransition } from "react";
import { Share2, Copy, Download, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { QrCode } from "@/components/passport/QrCode";
import { togglePassportVisibilityAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function PassportActions({ username, initialPublic }: { username: string; initialPublic: boolean }) {
  const [copied, setCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [pending, startTransition] = useTransition();
  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${username}` : `/p/${username}`;

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "My FLOW Passport", url });
      } catch {
        /* user cancelled */
      }
    } else {
      handleCopy();
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadQr() {
    const canvas = document.querySelector<HTMLCanvasElement>("#passport-qr canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `flow-passport-${username}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function toggleVisibility() {
    const next = !isPublic;
    setIsPublic(next);
    startTransition(() => togglePassportVisibilityAction(next));
  }

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div id="passport-qr" className="flex items-center gap-4">
        <div className="rounded-2xl border border-ink-100 bg-white p-2 dark:border-ink-800">
          <QrCode value={url} size={96} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900 dark:text-white">Scan to view Passport</p>
          <p className="text-xs text-ink-400">flow.app/p/{username}</p>
          <button
            onClick={toggleVisibility}
            disabled={pending}
            className={cn(
              "mt-1.5 flex items-center gap-1 text-xs font-medium",
              isPublic ? "text-emerald-600" : "text-ink-400",
            )}
          >
            {isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {isPublic ? "Public — anyone with the link can view" : "Private — only you can view"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleDownloadQr}>
          <Download className="h-4 w-4" /> Save QR
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}
        </Button>
        <Button size="sm" onClick={handleShare}>
          <Share2 className="h-4 w-4" /> Share
        </Button>
      </div>
    </div>
  );
}
