import { realtimeEvents } from '@benbax/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../services/api';
import { createRealtimeClient } from '../services/realtime';

type LiveDelivery = {
  id: string;
  trackingCode: string;
  status: string;
  pickupLabel: string;
  pickupLatitude: string;
  pickupLongitude: string;
  dropoffLabel: string;
  dropoffLatitude: string;
  dropoffLongitude: string;
  totalFare: string;
  trackingPoints?: Array<{ latitude: string; longitude: string; capturedAt: string }>;
  suspiciousEvents?: Array<{ id: string; type: string; severity: string; createdAt: string }>;
};

type AdminAlert = {
  id: string;
  type: string;
  severity: string;
  message: string;
  createdAt: string;
};

export function DeliveriesPage() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['live-deliveries'],
    queryFn: () => apiRequest<LiveDelivery[]>('/admin/deliveries/live'),
  });
  const deliveries = data ?? [];
  const mapBounds = useMemo(() => getMapBounds(deliveries), [deliveries]);

  useEffect(() => {
    const socket = createRealtimeClient();
    socket.on(realtimeEvents.adminAlert, (alert: AdminAlert) => {
      setAlerts((current) => [alert, ...current].slice(0, 8));
    });
    socket.on(realtimeEvents.trackingPoint, () => {
      refetch();
    });
    return () => {
      socket.disconnect();
    };
  }, [refetch]);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Delivery Monitoring</h1>
          <p>Track requested, assigned, pickup, in-transit, and exception deliveries.</p>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel span-2">
          <div className="panel-header">
            <h2>Live map</h2>
            <span className="live-dot">GPS</span>
          </div>
          <div className="ops-map">
            {deliveries.map((delivery) => {
              const latestPoint = delivery.trackingPoints?.[0];
              const pickup = projectPoint(
                {
                  latitude: Number(delivery.pickupLatitude),
                  longitude: Number(delivery.pickupLongitude),
                },
                mapBounds
              );
              const dropoff = projectPoint(
                {
                  latitude: Number(delivery.dropoffLatitude),
                  longitude: Number(delivery.dropoffLongitude),
                },
                mapBounds
              );
              const rider = latestPoint
                ? projectPoint(
                    {
                      latitude: Number(latestPoint.latitude),
                      longitude: Number(latestPoint.longitude),
                    },
                    mapBounds
                  )
                : null;

              return (
                <div key={delivery.id}>
                  <span
                    className="map-pin pickup"
                    style={{ left: `${pickup.x}%`, top: `${pickup.y}%` }}
                    title={`${delivery.trackingCode} pickup`}
                  />
                  <span
                    className="map-pin dropoff"
                    style={{ left: `${dropoff.x}%`, top: `${dropoff.y}%` }}
                    title={`${delivery.trackingCode} drop-off`}
                  />
                  {rider ? (
                    <span
                      className="map-pin rider"
                      style={{ left: `${rider.x}%`, top: `${rider.y}%` }}
                      title={`${delivery.trackingCode} rider`}
                    />
                  ) : null}
                </div>
              );
            })}
            {!deliveries.length ? <span className="muted">No live deliveries to map.</span> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Safety alerts</h2>
            <span className="status-chip">{alerts.length}</span>
          </div>
          <ul className="dense-list">
            {alerts.length ? (
              alerts.map((alert) => (
                <li key={alert.id}>
                  <strong>{alert.severity}</strong>
                  <span>{alert.message}</span>
                </li>
              ))
            ) : (
              <li>
                <strong>Clear</strong>
                <span>No new route alerts</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Pickup</th>
              <th>Drop-off</th>
              <th>Fare</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6}>Loading deliveries...</td>
              </tr>
            ) : deliveries.length ? (
              deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{delivery.trackingCode}</td>
                  <td>
                    <span className="status-chip">{delivery.status}</span>
                  </td>
                  <td>{delivery.pickupLabel}</td>
                  <td>{delivery.dropoffLabel}</td>
                  <td>GHS {delivery.totalFare}</td>
                  <td>{delivery.suspiciousEvents?.[0]?.severity ?? 'Clear'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>No active deliveries.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getMapBounds(deliveries: LiveDelivery[]) {
  const coordinates = deliveries.flatMap((delivery) => [
    { latitude: Number(delivery.pickupLatitude), longitude: Number(delivery.pickupLongitude) },
    { latitude: Number(delivery.dropoffLatitude), longitude: Number(delivery.dropoffLongitude) },
    ...(delivery.trackingPoints?.[0]
      ? [
          {
            latitude: Number(delivery.trackingPoints[0].latitude),
            longitude: Number(delivery.trackingPoints[0].longitude),
          },
        ]
      : []),
  ]);
  const latitudes = coordinates.map((coordinate) => coordinate.latitude).filter(Number.isFinite);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude).filter(Number.isFinite);

  return {
    minLatitude: Math.min(...latitudes, 5.5),
    maxLatitude: Math.max(...latitudes, 5.7),
    minLongitude: Math.min(...longitudes, -0.25),
    maxLongitude: Math.max(...longitudes, -0.1),
  };
}

function projectPoint(
  coordinate: { latitude: number; longitude: number },
  bounds: ReturnType<typeof getMapBounds>
) {
  const longitudeSpan = Math.max(bounds.maxLongitude - bounds.minLongitude, 0.01);
  const latitudeSpan = Math.max(bounds.maxLatitude - bounds.minLatitude, 0.01);
  return {
    x: ((coordinate.longitude - bounds.minLongitude) / longitudeSpan) * 86 + 7,
    y: (1 - (coordinate.latitude - bounds.minLatitude) / latitudeSpan) * 86 + 7,
  };
}
