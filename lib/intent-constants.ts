// Client-safe: no server-only imports. lib/data/intents.ts re-exports this
// for server code, but client components (e.g. IntentManager) must import
// directly from here — importing it through lib/data/intents.ts would pull
// that file's server-only createClient() import into the client bundle.
export const INTENT_TYPES = [
  { value: "find_work", label: "Find work" },
  { value: "find_gigs", label: "Find gigs" },
  { value: "hire_or_collaborate", label: "Hire or collaborate" },
  { value: "find_mentor", label: "Find a mentor" },
  { value: "become_mentor", label: "Become a mentor" },
  { value: "find_training", label: "Find training" },
  { value: "build_skill", label: "Build a skill" },
  { value: "attend_events", label: "Attend events" },
  { value: "meet_community", label: "Meet community" },
  { value: "promote_project", label: "Promote a project" },
  { value: "reconnect", label: "Reconnect professionally" },
] as const;
