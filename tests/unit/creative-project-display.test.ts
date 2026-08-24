// Batch 17b — Creative Project UI V1. The one piece of new presentation
// logic worth a pure unit test: what a pending-invitation card shows when
// the project's own title isn't readable yet (creative_projects_member_read
// requires active membership, which a merely-invited profile doesn't have —
// see lib/data/creative-projects.ts's PendingCreativeProjectInvitation doc
// comment and supabase/migrations/20260823041155_creative_projects_foundation.sql).
import { describe, expect, it } from "vitest";
import { describePendingInvitation } from "@/lib/creative-project-display";

describe("describePendingInvitation", () => {
  it("shows the real title and inviter when the title is readable", () => {
    expect(describePendingInvitation({ project_title: "Midnight Sessions EP", inviter: { full_name: "Jane Doe", username: "janedoe" } })).toEqual({
      title: "Midnight Sessions EP",
      subtitle: "Invited by Jane Doe",
    });
  });

  it("falls back to the inviter's username when they have no full name", () => {
    expect(describePendingInvitation({ project_title: "Midnight Sessions EP", inviter: { full_name: null, username: "janedoe" } })).toEqual({
      title: "Midnight Sessions EP",
      subtitle: "Invited by @janedoe",
    });
  });

  it("shows a title-less title with no subtitle when the inviter is also unknown", () => {
    expect(describePendingInvitation({ project_title: "Midnight Sessions EP", inviter: null })).toEqual({
      title: "Midnight Sessions EP",
      subtitle: null,
    });
  });

  it("falls back to an inviter-attributed placeholder when the project title isn't readable yet", () => {
    expect(describePendingInvitation({ project_title: null, inviter: { full_name: "Jane Doe", username: "janedoe" } })).toEqual({
      title: "A creative project from Jane Doe",
      subtitle: "Accept to see the full project details.",
    });
  });

  it("falls back to a fully generic placeholder when neither the title nor the inviter is readable", () => {
    expect(describePendingInvitation({ project_title: null, inviter: null })).toEqual({
      title: "A creative project",
      subtitle: "Accept to see the full project details.",
    });
  });
});
