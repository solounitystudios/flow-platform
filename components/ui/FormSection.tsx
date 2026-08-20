import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Heading + description + fieldset grouping for long admin forms, so they
 * read as a handful of understandable sections instead of one wall of
 * fields. Uses a real `<fieldset>`/`<legend>` pair for a11y (screen readers
 * announce the group's purpose), styled to look like a normal heading.
 *
 * Stack multiple sections with your own spacing, e.g.:
 *   <div className="space-y-8">
 *     <FormSection title="Basics" description="...">...</FormSection>
 *     <FormSection title="Visibility" description="...">...</FormSection>
 *   </div>
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("m-0 min-w-0 border-0 p-0", className)}>
      <legend className="mb-1 w-full text-sm font-semibold text-ink-900 dark:text-white">{title}</legend>
      {description && <p className="mb-4 text-xs text-ink-400">{description}</p>}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}
