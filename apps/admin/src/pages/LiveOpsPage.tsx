import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Clock, MapPin, Send, UserRound, Users, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveMap } from '../components/LiveMap';
import { MetricCard } from '../components/MetricCard';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import {
  distanceKm,
  formatKm,
  RIDE_STATUS_LABELS,
  type LiveDriver,
  type OpsOverview,
  type OpsPresence,
  type OpsRide,
  type OpsRides,
} from '../lib/opsTypes';
import { realtimeEvents } from '../lib/realtimeEvents';
import { apiRequest } from '../services/api';
import { createRealtimeClient } from '../services/realtime';

function secondsLeft(iso: string, now: number) {
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
}

function driverLabel(driver: {
  user: { name: string };
  vehicle: { plateNumber: string | null } | null;
}) {
  return `${driver.user.name}${driver.vehicle?.plateNumber ? ` · ${driver.vehicle.plateNumber}` : ''}`;
}

/** One ride waiting for a driver, with the operator's dispatch controls. */
function OpenRideCard({
  ride,
  idleDrivers,
  selected,
  now,
  busy,
  onSelect,
  onOffer,
  onCancel,
}: {
  ride: OpsRide;
  idleDrivers: LiveDriver[];
  selected: boolean;
  now: number;
  busy: boolean;
  onSelect: () => void;
  onOffer: (driverProfileId?: string) => void;
  onCancel: () => void;
}) {
  const [chosenDriver, setChosenDriver] = useState('');
  const nearest = useMemo(
    () =>
      idleDrivers
        .filter((d) => d.driverProfileId)
        .map((d) => ({ driver: d, km: distanceKm(d, ride.pickup) }))
        .sort((a, b) => a.km - b.km),
    [idleDrivers, ride.pickup]
  );

  return (
    <li className={`ride-card${selected ? ' ride-card-selected' : ''}`}>
      <button type="button" className="ride-card-main" onClick={onSelect}>
        <div className="ride-card-row">
          <strong>{ride.passenger.name}</strong>
          <span className="ride-fare">GHS {ride.fare.toFixed(2)}</span>
        </div>
        <span className="ride-route">
          <MapPin size={13} /> {ride.pickup.label} → {ride.dropoff.label}
        </span>
        <span className="muted table-subtext">
          <Clock size={12} /> {ride.ageMinutes} min waiting · {formatKm(ride.distanceKm)} trip ·{' '}
          {ride.offers.total} offer{ride.offers.total === 1 ? '' : 's'}
          {ride.offers.declined ? `, ${ride.offers.declined} declined` : ''}
        </span>
        {ride.pendingOffer ? (
          <span className="status-chip">
            Offered to {driverLabel(ride.pendingOffer.driver)} ·{' '}
            {secondsLeft(ride.pendingOffer.expiresAt, now)}s
          </span>
        ) : (
          <span className={`status-chip${nearest.length ? ' chip-muted' : ' chip-danger'}`}>
            {nearest.length
              ? 'Visible to all drivers · no offer pending'
              : 'No driver available right now'}
          </span>
        )}
      </button>
      <div className="ride-card-actions">
        <button
          type="button"
          className="primary-button small-button"
          disabled={busy || nearest.length === 0}
          onClick={() => onOffer()}
          title="Offer to the best-ranked available driver"
        >
          <Send size={14} /> Offer to best
        </button>
        <select
          value={chosenDriver}
          onChange={(event) => setChosenDriver(event.target.value)}
          aria-label="Choose a driver"
          disabled={busy || nearest.length === 0}
        >
          <option value="">Choose driver…</option>
          {nearest.map(({ driver, km }) => (
            <option key={driver.userId} value={driver.driverProfileId ?? ''}>
              {driver.name} · {formatKm(km)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="secondary-button small-button"
          disabled={busy || !chosenDriver}
          onClick={() => onOffer(chosenDriver)}
        >
          Offer
        </button>
        <button
          type="button"
          className="danger-button small-button"
          disabled={busy}
          onClick={onCancel}
          title="Cancel this ride request"
        >
          <XCircle size={14} />
        </button>
      </div>
    </li>
  );
}

export function LiveOpsPage() {
  const queryClient = useQueryClient();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const { data: overview } = useQuery({
    queryKey: ['ops-overview'],
    queryFn: () => apiRequest<OpsOverview>('/admin/ops/overview'),
    refetchInterval: 10_000,
  });
  const { data: presence } = useQuery({
    queryKey: ['ops-presence'],
    queryFn: () => apiRequest<OpsPresence>('/admin/ops/presence'),
    refetchInterval: 5_000,
  });
  const {
    data: rides,
    isLoading: ridesLoading,
    isError: ridesError,
    error: ridesErr,
  } = useQuery({
    queryKey: ['ops-rides'],
    queryFn: () => apiRequest<OpsRides>('/admin/ops/rides'),
    refetchInterval: 10_000,
  });

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['ops-rides'] });
    void queryClient.invalidateQueries({ queryKey: ['ops-overview'] });
    void queryClient.invalidateQueries({ queryKey: ['ops-presence'] });
  }, [queryClient]);

  // Ride lifecycle events arrive instantly on the admins socket room.
  useEffect(() => {
    const socket = createRealtimeClient();
    const onRideEvent = () => refreshAll();
    socket.on(realtimeEvents.rideRequested, onRideEvent);
    socket.on(realtimeEvents.rideAssigned, onRideEvent);
    socket.on(realtimeEvents.rideUpdated, onRideEvent);
    socket.on(realtimeEvents.driverAvailability, onRideEvent);
    return () => {
      socket.disconnect();
    };
  }, [refreshAll]);

  // Tick for offer countdowns.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const drivers = useMemo(() => presence?.drivers ?? [], [presence]);
  const passengers = useMemo(() => presence?.passengers ?? [], [presence]);
  const idleDrivers = useMemo(() => drivers.filter((d) => !d.busy), [drivers]);
  const openRides = useMemo(() => rides?.open ?? [], [rides]);
  const activeRides = useMemo(() => rides?.active ?? [], [rides]);
  const recentRides = useMemo(() => rides?.recent ?? [], [rides]);

  const offer = useMutation({
    mutationFn: ({ tripId, driverProfileId }: { tripId: string; driverProfileId?: string }) =>
      apiRequest(`/ride-dispatch/trips/${tripId}/assign`, {
        method: 'POST',
        body: JSON.stringify(driverProfileId ? { driverProfileId } : {}),
      }),
    onSuccess: () => {
      setNotice({ tone: 'ok', text: 'Offer sent — the driver has 30 seconds to accept.' });
      refreshAll();
    },
    onError: (err) => setNotice({ tone: 'error', text: (err as Error).message }),
  });

  const cancel = useMutation({
    mutationFn: (tripId: string) =>
      apiRequest(`/rides/${tripId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelled by Benbax operations' }),
      }),
    onSuccess: () => {
      setNotice({ tone: 'ok', text: 'Ride cancelled. Passenger and drivers were notified.' });
      refreshAll();
    },
    onError: (err) => setNotice({ tone: 'error', text: (err as Error).message }),
  });

  const confirmCancel = (ride: OpsRide) => {
    if (
      window.confirm(
        `Cancel ${ride.tripCode} for ${ride.passenger.name}? The passenger and any assigned driver will be notified.`
      )
    ) {
      cancel.mutate(ride.id);
    }
  };

  const mutating = offer.isPending || cancel.isPending;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Live operations</h1>
          <p>
            Every driver and passenger online right now, rides waiting for a driver, and trips in
            progress — nationwide, updating live.
          </p>
        </div>
        <span className="live-dot">Live</span>
      </div>

      <div className="metrics-grid metrics-grid-5">
        <MetricCard
          label="Drivers online"
          value={`${overview?.drivers.live ?? drivers.length}`}
          delta={`${overview?.drivers.idle ?? idleDrivers.length} available · ${overview?.drivers.busy ?? 0} on trip`}
          icon={<Car size={20} />}
        />
        <MetricCard
          label="Passengers online"
          value={`${overview?.passengersOnline ?? passengers.length}`}
          delta="App open with location"
          icon={<Users size={20} />}
        />
        <MetricCard
          label="Waiting for driver"
          value={`${overview?.rides.open ?? openRides.length}`}
          delta={
            openRides.length
              ? `Oldest ${Math.max(...openRides.map((r) => r.ageMinutes))} min`
              : 'None waiting'
          }
          icon={<Clock size={20} />}
        />
        <MetricCard
          label="Trips in progress"
          value={`${overview?.rides.active ?? activeRides.length}`}
          delta={`${overview?.rides.completedToday ?? 0} completed today`}
          icon={<MapPin size={20} />}
        />
        <MetricCard
          label="Ride revenue today"
          value={`GHS ${(overview?.rides.revenueTodayGhs ?? 0).toFixed(2)}`}
          delta={`${overview?.rides.requestedToday ?? 0} requested · ${overview?.rides.cancelledToday ?? 0} cancelled`}
          icon={<UserRound size={20} />}
        />
      </div>

      {overview?.drivers.staleOnline ? (
        <p className="form-notice">
          {overview.drivers.staleOnline} driver
          {overview.drivers.staleOnline === 1 ? ' is' : 's are'} marked online but their app isn't
          connected — they are hidden from passengers and won't receive offers until the app
          reconnects.
        </p>
      ) : null}
      {notice ? (
        <p className={notice.tone === 'ok' ? 'form-notice' : 'form-error'} role="status">
          {notice.text}
        </p>
      ) : null}

      <div className="split-layout live-layout">
        <div className="panel">
          <LiveMap
            drivers={drivers}
            passengers={passengers}
            openRides={openRides}
            activeRides={activeRides}
            selectedTripId={selectedTripId}
            onSelectTrip={setSelectedTripId}
          />
        </div>

        <div className="panel activity-panel">
          <div className="panel-header">
            <h2>Waiting for a driver ({openRides.length})</h2>
          </div>
          {ridesLoading ? (
            <p className="muted">Loading rides…</p>
          ) : ridesError ? (
            <p className="form-error">Failed to load: {(ridesErr as Error).message}</p>
          ) : openRides.length ? (
            <ul className="ride-list">
              {openRides.map((ride) => (
                <OpenRideCard
                  key={ride.id}
                  ride={ride}
                  idleDrivers={idleDrivers}
                  selected={ride.id === selectedTripId}
                  now={now}
                  busy={mutating}
                  onSelect={() => setSelectedTripId(ride.id)}
                  onOffer={(driverProfileId) =>
                    offer.mutate({
                      tripId: ride.id,
                      ...(driverProfileId ? { driverProfileId } : {}),
                    })
                  }
                  onCancel={() => confirmCancel(ride)}
                />
              ))}
            </ul>
          ) : (
            <p className="muted">
              Nobody is waiting. New requests appear here instantly and are visible to every online
              driver.
            </p>
          )}

          <div className="panel-header panel-subheader">
            <h2>Drivers online ({drivers.length})</h2>
          </div>
          {drivers.length ? (
            <ul className="dense-list compact-list">
              {drivers.map((driver) => (
                <li key={driver.userId}>
                  <strong>
                    {driver.name}
                    <span className="muted table-subtext">
                      {driver.vehicle
                        ? `${driver.vehicle.type}${driver.vehicle.plateNumber ? ` · ${driver.vehicle.plateNumber}` : ''}`
                        : 'No vehicle on file'}{' '}
                      · {driver.phone ?? '—'}
                    </span>
                  </strong>
                  <span>
                    <span className={`status-chip${driver.busy ? '' : ' chip-muted'}`}>
                      {driver.busy ? 'On trip' : 'Available'}
                    </span>
                    <span className="muted table-subtext">
                      GPS {formatRelativeTime(driver.lastSeenAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No drivers have the app open and online right now.</p>
          )}
        </div>
      </div>

      <div className="table-panel">
        <div className="panel-header table-heading">
          <h2>Trips in progress ({activeRides.length})</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Trip</th>
              <th>Status</th>
              <th>Driver</th>
              <th>Passenger</th>
              <th>Route</th>
              <th>Fare</th>
              <th>Last driver GPS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {activeRides.length ? (
              activeRides.map((ride) => (
                <tr
                  key={ride.id}
                  className={`row-clickable${ride.id === selectedTripId ? ' row-selected' : ''}`}
                  onClick={() => setSelectedTripId(ride.id)}
                >
                  <td>
                    <strong>{ride.tripCode}</strong>
                    <span className="muted table-subtext">{formatDateTime(ride.createdAt)}</span>
                  </td>
                  <td>
                    <span className="status-chip">
                      {RIDE_STATUS_LABELS[ride.status] ?? ride.status}
                    </span>
                  </td>
                  <td>
                    {ride.driver ? driverLabel(ride.driver) : '—'}
                    <span className="muted table-subtext">{ride.driver?.user.phone ?? ''}</span>
                  </td>
                  <td>
                    {ride.passenger.name}
                    <span className="muted table-subtext">{ride.passenger.phone}</span>
                  </td>
                  <td>
                    {ride.pickup.label}
                    <span className="muted table-subtext">→ {ride.dropoff.label}</span>
                  </td>
                  <td>GHS {ride.fare.toFixed(2)}</td>
                  <td>{formatRelativeTime(ride.driverPosition?.capturedAt ?? null)}</td>
                  <td>
                    {ride.status !== 'IN_PROGRESS' ? (
                      <button
                        type="button"
                        className="danger-button small-button"
                        disabled={mutating}
                        onClick={(event) => {
                          event.stopPropagation();
                          confirmCancel(ride);
                        }}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>No trips in progress.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-panel">
        <div className="panel-header table-heading">
          <h2>Finished in the last 24h ({recentRides.length})</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Trip</th>
              <th>Outcome</th>
              <th>Driver</th>
              <th>Passenger</th>
              <th>Route</th>
              <th>Fare</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {recentRides.length ? (
              recentRides.map((ride) => (
                <tr key={ride.id}>
                  <td>{ride.tripCode}</td>
                  <td>
                    <span
                      className={`status-chip${ride.status === 'CANCELLED' ? ' chip-danger' : ''}`}
                    >
                      {RIDE_STATUS_LABELS[ride.status] ?? ride.status}
                    </span>
                    {ride.cancellationReason ? (
                      <span className="muted table-subtext">{ride.cancellationReason}</span>
                    ) : null}
                  </td>
                  <td>{ride.driver ? driverLabel(ride.driver) : '—'}</td>
                  <td>{ride.passenger.name}</td>
                  <td>
                    {ride.pickup.label}
                    <span className="muted table-subtext">→ {ride.dropoff.label}</span>
                  </td>
                  <td>GHS {ride.fare.toFixed(2)}</td>
                  <td>{formatRelativeTime(ride.updatedAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>No rides finished in the last 24 hours.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
