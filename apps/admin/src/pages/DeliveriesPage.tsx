import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { realtimeEvents } from '../lib/realtimeEvents';
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

type SupplyUnit = {
  id: string;
  kind: 'RIDER' | 'DRIVER';
  name: string;
  phone: string;
  status: string;
  latitude: string;
  longitude: string;
  lastLocationAt: string | null;
  isBusy: boolean;
};

export function DeliveriesPage() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['live-deliveries'],
    queryFn: () => apiRequest<LiveDelivery[]>('/admin/deliveries/live'),
  });
  const { data: supplyData } = useQuery({
    queryKey: ['live-supply'],
    queryFn: () => apiRequest<SupplyUnit[]>('/admin/supply/live'),
    refetchInterval: 15_000,
  });
  const deliveries = useMemo(() => data ?? [], [data]);
  const supply = useMemo(() => supplyData ?? [], [supplyData]);
  const mapBounds = useMemo(() => getMapBounds(deliveries, supply), [deliveries, supply]);

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
            <h2>Live map — orders &amp; online supply</h2>
            <div className="map-legend">
              <span className="legend-item">
                <span className="map-pin supply-idle legend-pin" /> Idle (
                {supply.filter((unit) => !unit.isBusy).length})
              </span>
              <span className="legend-item">
                <span className="map-pin supply-busy legend-pin" /> On job (
                {supply.filter((unit) => unit.isBusy).length})
              </span>
              <span className="live-dot">GPS</span>
            </div>
          </div>
          <div className="ops-map">
            {supply.map((unit) => {
              const point = projectPoint(
                { latitude: Number(unit.latitude), longitude: Number(unit.longitude) },
                mapBounds
              );
              return (
                <span
                  key={`${unit.kind}-${unit.id}`}
                  className={`map-pin ${unit.isBusy ? 'supply-busy' : 'supply-idle'}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  title={`${unit.name} (${unit.kind}) · ${unit.status} · GPS ${formatRelativeTime(unit.lastLocationAt)}`}
                />
              );
            })}
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
            {!deliveries.length && !supply.length ? (
              <span className="muted">No live deliveries or online supply to map.</span>
            ) : null}
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
                <tr
                  key={delivery.id}
                  className={`row-clickable${selectedDeliveryId === delivery.id ? ' row-selected' : ''}`}
                  onClick={() => setSelectedDeliveryId(delivery.id)}
                >
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

      {selectedDeliveryId ? (
        <OrderTimelinePanel
          deliveryId={selectedDeliveryId}
          onClose={() => setSelectedDeliveryId(null)}
        />
      ) : null}
    </section>
  );
}

type OrderTimeline = {
  kind: string;
  order: {
    id: string;
    trackingCode: string;
    status: string;
    totalFare: string;
    cancelledBy: string | null;
    cancellationReason: string | null;
    createdAt: string;
    customer: { name: string; phone: string };
    payment: { method: string; status: string; amount: string } | null;
    statusEvents: Array<{
      id: string;
      fromStatus: string | null;
      toStatus: string;
      note: string | null;
      createdAt: string;
    }>;
    assignments: Array<{
      status: string;
      offeredAt: string;
      respondedAt: string | null;
      riderProfile: { user: { name: string; phone: string } };
    }>;
  };
};

function OrderTimelinePanel({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['order-timeline', deliveryId],
    queryFn: () => apiRequest<OrderTimeline>(`/admin/orders/delivery/${deliveryId}/timeline`),
  });

  const order = data?.order;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Order timeline {order ? `— ${order.trackingCode}` : ''}</h2>
        <button type="button" className="icon-button" aria-label="Close timeline" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {isLoading || !order ? (
        <p className="muted">Loading timeline...</p>
      ) : (
        <>
          <dl className="definition-grid">
            <dt>Customer</dt>
            <dd>
              {order.customer.name} · {order.customer.phone}
            </dd>
            <dt>Status</dt>
            <dd>{order.status}</dd>
            <dt>Fare</dt>
            <dd>GHS {order.totalFare}</dd>
            {order.payment ? (
              <>
                <dt>Payment</dt>
                <dd>
                  {order.payment.method} · {order.payment.status}
                </dd>
              </>
            ) : null}
            {order.cancelledBy ? (
              <>
                <dt>Cancelled by</dt>
                <dd>
                  {order.cancelledBy}
                  {order.cancellationReason ? ` — ${order.cancellationReason}` : ''}
                </dd>
              </>
            ) : null}
            {order.assignments[0] ? (
              <>
                <dt>Rider</dt>
                <dd>
                  {order.assignments[0].riderProfile.user.name} ({order.assignments[0].status})
                </dd>
              </>
            ) : null}
          </dl>
          <h3 className="timeline-heading">Lifecycle</h3>
          {order.statusEvents.length ? (
            <ul className="timeline">
              {order.statusEvents.map((event) => (
                <li key={event.id}>
                  <div className="timeline-row">
                    <strong>
                      {event.fromStatus ? `${event.fromStatus} → ` : ''}
                      {event.toStatus}
                    </strong>
                    <time>{formatDateTime(event.createdAt)}</time>
                  </div>
                  {event.note ? <span className="muted">{event.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              No lifecycle events recorded yet (events start once the new tracking is deployed).
            </p>
          )}
        </>
      )}
    </div>
  );
}

function getMapBounds(deliveries: LiveDelivery[], supply: SupplyUnit[] = []) {
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
  const supplyCoordinates = supply.map((unit) => ({
    latitude: Number(unit.latitude),
    longitude: Number(unit.longitude),
  }));
  const allCoordinates = [...coordinates, ...supplyCoordinates];
  const latitudes = allCoordinates.map((coordinate) => coordinate.latitude).filter(Number.isFinite);
  const longitudes = allCoordinates
    .map((coordinate) => coordinate.longitude)
    .filter(Number.isFinite);

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
