import type { MyApplicationRow } from "@/lib/data/applications";

export interface WorkSection {
  title: string;
  items: MyApplicationRow[];
}

export function bucketWork(work: MyApplicationRow[], nowMs: number): WorkSection[] {
  const upcoming = work.filter((a) => a.status === "accepted" && (!a.opportunity.starts_at || new Date(a.opportunity.starts_at).getTime() > nowMs));
  const active = work.filter(
    (a) =>
      a.status === "accepted" &&
      a.opportunity.starts_at &&
      new Date(a.opportunity.starts_at).getTime() <= nowMs &&
      (!a.opportunity.ends_at || new Date(a.opportunity.ends_at).getTime() > nowMs),
  );
  const completed = work.filter((a) => a.status === "completed");
  const cancelled = work.filter((a) => a.status === "cancelled" || a.status === "no_show");

  return [
    { title: "Active now", items: active.filter((a) => !upcoming.includes(a)) },
    { title: "Upcoming", items: upcoming.filter((a) => !active.includes(a)) },
    { title: "Completed", items: completed },
    { title: "Cancelled / No-show", items: cancelled },
  ];
}
