import { Crosshair } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatRelativeTime } from '../lib/format';
import {
  loadLeaflet,
  type LatLng,
  type LeafletLayerGroup,
  type LeafletMap,
  type LeafletNamespace,
} from '../lib/leaflet';
import type { LiveDriver, LivePassenger, OpsRide } from '../lib/opsTypes';

// Geographic centre of Ghana — the default view before anything is online.
const GHANA_CENTER: LatLng = [7.95, -1.03];
const GHANA_ZOOM = 7;

const COLORS = {
  driverIdle: '#12b76a',
  driverBusy: '#f79009',
  passenger: '#7c3aed',
  request: '#d92d20',
  trip: '#2563eb',
  dropoff: '#111827',
};

type Props = {
  drivers: LiveDriver[];
  passengers: LivePassenger[];
  openRides: OpsRide[];
  activeRides: OpsRide[];
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Street map of everything live: drivers (idle/on trip), passengers with the
 * app open, rides waiting for a driver, and trips in progress. Redrawn on
 * every data refresh; the camera only moves when the operator asks.
 */
export function LiveMap({
  drivers,
  passengers,
  openRides,
  activeRides,
  selectedTripId,
  onSelectTrip,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletLayerGroup | null>(null);
  const leafletRef = useRef<LeafletNamespace | null>(null);
  const fittedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        leafletRef.current = L;
        const map = L.map(containerRef.current, { zoomControl: true }).setView(
          GHANA_CENTER,
          GHANA_ZOOM
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Map unavailable');
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  const allPoints = (): LatLng[] => [
    ...drivers.map((d): LatLng => [d.latitude, d.longitude]),
    ...passengers.map((p): LatLng => [p.latitude, p.longitude]),
    ...openRides.map((r): LatLng => [r.pickup.latitude, r.pickup.longitude]),
    ...activeRides.flatMap((r): LatLng[] => [
      [r.pickup.latitude, r.pickup.longitude],
      [r.dropoff.latitude, r.dropoff.longitude],
    ]),
  ];

  const fitToEverything = () => {
    const points = allPoints();
    if (!mapRef.current) return;
    if (points.length === 0) mapRef.current.setView(GHANA_CENTER, GHANA_ZOOM);
    else mapRef.current.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  };

  // Redraw markers whenever the live data changes.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();

    for (const ride of activeRides) {
      const selected = ride.id === selectedTripId;
      const route: LatLng[] = [
        [ride.pickup.latitude, ride.pickup.longitude],
        [ride.dropoff.latitude, ride.dropoff.longitude],
      ];
      L.polyline(route, {
        color: COLORS.trip,
        weight: selected ? 5 : 3,
        opacity: selected ? 0.9 : 0.55,
        dashArray: ride.status === 'IN_PROGRESS' ? undefined : '6 8',
      })
        .on('click', () => onSelectTrip(ride.id))
        .addTo(layer);
      L.circleMarker([ride.dropoff.latitude, ride.dropoff.longitude], {
        radius: 5,
        color: '#fff',
        weight: 2,
        fillColor: COLORS.dropoff,
        fillOpacity: 1,
      })
        .bindTooltip(`Drop-off · ${escapeHtml(ride.tripCode)}<br>${escapeHtml(ride.dropoff.label)}`)
        .addTo(layer);
    }

    for (const ride of openRides) {
      const selected = ride.id === selectedTripId;
      L.circleMarker([ride.pickup.latitude, ride.pickup.longitude], {
        radius: selected ? 12 : 9,
        color: '#fff',
        weight: 3,
        fillColor: COLORS.request,
        fillOpacity: 0.95,
      })
        .bindTooltip(
          `<strong>Waiting · ${escapeHtml(ride.passenger.name)}</strong><br>` +
            `${escapeHtml(ride.pickup.label)} → ${escapeHtml(ride.dropoff.label)}<br>` +
            `GHS ${ride.fare.toFixed(2)} · ${ride.ageMinutes} min ago`
        )
        .on('click', () => onSelectTrip(ride.id))
        .addTo(layer);
    }

    for (const passenger of passengers) {
      L.circleMarker([passenger.latitude, passenger.longitude], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: COLORS.passenger,
        fillOpacity: 0.9,
      })
        .bindTooltip(
          `<strong>${escapeHtml(passenger.name)}</strong> (passenger)<br>` +
            `Online ${formatRelativeTime(passenger.onlineSince)}` +
            (passenger.tripStatus ? `<br>Ride: ${escapeHtml(passenger.tripStatus)}` : '')
        )
        .addTo(layer);
    }

    for (const driver of drivers) {
      const vehicle = driver.vehicle
        ? `${driver.vehicle.type}${driver.vehicle.plateNumber ? ` · ${driver.vehicle.plateNumber}` : ''}`
        : 'Vehicle not set';
      L.circleMarker([driver.latitude, driver.longitude], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: driver.busy ? COLORS.driverBusy : COLORS.driverIdle,
        fillOpacity: 1,
      })
        .bindTooltip(
          `<strong>${escapeHtml(driver.name)}</strong> (${driver.busy ? 'on trip' : 'available'})<br>` +
            `${escapeHtml(vehicle)}<br>GPS ${formatRelativeTime(driver.lastSeenAt)}`
        )
        .on('click', () => {
          if (driver.activeTripId) onSelectTrip(driver.activeTripId);
        })
        .addTo(layer);
    }

    // Frame the action once, the first time there is something to show.
    if (!fittedRef.current && allPoints().length > 0) {
      fittedRef.current = true;
      fitToEverything();
    }
    // allPoints/fitToEverything read the same props listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, drivers, passengers, openRides, activeRides, selectedTripId, onSelectTrip]);

  // Jump to a trip when it's selected from the lists.
  useEffect(() => {
    if (!ready || !selectedTripId || !mapRef.current) return;
    const ride = [...openRides, ...activeRides].find((r) => r.id === selectedTripId);
    if (!ride) return;
    const points: LatLng[] = [
      [ride.pickup.latitude, ride.pickup.longitude],
      [ride.dropoff.latitude, ride.dropoff.longitude],
    ];
    if (ride.driverPosition)
      points.push([ride.driverPosition.latitude, ride.driverPosition.longitude]);
    mapRef.current.fitBounds(points, { padding: [60, 60], maxZoom: 15 });
    // Only when the selection changes, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedTripId]);

  return (
    <div className="live-map-wrap">
      <div ref={containerRef} className="live-map" role="region" aria-label="Live operations map" />
      {error ? <div className="live-map-overlay">{error}</div> : null}
      {!ready && !error ? <div className="live-map-overlay">Loading map…</div> : null}
      <button type="button" className="map-fit-button" onClick={fitToEverything}>
        <Crosshair size={16} /> Fit all
      </button>
      <div className="map-key">
        <span>
          <i style={{ background: COLORS.driverIdle }} /> Driver available
        </span>
        <span>
          <i style={{ background: COLORS.driverBusy }} /> Driver on trip
        </span>
        <span>
          <i style={{ background: COLORS.passenger }} /> Passenger online
        </span>
        <span>
          <i style={{ background: COLORS.request }} /> Waiting for driver
        </span>
        <span>
          <i style={{ background: COLORS.trip }} /> Trip route
        </span>
      </div>
    </div>
  );
}
