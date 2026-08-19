import { getTemplates } from "@/lib/data/admin";
import { CopyButton } from "@/components/admin/CopyButton";

export default async function AdminTemplatesPage() {
  const templates = await getTemplates();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Outreach templates</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Copy-only. Nothing here sends mail — paste into your own email or messaging client.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map((t) => (
          <div key={t.id} className="flex flex-col gap-2 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900 dark:text-white">{t.name}</p>
                <p className="text-xs uppercase tracking-wide text-ink-400">{t.channel}</p>
              </div>
              <CopyButton text={t.subject ? `${t.subject}\n\n${t.body}` : t.body} />
            </div>
            {t.subject && <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{t.subject}</p>}
            <p className="whitespace-pre-wrap text-sm text-ink-600 dark:text-ink-300">{t.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
