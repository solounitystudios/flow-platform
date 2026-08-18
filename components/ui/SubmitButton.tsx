"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

export function SubmitButton({ children, pendingLabel, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingLabel ?? "Please wait…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
