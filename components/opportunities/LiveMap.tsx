"use client";

import { useMemo, useState } from "react";
import { Briefcase, CalendarDays, MapPin, Navigation } from "lucide-react";
import { CITY_CENTER } from "@/lib/mock/data";
import { relativeTime, cn } from "@/lib/utils";

interface MapPin {
  id: string;
  kind: "opportunity" | "event";
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  urgent?: boolean;
  startsAt: string;
  href: string;
}

export function LiveMap({ pins }: { pins: MapPin[] }) {
  const [activeId, setActiveId] = useState<string | null>(pins[0]?.id ?? null);

  const bounds = useMemo(() => {
    const lats = [CITY_CENTER.lat, ...pins.map((p) => p.lat)];
    const lngs = [CITY_CENTER.lng, ...pins.map((p) => p.lng)];
    const pad = 0.01;
    return {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    };
  }, [pins]);

  function position(lat: number, lng: number) {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = 100 - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
    return { left: `${x}%`, top: `${y}%` };
  }

  const active = pins.find((p) => p.id === activeId);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-ink-100 bg-flow-50 dark:border-ink-800 dark:bg-ink-900 sm:aspect-[16/9]">
        <svg className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="8%" height="10%" patternUnits="userSpaceOnUse">
              <path d="M 0 0 L 0 100 M 0 0 L 100 0" fill="none" stroke="currentColor" strokeWidth="1" className="text-flow-200 dark:text-ink-700" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={position(CITY_CENTER.lat, CITY_CENTER.lng)}>
          <span className="flex h-3 w-3 items-center justify-center rounded-full bg-flow-600 ring-4 ring-flow-600/20">
            <Navigation className="h-1.5 w-1.5 text-white" />
          </span>
          <span className="mt-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-ink-500 dark:bg-ink-950/90">You</span>
        </div>

        {pins.map((pin) => {
          const isActive = pin.id === activeId;
          const Icon = pin.kind === "event" ? CalendarDays : Briefcase;
          return (
            <button
              key={pin.id}
              onClick={() => setActiveId(pin.id)}
              style={position(pin.lat, pin.lng)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-1.5 shadow-md transition-transform hover:scale-110",
                isActive ? "z-20 scale-125 ring-2 ring-flow-600" : "z-10",
                pin.urgent ? "bg-red-500 text-white" : pin.kind === "event" ? "bg-gold-500 text-white" : "bg-flow-600 text-white",
              )}
              aria-label={pin.title}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>

      {active && (
        <a
          href={active.href}
          className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900"
        >
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white", active.urgent ? "bg-red-500" : "bg-flow-600")}>
            {active.kind === "event" ? <CalendarDays className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-900 dark:text-white">{active.title}</p>
            <p className="flex items-center gap-1 truncate text-xs text-ink-400">
              <MapPin className="h-3 w-3" /> {active.subtitle} · {relativeTime(active.startsAt)}
            </p>
          </div>
        </a>
      )}
    </div>
  );
}

export type { MapPin };
