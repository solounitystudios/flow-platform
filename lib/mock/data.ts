import type {
  MockActivityItem,
  MockEvent,
  MockOpportunity,
  MockOrganization,
  MockPerson,
  MockRecommendation,
} from "@/lib/types";

// All content below is realistic seed/demo data for Buffalo, NY — FLOW's pilot city.
// It mirrors the live Supabase schema (see lib/database.types.ts) field-for-field so
// this module can be replaced by real queries once multi-user data exists in the DB.
// The signed-in user's own profile, skills, and passport stats are NOT mocked —
// those come from Supabase directly (see lib/data/profile.ts).

function avatar(seed: string) {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

export const CITY_CENTER = { lat: 42.8864, lng: -78.8784, city: "Buffalo", state: "NY" };

export const SKILL_CATEGORIES = ["Hospitality", "Creative", "Trades", "Events", "Tech", "Care", "Logistics"];

export const mockOrganizations: MockOrganization[] = [
  { id: "org-1", name: "The Dockside Tavern", logo_url: avatar("dockside"), city: "Buffalo", state: "NY", description: "Waterfront restaurant & event space on the Buffalo River.", verified: true, industry: "Hospitality", member_perk: "15% off for FLOW members", rating: 4.7, lat: 42.8749, lng: -78.8748 },
  { id: "org-2", name: "Queen City Studios", logo_url: avatar("queencity"), city: "Buffalo", state: "NY", description: "Photo & video production studio serving WNY brands.", verified: true, industry: "Creative", member_perk: null, rating: 4.9, lat: 42.9021, lng: -78.8935 },
  { id: "org-3", name: "Larkin Square Events", logo_url: avatar("larkin"), city: "Buffalo", state: "NY", description: "Community events and markets in the Larkin District.", verified: true, industry: "Events", member_perk: "Free entry to summer series", rating: 4.8, lat: 42.8721, lng: -78.8586 },
  { id: "org-4", name: "Elmwood Fitness Collective", logo_url: avatar("elmwood"), city: "Buffalo", state: "NY", description: "Independent gym and training studio on Elmwood Ave.", verified: true, industry: "Fitness", member_perk: "$10 FLOW member day pass", rating: 4.6, lat: 42.9058, lng: -78.8677 },
  { id: "org-5", name: "BuffState Stagehands Union Local 5", logo_url: avatar("stagehands"), city: "Buffalo", state: "NY", description: "Live event production crew placement.", verified: true, industry: "Trades", member_perk: null, rating: 4.5, lat: 42.8874, lng: -78.8745 },
  { id: "org-6", name: "Root & Bloom Cleanup Crew", logo_url: avatar("rootbloom"), city: "Buffalo", state: "NY", description: "Neighborhood beautification nonprofit.", verified: false, industry: "Nonprofit", member_perk: null, rating: 4.9, lat: 42.8991, lng: -78.9106 },
  { id: "org-7", name: "Canalside Markets", logo_url: avatar("canalside"), city: "Buffalo", state: "NY", description: "Seasonal vendor markets at Canalside.", verified: true, industry: "Retail", member_perk: "Vendor fee waived first market", rating: 4.4, lat: 42.8797, lng: -78.8756 },
  { id: "org-8", name: "Pearl Street Grill Group", logo_url: avatar("pearlstreet"), city: "Buffalo", state: "NY", description: "Downtown restaurant group, 3 locations.", verified: true, industry: "Hospitality", member_perk: "10% off for FLOW members", rating: 4.3, lat: 42.8858, lng: -78.8767 },
];

function org(id: string) {
  const o = mockOrganizations.find((x) => x.id === id)!;
  return { id: o.id, name: o.name, logo_url: o.logo_url, verified: o.verified };
}

function inMin(min: number) {
  return new Date(Date.now() + min * 60_000).toISOString();
}
function inHrs(hrs: number) {
  return inMin(hrs * 60);
}
function agoHrs(hrs: number) {
  return inMin(-hrs * 60);
}
function agoDays(days: number) {
  return agoHrs(days * 24);
}

export const mockOpportunities: MockOpportunity[] = [
  { id: "opp-1", organization: org("org-1"), title: "Two servers needed tonight", description: "Friday dinner rush, patio + main dining room. Experience preferred, training available.", opportunity_type: "gig", status: "open", city: "Buffalo", state: "NY", location_name: "745 Ohio St", lat: 42.8749, lng: -78.8748, starts_at: inHrs(5), ends_at: inHrs(10), pay_cents: 2200, slots: 2, slots_filled: 0, distance_mi: 1.2, urgent: true },
  { id: "opp-2", organization: org("org-2"), title: "Photographer for product shoot", description: "Half-day shoot for a local apparel brand. Bring your own kit; studio lighting on-site.", opportunity_type: "gig", status: "open", city: "Buffalo", state: "NY", location_name: "1250 Niagara St", lat: 42.9021, lng: -78.8935, starts_at: inHrs(2), ends_at: inHrs(6), pay_cents: 25000, slots: 1, slots_filled: 0, distance_mi: 2.8, urgent: true },
  { id: "opp-3", organization: org("org-5"), title: "Stagehand needed downtown", description: "Load-in and load-out for a touring show at Shea's. Steel-toe boots required.", opportunity_type: "gig", status: "open", city: "Buffalo", state: "NY", location_name: "646 Main St", lat: 42.8874, lng: -78.8745, starts_at: inHrs(3), ends_at: inHrs(9), pay_cents: 2800, slots: 3, slots_filled: 1, distance_mi: 0.6, urgent: true },
  { id: "opp-4", organization: org("org-7"), title: "3 promotional workers for brand launch", description: "Hand out samples and talk to shoppers at the Canalside market. Outgoing personality a must.", opportunity_type: "gig", status: "open", city: "Buffalo", state: "NY", location_name: "44 Prime St", lat: 42.8797, lng: -78.8756, starts_at: inHrs(24), ends_at: inHrs(30), pay_cents: 2000, slots: 3, slots_filled: 2, distance_mi: 0.9, urgent: false },
  { id: "opp-5", organization: org("org-6"), title: "Volunteer cleanup — Front Park", description: "Community cleanup event, gloves and bags provided. Snacks after!", opportunity_type: "volunteer", status: "open", city: "Buffalo", state: "NY", location_name: "Front Park", lat: 42.8991, lng: -78.9106, starts_at: inMin(45), ends_at: inHrs(3), pay_cents: null, slots: 20, slots_filled: 14, distance_mi: 3.4, urgent: true },
  { id: "opp-6", organization: org("org-3"), title: "Networking mixer — hosts needed", description: "Greet guests and manage check-in for a professional mixer at Larkin Square.", opportunity_type: "gig", status: "open", city: "Buffalo", state: "NY", location_name: "745 Seneca St", lat: 42.8721, lng: -78.8586, starts_at: inHrs(28), ends_at: inHrs(32), pay_cents: 1800, slots: 4, slots_filled: 0, distance_mi: 1.9, urgent: false },
  { id: "opp-7", organization: org("org-8"), title: "Line cook, weekend coverage", description: "Two weekend shifts, saute station. Culinary experience required.", opportunity_type: "job", status: "open", city: "Buffalo", state: "NY", location_name: "76 Pearl St", lat: 42.8858, lng: -78.8767, starts_at: inHrs(50), ends_at: null, pay_cents: 2100, slots: 1, slots_filled: 0, distance_mi: 0.4, urgent: false },
  { id: "opp-8", organization: org("org-4"), title: "Front desk associate (part-time)", description: "Evenings & weekends, member check-in and tours. Great for someone into fitness.", opportunity_type: "job", status: "open", city: "Buffalo", state: "NY", location_name: "1235 Elmwood Ave", lat: 42.9187, lng: -78.8802, starts_at: inHrs(72), ends_at: null, pay_cents: 1700, slots: 1, slots_filled: 0, distance_mi: 4.1, urgent: false },
  { id: "opp-9", organization: org("org-2"), title: "Video editor — community project", description: "Cut a 3-minute highlight reel for a nonprofit's annual gala. Portfolio project, unpaid.", opportunity_type: "project", status: "open", city: "Buffalo", state: "NY", location_name: "Remote", lat: 42.8864, lng: -78.8784, starts_at: inHrs(96), ends_at: null, pay_cents: null, slots: 1, slots_filled: 0, distance_mi: 0, urgent: false },
  { id: "opp-10", organization: org("org-1"), title: "Bartender for private event", description: "Private buyout, craft cocktail menu already set. Tips + flat rate.", opportunity_type: "gig", status: "filled", city: "Buffalo", state: "NY", location_name: "745 Ohio St", lat: 42.8749, lng: -78.8748, starts_at: agoHrs(20), ends_at: agoHrs(15), pay_cents: 3000, slots: 2, slots_filled: 2, distance_mi: 1.2, urgent: false },
];

export const mockEvents: MockEvent[] = [
  { id: "evt-1", organization: org("org-3"), title: "Larkin Square Summer Series: Live Music Night", description: "Local bands, food trucks, and community vendors in the square.", city: "Buffalo", state: "NY", venue: "Larkin Square", lat: 42.8721, lng: -78.8586, starts_at: inHrs(30), ends_at: inHrs(34), capacity: 500, registered: 342, status: "published", cover_url: avatar("larkin-music"), price_cents: 0, category: "Music" },
  { id: "evt-2", organization: org("org-2"), title: "Creative Freelancer Meetup", description: "Networking for photographers, designers, and video creators in WNY.", city: "Buffalo", state: "NY", venue: "Queen City Studios", lat: 42.9021, lng: -78.8935, starts_at: inHrs(52), ends_at: inHrs(55), capacity: 60, registered: 46, status: "published", cover_url: avatar("creative-meetup"), price_cents: 500, category: "Networking" },
  { id: "evt-3", organization: org("org-4"), title: "Sunrise Community Workout", description: "Free outdoor HIIT session, all levels welcome.", city: "Buffalo", state: "NY", venue: "Delaware Park", lat: 42.9297, lng: -78.8664, starts_at: inHrs(14), ends_at: inHrs(15), capacity: 40, registered: 28, status: "published", cover_url: avatar("sunrise-workout"), price_cents: 0, category: "Fitness" },
  { id: "evt-4", organization: org("org-7"), title: "Canalside Night Market", description: "Local makers, live music, and food trucks along the water.", city: "Buffalo", state: "NY", venue: "Canalside", lat: 42.8797, lng: -78.8756, starts_at: inHrs(76), ends_at: inHrs(80), capacity: 1200, registered: 611, status: "published", cover_url: avatar("night-market"), price_cents: 0, category: "Market" },
  { id: "evt-5", organization: org("org-6"), title: "Front Park Cleanup + Cookout", description: "Volunteer morning followed by a community cookout.", city: "Buffalo", state: "NY", venue: "Front Park", lat: 42.8991, lng: -78.9106, starts_at: inMin(45), ends_at: inHrs(3), capacity: 60, registered: 41, status: "published", cover_url: avatar("cleanup-cookout"), price_cents: 0, category: "Volunteer" },
  { id: "evt-6", organization: org("org-8"), title: "Industry Night: Restaurant Workers Social", description: "Off-shift social for hospitality workers, drink specials all night.", city: "Buffalo", state: "NY", venue: "Pearl Street Grill", lat: 42.8858, lng: -78.8767, starts_at: agoDays(3), ends_at: agoDays(3), capacity: 150, registered: 150, status: "completed", cover_url: avatar("industry-night"), price_cents: 0, category: "Social" },
  { id: "evt-7", organization: org("org-3"), title: "FLOW Passport Launch Party", description: "Celebrate the launch of FLOW in Buffalo — meet the founding members.", city: "Buffalo", state: "NY", venue: "Larkin Square", lat: 42.8721, lng: -78.8586, starts_at: agoDays(18), ends_at: agoDays(18), capacity: 300, registered: 300, status: "completed", cover_url: avatar("flow-launch"), price_cents: 0, category: "Community" },
];

const skillSet = (names: [string, boolean, string][]) => names.map(([name, verified, category]) => ({ name, verified, category }));

export const mockPeople: MockPerson[] = [
  { id: "p-1", username: "jmartinez", full_name: "Jordan Martinez", avatar_url: avatar("jordan"), city: "Buffalo", state: "NY", bio: "Bartender & event photographer. Always down for a last-minute gig.", reliability_score: 98, flow_points: 2450, available_now: true, gigs_completed: 37, events_attended: 26, community_projects: 4, recommendations: 12, earned_cents: 842000, member_since: "2025-11-02", skills: skillSet([["Bartending", true, "Hospitality"], ["Photography", true, "Creative"], ["Event Setup", true, "Events"]]) },
  { id: "p-2", username: "aokafor", full_name: "Amara Okafor", avatar_url: avatar("amara"), city: "Buffalo", state: "NY", bio: "Stagehand and lighting tech. Union Local 5.", reliability_score: 100, flow_points: 3120, available_now: true, gigs_completed: 51, events_attended: 19, community_projects: 2, recommendations: 18, earned_cents: 1310000, member_since: "2025-08-14", skills: skillSet([["Stagehand", true, "Trades"], ["Lighting", true, "Trades"], ["Rigging", false, "Trades"]]) },
  { id: "p-3", username: "tchen", full_name: "Theo Chen", avatar_url: avatar("theo"), city: "Buffalo", state: "NY", bio: "Freelance video editor and motion designer.", reliability_score: 96, flow_points: 1680, available_now: false, gigs_completed: 22, events_attended: 8, community_projects: 6, recommendations: 9, earned_cents: 560000, member_since: "2026-01-05", skills: skillSet([["Video Editing", true, "Creative"], ["Motion Graphics", true, "Creative"]]) },
  { id: "p-4", username: "rwashington", full_name: "Riley Washington", avatar_url: avatar("riley"), city: "Buffalo", state: "NY", bio: "Personal trainer, runs the sunrise workout crew.", reliability_score: 99, flow_points: 2890, available_now: true, gigs_completed: 14, events_attended: 33, community_projects: 5, recommendations: 15, earned_cents: 310000, member_since: "2025-09-21", skills: skillSet([["Personal Training", true, "Care"], ["Group Fitness", true, "Care"]]) },
  { id: "p-5", username: "kpatel", full_name: "Kiran Patel", avatar_url: avatar("kiran"), city: "Buffalo", state: "NY", bio: "Server & host, studying hospitality management at Buff State.", reliability_score: 94, flow_points: 980, available_now: true, gigs_completed: 19, events_attended: 11, community_projects: 1, recommendations: 6, earned_cents: 298000, member_since: "2026-02-18", skills: skillSet([["Serving", true, "Hospitality"], ["Hosting", false, "Hospitality"]]) },
  { id: "p-6", username: "lnowak", full_name: "Lena Nowak", avatar_url: avatar("lena"), city: "Buffalo", state: "NY", bio: "Community organizer, runs neighborhood cleanups.", reliability_score: 100, flow_points: 4210, available_now: false, gigs_completed: 6, events_attended: 47, community_projects: 12, recommendations: 22, earned_cents: 40000, member_since: "2025-06-30", skills: skillSet([["Event Coordination", true, "Events"], ["Volunteer Management", true, "Care"]]) },
  { id: "p-7", username: "dsantos", full_name: "Diego Santos", avatar_url: avatar("diego"), city: "Buffalo", state: "NY", bio: "Line cook, culinary school grad.", reliability_score: 91, flow_points: 640, available_now: true, gigs_completed: 9, events_attended: 3, community_projects: 0, recommendations: 3, earned_cents: 189000, member_since: "2026-04-11", skills: skillSet([["Line Cook", true, "Hospitality"], ["Food Safety", true, "Hospitality"]]) },
  { id: "p-8", username: "mferreira", full_name: "Maya Ferreira", avatar_url: avatar("maya"), city: "Buffalo", state: "NY", bio: "Marketing & promo work, brand ambassador for local launches.", reliability_score: 97, flow_points: 1540, available_now: true, gigs_completed: 28, events_attended: 15, community_projects: 3, recommendations: 10, earned_cents: 412000, member_since: "2025-10-09", skills: skillSet([["Promotions", true, "Events"], ["Social Media", true, "Creative"]]) },
];

// Index 0 is treated as "you" in places that need a signed-out preview / component demo.
export const currentUserDemo = mockPeople[0];

export const mockRecommendations: MockRecommendation[] = [
  { id: "rec-1", author: { id: "p-2", full_name: "Amara Okafor", avatar_url: avatar("amara"), username: "aokafor" }, body: "Jordan showed up early, worked the whole load-in without being asked twice, and made the whole crew's night easier. Would work with them again any time.", context: "Stagehand — Shea's Theatre", created_at: agoDays(9) },
  { id: "rec-2", author: { id: "p-6", full_name: "Lena Nowak", avatar_url: avatar("lena"), username: "lnowak" }, body: "Organized the whole photo wall for our cleanup event on no notice. Reliable, kind, and genuinely great with people.", context: "Front Park Cleanup", created_at: agoDays(24) },
  { id: "rec-3", author: { id: "p-4", full_name: "Riley Washington", avatar_url: avatar("riley"), username: "rwashington" }, body: "Covered a shift for me with two hours notice and didn't miss a beat.", context: "Bartending — The Dockside Tavern", created_at: agoDays(41) },
];

export const mockActivity: MockActivityItem[] = [
  { id: "act-1", type: "gig_completed", actor: { id: "p-2", full_name: "Amara Okafor", avatar_url: avatar("amara"), username: "aokafor" }, summary: "completed a stagehand gig at Shea's Theatre", created_at: agoHrs(6), points: 40 },
  { id: "act-2", type: "recommendation", actor: { id: "p-6", full_name: "Lena Nowak", avatar_url: avatar("lena"), username: "lnowak" }, summary: "left you a recommendation", detail: "\"Organized the whole photo wall...\"", created_at: agoDays(1) },
  { id: "act-3", type: "event_attended", actor: { id: "p-4", full_name: "Riley Washington", avatar_url: avatar("riley"), username: "rwashington" }, summary: "checked into Sunrise Community Workout", created_at: agoDays(1), points: 15 },
  { id: "act-4", type: "skill_verified", actor: { id: "p-1", full_name: "Jordan Martinez", avatar_url: avatar("jordan"), username: "jmartinez" }, summary: "got Photography verified", created_at: agoDays(2), points: 25 },
  { id: "act-5", type: "project", actor: { id: "p-3", full_name: "Theo Chen", avatar_url: avatar("theo"), username: "tchen" }, summary: "started a community video project", created_at: agoDays(3) },
  { id: "act-6", type: "connection", actor: { id: "p-8", full_name: "Maya Ferreira", avatar_url: avatar("maya"), username: "mferreira" }, summary: "connected with Kiran Patel", created_at: agoDays(4) },
  { id: "act-7", type: "points_earned", actor: { id: "p-1", full_name: "Jordan Martinez", avatar_url: avatar("jordan"), username: "jmartinez" }, summary: "earned FLOW Points for a completed gig", created_at: agoDays(5), points: 60 },
];

export const REWARDS_CATALOG = [
  { id: "rw-1", name: "$10 Elmwood Fitness day pass", cost_points: 400, category: "Fitness", partner: "Elmwood Fitness Collective" },
  { id: "rw-2", name: "15% off at The Dockside Tavern", cost_points: 250, category: "Dining", partner: "The Dockside Tavern" },
  { id: "rw-3", name: "Free Canalside Night Market vendor table", cost_points: 800, category: "Business", partner: "Canalside Markets" },
  { id: "rw-4", name: "FLOW branded tote bag", cost_points: 150, category: "Merch", partner: "FLOW" },
  { id: "rw-5", name: "1-on-1 portfolio review w/ Queen City Studios", cost_points: 600, category: "Career", partner: "Queen City Studios" },
  { id: "rw-6", name: "Priority application badge (7 days)", cost_points: 300, category: "Platform", partner: "FLOW" },
];
