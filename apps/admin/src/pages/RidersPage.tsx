import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { apiRequest } from '../services/api';

const KIND_TABS = [
  { value: 'ALL', label: 'All supply' },
  { value: 'RIDER', label: 'Riders (delivery)' },
  { value: 'DRIVER', label: 'Drivers (rides)' },
] as const;

type SupplyKind = (typeof KIND_TABS)[number]['value'];

type SupplyRow = {
  id: string;
  kind: 'RIDER' | 'DRIVER';
  status: string;
  kycStatus: string;
  isOnline: boolean;
  rating: string;
  totalJobs: number;
  lastLocationAt: string | null;
  vehicle: { type: string; plateNumber: string | null } | null;
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    status: string;
    createdAt: string;
    lastSeenAt: string | null;
  };
};

type SupplyResponse = {
  items: SupplyRow[];
  summary: { total: number; online: number; pendingKyc: number };
};

export function RidersPage() {
  const [kind, setKind] = useState<SupplyKind>('ALL');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-supply', kind],
    queryFn: () =>
      apiRequest<SupplyResponse>(`/admin/drivers${kind === 'ALL' ? '' : `?kind=${kind}`}`),
    refetchInterval: 30_000,
  });

  const rows = data?.items ?? [];
  const summary = data?.summary;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Rider &amp; Driver Monitoring</h1>
          <p>
            Live online status, KYC pipeline, ratings, job volume, GPS freshness, and last activity
            for the entire supply fleet.
          </p>
        </div>
        <span className="live-dot">Auto-refresh 30s</span>
      </div>

      <div className="metrics-grid metrics-grid-3">
        <div className="metric-card">
          <span>Total supply</span>
          <strong>{summary?.total ?? 0}</strong>
          <small>Registered riders and drivers</small>
        </div>
        <div className="metric-card">
          <span>Online now</span>
          <strong>{summary?.online ?? 0}</strong>
          <small>Accepting jobs</small>
        </div>
        <div className="metric-card">
          <span>KYC pending</span>
          <strong>{summary?.pendingKyc ?? 0}</strong>
          <small>Not started or awaiting review</small>
        </div>
      </div>

      <div className="tab-row" role="tablist" aria-label="Supply type">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={kind === tab.value}
            className={`tab-button${kind === tab.value ? ' tab-active' : ''}`}
            onClick={() => setKind(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Online</th>
              <th>Status</th>
              <th>KYC</th>
              <th>Rating</th>
              <th>Jobs</th>
              <th>Last GPS ping</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10}>Loading supply...</td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={10}>Failed to load: {(error as Error).message}</td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td>
                    <strong>{row.user.name}</strong>
                    {row.vehicle ? (
                      <span className="muted table-subtext">
                        {row.vehicle.type}
                        {row.vehicle.plateNumber ? ` · ${row.vehicle.plateNumber}` : ''}
                      </span>
                    ) : null}
                  </td>
                  <td>{row.user.phone}</td>
                  <td>
                    <span className="status-chip">{row.kind}</span>
                  </td>
                  <td>
                    {row.isOnline ? (
                      <span className="status-chip">Online</span>
                    ) : (
                      <span className="status-chip chip-muted">Offline</span>
                    )}
                  </td>
                  <td>{row.status}</td>
                  <td>
                    <span
                      className={`status-chip${row.kycStatus === 'VERIFIED' ? '' : row.kycStatus === 'REJECTED' ? ' chip-danger' : ' chip-muted'}`}
                    >
                      {row.kycStatus}
                    </span>
                  </td>
                  <td>{Number(row.rating).toFixed(1)}</td>
                  <td>{row.totalJobs}</td>
                  <td>{formatRelativeTime(row.lastLocationAt)}</td>
                  <td>{formatDateTime(row.user.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10}>No riders or drivers registered yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
