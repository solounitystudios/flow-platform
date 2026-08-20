"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MapGL, { GeolocateControl, Layer, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { Briefcase, Building2, CalendarDays, DollarSign, HandHeart, Loader2, MapPin as MapPinIcon, TriangleAlert, Users2, Zap } from "lucide-react";
import { CITY_CENTER } from "@/lib/mock/data";
import { formatCents, formatDateTime, relativeTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { DetailSheet, type DetailSheetAction } from "@/components/ui/DetailSheet";
import { MAP_LAYER_EMPTY_COPY, type MapEntityType, type MapItem, type MapLayer } from "@/lib/map-selectors";
import type { OpportunityType } from "@/lib/types";

/** Raw opportunity-type label for the detail sheet's type badge — kept
 * separate from MAP_LAYER_LABEL because that one buckets "project" under
 * "Gigs" for layer purposes; this preserves the exact underlying label. */
const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  gig: "Gig",
  job: "Job",
  project: "Project",
  volunteer: "Volunteer",
};

/**
 * Free, no-API-key vector basemap (OpenFreeMap — donation-supported, no rate
 * limit or key required: https://openfreemap.org). Suitable as a real,
 * usable placeholder for this environment. A real deployment should set
 * NEXT_PUBLIC_MAP_STYLE_URL to a provider with an SLA (MapTiler, Stadia
 * Maps, Mapbox, or a self-hosted style) — see .env.example.
 */
const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

const DEFAULT_ZOOM = 11.5;
const USER_LOCATION_ZOOM = 12.5;

/** Which color/icon a pin renders with. Keyed by entityType plus a special
 * "work_now" bucket — see displayBucketFor below for when each applies. */
const DISPLAY_META: Record<MapEntityType | "work_now", { icon: typeof Briefcase; hex: string }> = {
  gig: { icon: Briefcase, hex: "#4a2af5" },
  job: { icon: Briefcase, hex: "#2a6ff5" },
  volunteer: { icon: HandHeart, hex: "#22c55e" },
  event: { icon: CalendarDays, hex: "#f5b731" },
  business: { icon: Building2, hex: "#707a90" },
  work_now: { icon: Zap, hex: "#ef4444" },
};

const DISPLAY_BUCKETS: (MapEntityType | "work_now")[] = ["gig", "job", "volunteer", "event", "business", "work_now"];

/**
 * Which visual bucket a given (already layer-filtered) item renders under.
 * Viewing "Work Now" specifically: every visible item is by definition
 * isWorkNow already (mapItemMatchesLayer guaranteed that), so they all get
 * the shared urgent/red treatment regardless of whether they're a gig or a
 * job underneath — the point of that view is "what's urgent right now",
 * not "what category is it". Viewing anything else (including "all"):
 * each item keeps its own entityType's color, so a mixed "all" view still
 * visually distinguishes a gig pin from a job pin from an event pin.
 */
function displayBucketFor(item: MapItem, layer: MapLayer): MapEntityType | "work_now" {
  return layer === "work_now" ? "work_now" : item.entityType;
}

function toFeatureCollection(items: MapItem[]): FeatureCollection<Point, { id: string }> {
  return {
    type: "FeatureCollection",
    features: items.map(
      (item): Feature<Point, { id: string }> => ({
        type: "Feature",
        id: item.id,
        geometry: { type: "Point", coordinates: [item.longitude, item.latitude] },
        properties: { id: item.id },
      }),
    ),
  };
}

function sourceId(bucket: string) {
  return `flow-${bucket}-source`;
}
function clusterLayerId(bucket: string) {
  return `flow-${bucket}-clusters`;
}
function clusterCountLayerId(bucket: string) {
  return `flow-${bucket}-cluster-count`;
}
function pointLayerId(bucket: string) {
  return `flow-${bucket}-point`;
}

/**
 * Renders map pins for `items` — the caller (LiveBrowser) has already
 * filtered `items` down to the currently-selected `layer` via
 * mapItemMatchesLayer, so this component has no filtering state of its
 * own: one layer selection, owned by the parent, drives both this and the
 * results list identically.
 */
export function LiveMap({ items, layer }: { items: MapItem[]; layer: MapLayer }) {
  const mapRef = useRef<MapRef>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const itemsByBucket = useMemo(() => {
    const map = new Map<MapEntityType | "work_now", MapItem[]>();
    for (const bucket of DISPLAY_BUCKETS) map.set(bucket, []);
    for (const item of items) map.get(displayBucketFor(item, layer))?.push(item);
    return map;
  }, [items, layer]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  // Best-effort, non-blocking geolocation: the map renders at the city
  // center immediately regardless of outcome, then flies to the user's
  // location only if permission is granted quickly. Denied/unavailable
  // geolocation never blocks or errors the map itself.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: USER_LOCATION_ZOOM,
          duration: 1200,
        });
      },
      () => {
        // Denied, unavailable, or timed out — silently keep the city-center default.
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const interactiveLayerIds = useMemo(
    () =>
      DISPLAY_BUCKETS.filter((b) => (itemsByBucket.get(b)?.length ?? 0) > 0).flatMap((b) => [
        clusterLayerId(b),
        pointLayerId(b),
      ]),
    [itemsByBucket],
  );

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) {
        setSelectedId(null);
        return;
      }
      const layerId = feature.layer?.id ?? "";
      const bucket = DISPLAY_BUCKETS.find((b) => layerId === clusterLayerId(b));

      if (bucket) {
        // Clicked a cluster bubble — zoom in toward its expansion zoom rather
        // than trying to pick an individual pin out of the cluster.
        const clusterId = feature.properties?.cluster_id;
        const map = mapRef.current?.getMap();
        const source = map?.getSource(sourceId(bucket)) as GeoJSONSource | undefined;
        if (!source || clusterId === undefined) return;
        source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            if (!map) return;
            const geometry = feature.geometry as Point;
            map.easeTo({ center: geometry.coordinates as [number, number], zoom: zoom ?? map.getZoom() + 2, duration: 500 });
          })
          .catch(() => {
            // Cluster expansion lookup failed — leave the viewport as-is rather than erroring the map.
          });
        return;
      }

      const id = feature.properties?.id as string | undefined;
      setSelectedId(id ?? null);
    },
    [],
  );

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-ink-100 bg-flow-50 dark:border-ink-800 dark:bg-ink-900 sm:aspect-[16/9]">
        {status === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <EmptyState
              icon={<TriangleAlert className="h-8 w-8" />}
              title="Map failed to load"
              body="The map tiles couldn't be reached. Your connection or the tile provider may be down — try again shortly."
            />
          </div>
        ) : (
          <>
            {status === "loading" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-flow-50 dark:bg-ink-900">
                <Loader2 className="h-6 w-6 animate-spin text-flow-500" />
              </div>
            )}
            <MapGL
              ref={mapRef}
              mapStyle={MAP_STYLE_URL}
              initialViewState={{ longitude: CITY_CENTER.lng, latitude: CITY_CENTER.lat, zoom: DEFAULT_ZOOM }}
              style={{ width: "100%", height: "100%" }}
              interactiveLayerIds={interactiveLayerIds}
              onClick={handleClick}
              onLoad={() => setStatus("ready")}
              onError={() => setStatus("error")}
              cursor="pointer"
            >
              <NavigationControl position="bottom-right" showCompass={false} />
              <GeolocateControl position="bottom-right" positionOptions={{ enableHighAccuracy: false }} trackUserLocation={false} />

              {DISPLAY_BUCKETS.map((bucket) => {
                const bucketItems = itemsByBucket.get(bucket) ?? [];
                if (bucketItems.length === 0) return null;
                const collection = toFeatureCollection(bucketItems);
                const color = DISPLAY_META[bucket].hex;
                return (
                  <Source key={bucket} id={sourceId(bucket)} type="geojson" data={collection} cluster clusterMaxZoom={14} clusterRadius={50}>
                    <Layer
                      id={clusterLayerId(bucket)}
                      type="circle"
                      filter={["has", "point_count"]}
                      paint={{
                        "circle-color": color,
                        "circle-opacity": 0.85,
                        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 25, 26],
                        "circle-stroke-width": 2,
                        "circle-stroke-color": "#ffffff",
                      }}
                    />
                    <Layer
                      id={clusterCountLayerId(bucket)}
                      type="symbol"
                      filter={["has", "point_count"]}
                      layout={{ "text-field": "{point_count_abbreviated}", "text-size": 12, "text-font": ["Noto Sans Bold"] }}
                      paint={{ "text-color": "#ffffff" }}
                    />
                    <Layer
                      id={pointLayerId(bucket)}
                      type="circle"
                      filter={["!", ["has", "point_count"]]}
                      paint={{
                        "circle-color": color,
                        "circle-radius": 8,
                        "circle-stroke-width": 2,
                        "circle-stroke-color": "#ffffff",
                      }}
                    />
                  </Source>
                );
              })}
            </MapGL>
          </>
        )}

        {status === "ready" && items.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto">
              <EmptyState title={MAP_LAYER_EMPTY_COPY[layer]} />
            </div>
          </div>
        )}
      </div>

      {selected &&
        (() => {
          const bucket = displayBucketFor(selected, layer);
          const displayMeta = DISPLAY_META[bucket];
          const Icon = displayMeta.icon;
          const locationLabel = [selected.city, selected.state].filter(Boolean).join(", ");

          const tag = selected.isWorkNow ? (
            <Badge tone="urgent">Urgent</Badge>
          ) : selected.verified ? (
            <Badge tone="verified">Verified</Badge>
          ) : undefined;

          let subtitle: ReactNode;
          let actionLabel = "View details";
          let secondaryAction: DetailSheetAction | undefined;
          const meta: ReactNode[] = [];

          if (selected.entityType === "business") {
            // Business — name (title), verified (tag), industry (subtitle),
            // public-safe location, member perk. Single "View organization"
            // action; no secondary — there's no separate business action.
            subtitle = selected.industry ?? undefined;
            actionLabel = "View organization";
            if (locationLabel) {
              meta.push(
                <span key="loc" className="flex items-center gap-1">
                  <MapPinIcon className="h-3 w-3" /> {locationLabel}
                </span>,
              );
            }
            if (selected.memberPerk) {
              meta.push(
                <span key="perk" className="font-medium text-flow-600 dark:text-flow-400">
                  {selected.memberPerk}
                </span>,
              );
            }
          } else if (selected.entityType === "event") {
            // Event — title, host (subtitle), date/time, location, capacity.
            // "View details" stays the safe universal action; "View &
            // Register" is a secondary nudge toward the same detail page,
            // since embedding the real RealRegisterButton/RegisterButton
            // flow here would duplicate its auth/mutation logic rather than
            // reuse it.
            subtitle = selected.organizationName ?? undefined;
            secondaryAction = { label: "View & Register", href: selected.href };
            if (selected.starts_at) {
              meta.push(
                <span key="time" className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {formatDateTime(selected.starts_at)}
                </span>,
              );
            }
            if (locationLabel) {
              meta.push(
                <span key="loc" className="flex items-center gap-1">
                  <MapPinIcon className="h-3 w-3" /> {locationLabel}
                </span>,
              );
            }
            if (selected.capacity != null && selected.registered != null) {
              const spotsLeft = selected.capacity - selected.registered;
              meta.push(
                <span key="attend" className="flex items-center gap-1">
                  <Users2 className="h-3 w-3" /> {selected.registered} going{spotsLeft > 0 ? ` · ${spotsLeft} spots left` : ""}
                </span>,
              );
            }
          } else {
            // Opportunity (gig/job/volunteer) — title, organization
            // (subtitle), type badge, Work Now/Urgent (tag), compensation,
            // timing, location, positions remaining. "View & Apply" is a
            // secondary nudge toward the detail page for the same reason as
            // events — the real Apply flow (ApplyButton/RealApplyButton)
            // needs auth state and mutation logic this map component
            // doesn't have and shouldn't duplicate.
            subtitle = selected.organizationName ?? undefined;
            secondaryAction = { label: "View & Apply", href: selected.href };
            meta.push(
              <Badge key="type" tone="flow">
                {OPPORTUNITY_TYPE_LABEL[selected.opportunityType ?? selected.entityType]}
              </Badge>,
            );
            if (selected.starts_at) {
              meta.push(<span key="time">{relativeTime(selected.starts_at)}</span>);
            }
            if (locationLabel) {
              meta.push(
                <span key="loc" className="flex items-center gap-1">
                  <MapPinIcon className="h-3 w-3" /> {locationLabel}
                </span>,
              );
            }
            meta.push(
              <span key="pay" className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> {selected.payCents ? `${formatCents(selected.payCents)}/hr` : "Volunteer"}
              </span>,
            );
            if (selected.slots != null && selected.slotsFilled != null) {
              const spotsLeft = selected.slots - selected.slotsFilled;
              meta.push(
                <span key="spots" className="flex items-center gap-1">
                  <Users2 className="h-3 w-3" /> {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left` : "Full"}
                </span>,
              );
            }
          }

          return (
            <DetailSheet
              open={!!selected}
              onClose={() => setSelectedId(null)}
              icon={<Icon className="h-4 w-4" />}
              tag={tag}
              title={selected.title}
              subtitle={subtitle}
              meta={meta}
              action={{ label: actionLabel, href: selected.href }}
              secondaryAction={secondaryAction}
              desktopPosition="bottom-left"
            />
          );
        })()}
    </div>
  );
}
