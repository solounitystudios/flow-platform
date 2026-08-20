"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import {
  previewLeadImportAction,
  commitLeadImportAction,
  type ImportPreviewState,
  type ImportCommitState,
  type ImportPreviewRow,
} from "@/lib/admin/actions";

const initialPreview: ImportPreviewState = {};
const initialCommit: ImportCommitState = {};

export function ImportWizard() {
  const [csvText, setCsvText] = useState("");
  const [previewState, previewAction] = useActionState(previewLeadImportAction, initialPreview);
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [commitState, commitAction] = useActionState(commitLeadImportAction, initialCommit);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeRows = rows ?? previewState.rows ?? null;
  if (previewState.rows && rows === null) setRows(previewState.rows);

  const summary = useMemo(() => {
    if (!activeRows) return null;
    const create = activeRows.filter((r) => r.decision === "create").length;
    const update = activeRows.filter((r) => r.decision === "update").length;
    const skip = activeRows.filter((r) => r.decision === "skip").length;
    return { create, update, skip, total: activeRows.length };
  }, [activeRows]);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function updateDecision(rowIndex: number, decision: ImportPreviewRow["decision"]) {
    setRows((prev) => (prev ?? []).map((r) => (r.rowIndex === rowIndex ? { ...r, decision } : r)));
  }

  const rowsJson = useMemo(() => {
    if (!activeRows) return "[]";
    const payload = activeRows
      .filter((r) => r.decision !== "skip" && r.errors.length === 0)
      .map((r) => ({
        action: r.decision === "update" ? "update" : "create",
        ...(r.decision === "update" && r.duplicate ? { existing_id: r.duplicate.id } : {}),
        ...r.data,
      }));
    return JSON.stringify(payload);
  }, [activeRows]);

  if (commitState.result) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Import complete.</p>
          <p>
            {commitState.result.created} prospect{commitState.result.created === 1 ? "" : "s"} created, {commitState.result.updated} updated.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setCsvText("");
              setRows(null);
            }}
          >
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  if (!activeRows) {
    return (
      <form action={previewAction} className="space-y-4 rounded-xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        <input type="hidden" name="csv_text" value={csvText} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <a href="/admin/import/sample" className="text-sm font-medium text-flow-600 hover:underline">
            Download sample CSV
          </a>
        </div>
        <Textarea
          label="Or paste CSV text"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          className="min-h-48 font-mono text-xs"
          placeholder="business_name,category,address,..."
        />
        {previewState.error && (
          <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            <AlertCircle className="h-4 w-4 shrink-0" /> {previewState.error}
          </p>
        )}
        <SubmitButton pendingLabel="Parsing…" disabled={!csvText.trim()}>
          Preview import
        </SubmitButton>
      </form>
    );
  }

  return (
    <form action={commitAction} className="space-y-4">
      <input type="hidden" name="rows_json" value={rowsJson} />

      {summary && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 text-sm dark:border-ink-800 dark:bg-ink-900">
          <p className="font-medium text-ink-900 dark:text-white">{summary.total} rows parsed</p>
          <span className="text-emerald-600">{summary.create} to create</span>
          <span className="text-amber-600">{summary.update} to update</span>
          <span className="text-ink-400">{summary.skip} skipped</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
              <th className="px-3 py-2.5 font-medium">Row</th>
              <th className="px-3 py-2.5 font-medium">Business</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Issues</th>
              <th className="px-3 py-2.5 font-medium">Duplicate?</th>
              <th className="px-3 py-2.5 font-medium">Decision</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((r) => (
              <tr key={r.rowIndex} className="border-b border-ink-100 last:border-0 dark:border-ink-800">
                <td className="px-3 py-2 text-ink-400">{r.rowIndex + 1}</td>
                <td className="px-3 py-2 font-medium text-ink-900 dark:text-white">{r.data.business_name || "—"}</td>
                <td className="px-3 py-2 text-ink-600 dark:text-ink-300">{r.data.category || "—"}</td>
                <td className="px-3 py-2">
                  {r.errors.length > 0 ? (
                    <span className="text-xs text-red-600">{r.errors.join(" ")}</span>
                  ) : (
                    <span className="text-xs text-ink-300">None</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.duplicate ? (
                    <span className="text-amber-600">
                      Matches “{r.duplicate.business_name}” by {r.duplicate.matchReason}
                    </span>
                  ) : (
                    <span className="text-ink-300">None</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={r.decision}
                    disabled={r.errors.length > 0}
                    onChange={(e) => updateDecision(r.rowIndex, e.target.value as ImportPreviewRow["decision"])}
                    className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
                  >
                    <option value="skip">Skip</option>
                    <option value="create">Import as new</option>
                    {r.duplicate && <option value="update">Update existing</option>}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {commitState.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {commitState.error}
        </p>
      )}

      <div className="flex gap-3">
        <SubmitButton pendingLabel="Importing…" disabled={summary ? summary.create + summary.update === 0 : true}>
          Confirm import ({summary ? summary.create + summary.update : 0} rows)
        </SubmitButton>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setRows(null);
            setCsvText("");
          }}
        >
          Start over
        </Button>
      </div>
    </form>
  );
}
