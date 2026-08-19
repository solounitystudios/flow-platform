import { ImportWizard } from "@/components/admin/ImportWizard";

export default function AdminImportPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Import leads</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Upload or paste a CSV, review the preview, and confirm before anything is written. Nothing is saved until you confirm — closing this page
          after preview writes nothing. Never imports directly into public organizations.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
