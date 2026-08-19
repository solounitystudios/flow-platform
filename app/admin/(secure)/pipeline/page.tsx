import { getPipelineBoard } from "@/lib/data/admin";
import { PipelineBoard } from "@/components/admin/PipelineBoard";

export default async function AdminPipelinePage() {
  const board = await getPipelineBoard();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Pipeline board</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Archived prospects are excluded. Scroll horizontally to see every stage.</p>
      </div>
      <PipelineBoard board={board} />
    </div>
  );
}
