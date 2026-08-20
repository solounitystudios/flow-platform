"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { GeolocateControl, Layer, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { Briefcase, Building2, CalendarDays, HandHeart, Loader2, MapPin as MapPinIcon, TriangleAlert, Zap } from "lucide-react";
import { CITY_CENTER } from "@/lib/mock/data";
import { cn, relativeTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ChipToggleGroup, type ChipOption } from "@/components/ui/ChipToggleGroup";
import { DetailSheet } from "@/components/ui/DetailSheet";
import type { MapItem, MapItemType } from "@/lib/data/discover";

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

const LAYER_META: Record<MapItemType, { label: string; icon: typeof Briefcase; hex: string; tone: NonNullable<ChipOption["tone"]> }> = {
  opportunity: { label: "Jobs", icon: Briefcase, hex: "#4a2af5", tone: "flow" },
  work_now: { label: "Work Now", icon: Zap, hex: "#ef4444", tone: "danger" },
  event: { label: "Events", icon: CalendarDays, hex: "#f5b731", tone: "gold" },
  community: { label: "Community", icon: HandHeart, hex: "#22c55e", tone: "verified" },
  business: { label: "Businesses", icon: Building2, hex: "#707a90", tone: "neutral" },
};

const LAYER_ORDER: MapItemType[] = ["opportunity", "work_now", "event", "community", "business"];

function toFeatureCollection(items: MapItem[]): FeatureCollection<Point, { id: string; type: MapItemType }> {
  return {
    type: "FeatureCollection",
    features: items.map(
      (item): Feature<Point, { id: string; type: MapItemType }> => ({
        type: "Feature",
        id: item.id,
        geometry: { type: "Point", coordinates: [item.longitude, item.latitude] },
        properties: { id: item.id, type: item.type },
      }),
    ),
  };
}

function sourceId(type: MapItemType) {
  return `flow-${type}-source`;
}
function clusterLayerId(type: MapItemType) {
  return `flow-${type}-clusters`;
}
function clusterCountLayerId(type: MapItemType) {
  return `flow-${type}-cluster-count`;
}
function pointLayerId(type: MapItemType) {
  return `flow-${type}-point`;
}

export function LiveMap({ items, businessesAvailable = false }: { items: MapItem[]; businessesAvailable?: boolean }) {
  const mapRef = useRef<MapRef>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeLayers, setActiveLayers] = useState<string[]>(LAYER_ORDER);

  const itemsByType = useMemo(() => {
    const map = new Map<MapItemType, MapItem[]>();
    for (const type of LAYER_ORDER) map.set(type, []);
    for (const item of items) map.get(item.type)?.push(item);
    return map;
  }, [items]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  const layerOptions: ChipOption[] = LAYER_ORDER.map((type) => {
    const meta = LAYER_META[type];
    const Icon = meta.icon;
    const deferred = type === "business" && !businessesAvailable;
    const count = itemsByType.get(type)?.length ?? 0;
    return {
      id: type,
      label: `${meta.label} · ${deferred ? "soon" : count}`,
      icon: <Icon className="h-3.5 w-3.5" />,
      tone: meta.tone,
      disabled: deferred,
    };
  });

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
      LAYER_ORDER.filter((t) => activeLayers.includes(t) && (itemsByType.get(t)?.length ?? 0) > 0).flatMap((t) => [
        clusterLayerId(t),
        pointLayerId(t),
      ]),
    [activeLayers, itemsByType],
  );

  const handleClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      setSelectedId(null);
      return;
    }
    const layerId = feature.layer?.id ?? "";
    const type = LAYER_ORDER.find((t) => layerId === clusterLayerId(t));

    if (type) {
      // Clicked a cluster bubble — zoom in toward its expansion zoom rather
      // than trying to pick an individual pin out of the cluster.
      const clusterId = feature.properties?.cluster_id;
      const map = mapRef.current?.getMap();
      const source = map?.getSource(sourceId(type)) as GeoJSONSource | undefined;
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
  }, []);

  return (
    <div className="space-y-3">
      <ChipToggleGroup aria-label="Map layers" options={layerOptions} value={activeLayers} onChange={setActiveLayers} />

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

              {LAYER_ORDER.map((type) => {
                const typeItems = itemsByType.get(type) ?? [];
                if (!activeLayers.includes(type) || typeItems.length === 0) return null;
                const collection = toFeatureCollection(typeItems);
                const color = LAYER_META[type].hex;
                return (
                  <Source key={type} id={sourceId(type)} type="geojson" data={collection} cluster clusterMaxZoom={14} clusterRadius={50}>
                    <Layer
                      id={clusterLayerId(type)}
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
                      id={clusterCountLayerId(type)}
                      type="symbol"
                      filter={["has", "point_count"]}
                      layout={{ "text-field": "{point_count_abbreviated}", "text-size": 12, "text-font": ["Noto Sans Bold"] }}
                      paint={{ "text-color": "#ffffff" }}
                    />
                    <Layer
                      id={pointLayerId(type)}
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
              <EmptyState title="Nothing live nearby yet" body="Check back soon, or widen your filters — new gigs, events, and opportunities post throughout the day." />
            </div>
          </div>
        )}
      </div>

      {selected &&
        (() => {
          const meta = LAYER_META[selected.type];
          const Icon = meta.icon;
          const locationLabel = [selected.city, selected.state].filter(Boolean).join(", ");
          return (
            <DetailSheet
              open={!!selected}
              onClose={() => setSelectedId(null)}
              icon={<Icon className="h-4 w-4" />}
              tag={selected.urgency === "urgent" ? <Badge tone="urgent">Urgent</Badge> : selected.verified ? <Badge tone="verified">Verified</Badge> : undefined}
              title={selected.title}
              subtitle={meta.label}
              meta={[
                locationLabel && (
                  <span key="loc" className="flex items-center gap-1">
                    <MapPinIcon className="h-3 w-3" /> {locationLabel}
                  </span>
                ),
                selected.starts_at && <span key="time">{relativeTime(selected.starts_at)}</span>,
              ].filter(Boolean)}
              action={{ label: "View details", href: selected.href }}
              desktopPosition="bottom-left"
            />
          );
        })()}
    </div>
  );
}
