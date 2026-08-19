import type { Metadata } from "next";
import { Radar } from "lucide-react";
import { requireSecureAdmin } from "@/lib/admin/auth";
import { getFlowCommandState, getLiveRepoStatus, deriveRiskFlags } from "@/lib/admin/flow-command";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FlowCommandMissionBar } from "@/components/admin/FlowCommandMissionBar";
import { FlowCommandAgentCard } from "@/components/admin/FlowCommandAgentCard";
import { FlowCommandFeed } from "@/components/admin/FlowCommandFeed";
import { FlowCommandRiskView } from "@/components/admin/FlowCommandRiskView";
import { FlowCommandHelpers } from "@/components/admin/FlowCommandHelpers";
import { FlowCommandCurrentMissionComplete, FlowCommandLastMissionRecap } from "@/components/admin/FlowCommandMissionComplete";

// This route shells out to `git` and reads the filesystem — it needs Node,
// not edge. Admin routes in this repo already run on Node by default; this
// export just makes that requirement explicit rather than implicit.
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "FLOW Command",
};

export default async function FlowCommandPage() {
  // Defense in depth to match this repo's existing convention: the
  // (secure) layout already calls requireSecureAdmin(), but every page and
  // Server Action under it re-checks independently rather than trusting
  // the layout alone.
  await requireSecureAdmin();

  const [stateResult, liveRepo] = await Promise.all([getFlowCommandState(), getLiveRepoStatus()]);

  if (!stateResult.ok) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink-900 dark:text-white">
            <Radar className="h-5 w-5" /> FLOW Command
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">Mission control for FLOW&apos;s multi-agent development system.</p>
        </div>
        <EmptyState
          icon={<Radar className="h-8 w-8" />}
          title="No FLOW mission is currently tracked"
          body={`.claude/flow-command-state.json is ${stateResult.reason === "missing" ? "missing" : "present but couldn't be read as valid status data"}. flow-lead writes this file at meaningful milestones — once a mission starts, it will show up here automatically.`}
        />
      </div>
    );
  }

  const state = stateResult.state;
  const riskFlags = deriveRiskFlags(state);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink-900 dark:text-white">
          <Radar className="h-5 w-5" /> FLOW Command
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Mission control for FLOW&apos;s multi-agent development system — reads only from{" "}
          <code className="rounded bg-ink-100 px-1 py-0.5 text-xs dark:bg-ink-800">.claude/flow-command-state.json</code> and live, read-only git
          status. Nothing here can control or stop a running agent.
        </p>
      </div>

      <FlowCommandMissionBar state={state} liveRepo={liveRepo} />

      <FlowCommandCurrentMissionComplete state={state} />

      {state.last_completed_mission && <FlowCommandLastMissionRecap mission={state.last_completed_mission} />}

      <div>
        <SectionHeading title="Agents" subtitle={`${state.agents.length} agent${state.agents.length === 1 ? "" : "s"} in this batch`} />
        {state.agents.length === 0 ? (
          <p className="mt-3 text-sm text-ink-400">No agents recorded for the current mission.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.agents.map((agent) => (
              <FlowCommandAgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        )}
      </div>

      <FlowCommandRiskView flags={riskFlags} />

      <FlowCommandFeed feed={state.feed} />

      <FlowCommandHelpers />
    </div>
  );
}
