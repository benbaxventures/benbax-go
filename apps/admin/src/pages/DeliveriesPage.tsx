import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/api';

type LiveDelivery = {
  id: string;
  trackingCode: string;
  status: string;
  pickupLabel: string;
  dropoffLabel: string;
  totalFare: string;
};

export function DeliveriesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['live-deliveries'],
    queryFn: () => apiRequest<LiveDelivery[]>('/admin/deliveries/live')
  });

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Delivery Monitoring</h1>
          <p>Track requested, assigned, pickup, in-transit, and exception deliveries.</p>
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
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5}>Loading deliveries...</td></tr>
            ) : data?.length ? (
              data.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{delivery.trackingCode}</td>
                  <td><span className="status-chip">{delivery.status}</span></td>
                  <td>{delivery.pickupLabel}</td>
                  <td>{delivery.dropoffLabel}</td>
                  <td>GHS {delivery.totalFare}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5}>No active deliveries.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
