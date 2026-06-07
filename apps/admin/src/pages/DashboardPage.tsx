import { useQuery } from '@tanstack/react-query';
import { Activity, Bike, CircleDollarSign, PackageCheck, Users } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { apiRequest } from '../services/api';

const demand = [
  { hour: '06', orders: 18 },
  { hour: '09', orders: 42 },
  { hour: '12', orders: 64 },
  { hour: '15', orders: 51 },
  { hour: '18', orders: 88 },
  { hour: '21', orders: 39 },
];

type Dashboard = {
  users: number;
  riders: number;
  activeDeliveries: number;
  revenueGhs: number;
};

export function DashboardPage() {
  const { data } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiRequest<Dashboard>('/admin/dashboard'),
  });

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Operations Overview</h1>
          <p>Live dispatch health, demand, rider supply, revenue, and support pressure.</p>
        </div>
        <span className="live-dot">Live</span>
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="Active deliveries"
          value={`${data?.activeDeliveries ?? 0}`}
          delta="+12% today"
          icon={<PackageCheck size={20} />}
        />
        <MetricCard
          label="Riders"
          value={`${data?.riders ?? 0}`}
          delta="82% verified"
          icon={<Bike size={20} />}
        />
        <MetricCard
          label="Users"
          value={`${data?.users ?? 0}`}
          delta="Ghana launch"
          icon={<Users size={20} />}
        />
        <MetricCard
          label="Revenue"
          value={`GHS ${data?.revenueGhs ?? 0}`}
          delta="Paid orders"
          icon={<CircleDollarSign size={20} />}
        />
      </div>

      <div className="panel-grid">
        <div className="panel span-2">
          <div className="panel-header">
            <h2>Demand curve</h2>
            <Activity size={18} />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={demand}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="hour" stroke="#5B6472" />
              <YAxis stroke="#5B6472" />
              <Tooltip />
              <Area type="monotone" dataKey="orders" stroke="#0E7C66" fill="#0E7C6633" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Dispatch quality</h2>
          </div>
          <ul className="dense-list">
            <li>
              <strong>Nearest rider match</strong>
              <span>Fresh GPS under 60s</span>
            </li>
            <li>
              <strong>Batching readiness</strong>
              <span>Food and courier clusters</span>
            </li>
            <li>
              <strong>Risk scan</strong>
              <span>No active severe alerts</span>
            </li>
            <li>
              <strong>Support SLA</strong>
              <span>Median first reply 2m</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
