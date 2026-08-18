import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldClasses =
  "w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition focus:border-flow-500 focus:ring-2 focus:ring-flow-500/20 dark:border-ink-700 dark:bg-ink-900 dark:text-white";

interface FieldWrapProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldWrapProps>(function Input(
  { label, hint, error, required, className, id, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
      <input ref={ref} id={id} className={cn(fieldClasses, error && "border-red-500 focus:border-red-500 focus:ring-red-500/20", className)} {...props} />
    </Field>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldWrapProps>(
  function Textarea({ label, hint, error, required, className, id, ...props }, ref) {
    return (
      <Field label={label} hint={hint} error={error} required={required} id={id}>
        <textarea ref={ref} id={id} className={cn(fieldClasses, "min-h-24 resize-y", className)} {...props} />
      </Field>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldWrapProps>(function Select(
  { label, hint, error, required, className, id, children, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
      <select ref={ref} id={id} className={cn(fieldClasses, "appearance-none", className)} {...props}>
        {children}
      </select>
    </Field>
  );
});

function Field({ label, hint, error, required, id, children }: FieldWrapProps & { id?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-800 dark:text-ink-100">
          {label} {required && <span className="text-flow-600">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}
