import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Zap, ShieldCheck, MapPin, Ticket, Gift, Building2, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PassportCard } from "@/components/passport/PassportCard";
import { currentUserDemo, mockOpportunities, mockOrganizations } from "@/lib/mock/data";
import { flowIdFromUuid } from "@/lib/passport";
import { formatCents, relativeTime } from "@/lib/utils";

export default function LandingPage() {
  const demoPassport = {
    fullName: currentUserDemo.full_name,
    username: currentUserDemo.username,
    avatarUrl: currentUserDemo.avatar_url,
    city: currentUserDemo.city,
    state: currentUserDemo.state,
    flowId: flowIdFromUuid(currentUserDemo.id),
    reliabilityScore: currentUserDemo.reliability_score,
    flowPoints: currentUserDemo.flow_points,
    gigsCompleted: currentUserDemo.gigs_completed,
    skillsVerified: currentUserDemo.skills.filter((s) => s.verified).length,
    eventsAttended: currentUserDemo.events_attended,
    communityProjects: currentUserDemo.community_projects,
    recommendationsCount: currentUserDemo.recommendations,
    earnedCents: currentUserDemo.earned_cents,
    memberSince: currentUserDemo.member_since,
    availableNow: currentUserDemo.available_now,
    verified: true,
  };

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-32 h-96 bg-flow-gradient opacity-[0.08] blur-3xl" />
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-28">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-flow-100 px-3 py-1 text-xs font-semibold text-flow-700 dark:bg-flow-950 dark:text-flow-300">
              <Sparkles className="h-3.5 w-3.5" /> Now live in Buffalo, NY
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-ink-900 dark:text-white sm:text-5xl lg:text-6xl">
              Your city.
              <br />
              Your opportunities.
              <br />
              <span className="bg-flow-gradient bg-clip-text text-transparent">Proven.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-ink-500 dark:text-ink-400">
              FLOW is the free membership platform that turns real gigs, events, and community work into a passport
              that proves what you&apos;ve actually done — and connects you to what&apos;s happening right now.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/signup" size="lg" className="group">
                Join FLOW free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
              <Button href="/live" variant="outline" size="lg">
                See live opportunities
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-5 text-sm text-ink-400">
              <span>Always free for members</span>
              <span className="h-1 w-1 rounded-full bg-ink-300" />
              <span>No credit card required</span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm lg:max-w-none">
            <PassportCard data={demoPassport} />
          </div>
        </div>
      </section>

      {/* Live opportunities ticker */}
      <section id="opportunities" className="border-y border-ink-100 bg-white py-14 dark:border-ink-800 dark:bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-ink-900 dark:text-white sm:text-3xl">Happening right now</h2>
              <p className="mt-1 text-ink-500">Open your phone, see what your city needs today.</p>
            </div>
            <Button href="/live" variant="ghost" size="sm" className="hidden sm:inline-flex">
              Open live map <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mockOpportunities.filter((o) => o.status === "open").slice(0, 6).map((opp) => (
              <div key={opp.id} className="rounded-2xl border border-ink-100 p-4 transition hover:border-flow-300 hover:shadow-card dark:border-ink-800">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-flow-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-flow-700 dark:bg-flow-950 dark:text-flow-300">
                    {opp.opportunity_type}
                  </span>
                  {opp.urgent && <span className="text-[11px] font-semibold text-red-500">● Urgent</span>}
                </div>
                <h3 className="mt-2.5 font-semibold text-ink-900 dark:text-white">{opp.title}</h3>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
                  <MapPin className="h-3 w-3" /> {opp.location_name} · {opp.distance_mi} mi
                </p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-semibold text-ink-900 dark:text-white">
                    {opp.pay_cents ? `${formatCents(opp.pay_cents)}/hr` : "Volunteer"}
                  </span>
                  <span className="text-ink-400">{relativeTime(opp.starts_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Passport explainer */}
      <section id="passport" className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-flow-600">The FLOW Passport</span>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-ink-900 dark:text-white sm:text-4xl">
              A resume can lie. A passport can&apos;t.
            </h2>
            <p className="mt-4 text-lg text-ink-500 dark:text-ink-400">
              Every gig, event, project, and recommendation gets logged automatically. Your Passport is a living
              record of your reliability — shareable with one QR code, verifiable by anyone.
            </p>
            <ul className="mt-7 space-y-4">
              {[
                { icon: ShieldCheck, text: "Verified skills backed by real completed work, not self-reported claims." },
                { icon: Zap, text: "Reliability score built from actual show-up and completion history." },
                { icon: Ticket, text: "One QR code for event check-in, employer verification, and networking." },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-100 text-flow-700 dark:bg-flow-950 dark:text-flow-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-ink-600 dark:text-ink-300">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-ink-100 bg-ink-50 p-6 dark:border-ink-800 dark:bg-ink-900">
            <p className="text-sm font-semibold text-ink-500">What have you actually done?</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["37", "gigs completed"],
                ["14", "skills verified"],
                ["26", "events attended"],
                ["98%", "reliability"],
                ["12", "recommendations"],
                ["$8,420", "earned"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl bg-white p-4 shadow-card dark:bg-ink-950">
                  <p className="text-2xl font-black text-ink-900 dark:text-white">{value}</p>
                  <p className="text-xs text-ink-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="border-y border-ink-100 bg-white py-16 dark:border-ink-800 dark:bg-ink-900/40 sm:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-black tracking-tight text-ink-900 dark:text-white">Everything your city needs, in one app</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: MapPin, title: "Live opportunity map", body: "See gigs, jobs, and volunteer needs open right now, sorted by distance." },
              { icon: Ticket, title: "Events & tickets", body: "Discover community events and manage your tickets in one place." },
              { icon: Gift, title: "FLOW Points & rewards", body: "Earn points for completed work and redeem them for real local perks." },
              { icon: Users, title: "Networking", body: "Connect with people you've worked and volunteered alongside." },
              { icon: Building2, title: "Business tools", body: "Post gigs, discover verified talent, and sponsor local events." },
              { icon: ShieldCheck, title: "Verified identity", body: "A digital FLOW card and QR code prove who you are and what you've done." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-ink-100 p-5 dark:border-ink-800">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-flow-gradient text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-bold text-ink-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business */}
      <section id="business" className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="grid items-center gap-10 rounded-3xl bg-flow-radial p-8 text-white sm:p-12 lg:grid-cols-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-flow-200">For businesses</span>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Hire people whose track record you can actually see.</h2>
            <p className="mt-4 text-flow-100">
              Post gigs and jobs in minutes, search verified local talent, and view real Passports before you hire —
              reliability score included.
            </p>
            <Button href="/signup" variant="secondary" size="lg" className="mt-7">
              Create a business profile
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {mockOrganizations.slice(0, 4).map((o) => (
              <div key={o.id} className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <div className="relative h-9 w-9 overflow-hidden rounded-lg bg-white/20">
                  <Image src={o.logo_url} alt={o.name} fill className="object-cover" unoptimized />
                </div>
                <p className="mt-3 text-sm font-semibold">{o.name}</p>
                <p className="text-xs text-flow-200">{o.industry}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cities */}
      <section id="cities" className="mx-auto max-w-6xl px-5 pb-16 sm:pb-24">
        <div className="rounded-3xl border border-dashed border-ink-200 p-8 text-center dark:border-ink-700 sm:p-12">
          <h2 className="text-2xl font-black text-ink-900 dark:text-white sm:text-3xl">Built to go national, one city at a time</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-500 dark:text-ink-400">
            FLOW launched in Buffalo, NY. The same platform architecture — passport, points, and opportunities — is
            built to expand city by city, with FLOW House locations to follow.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {["Buffalo, NY — Live", "Rochester, NY — Coming soon", "Cleveland, OH — Coming soon", "Pittsburgh, PA — Coming soon"].map((c) => (
              <span key={c} className="rounded-full border border-ink-200 px-3 py-1.5 text-sm text-ink-500 dark:border-ink-700 dark:text-ink-400">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-5 pb-20 text-center sm:pb-28">
        <h2 className="text-3xl font-black tracking-tight text-ink-900 dark:text-white sm:text-4xl">Start building your Passport today.</h2>
        <p className="mt-3 text-ink-500 dark:text-ink-400">Free to join. Free to use. Always.</p>
        <Button href="/signup" size="lg" className="mt-7">
          Join FLOW free <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="mt-4 text-sm text-ink-400">
          Already a member? <Link href="/login" className="font-medium text-flow-600">Log in</Link>
        </p>
      </section>
    </>
  );
}
