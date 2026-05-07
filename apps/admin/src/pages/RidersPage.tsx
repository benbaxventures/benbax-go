export function RidersPage() {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Rider Management</h1>
          <p>KYC review, online supply, performance analytics, payouts, and safety flags.</p>
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel">
          <h2>KYC pipeline</h2>
          <ul className="dense-list">
            <li><strong>Submitted</strong><span>Awaiting Ghana Card review</span></li>
            <li><strong>Facial verification</strong><span>Face match required before activation</span></li>
            <li><strong>Vehicle checks</strong><span>Plate and license validation</span></li>
          </ul>
        </div>
        <div className="panel">
          <h2>Performance controls</h2>
          <ul className="dense-list">
            <li><strong>Acceptance rate</strong><span>Dispatch priority input</span></li>
            <li><strong>Completion rate</strong><span>Incentive and suspension input</span></li>
            <li><strong>GPS freshness</strong><span>Fraud and ETA quality input</span></li>
          </ul>
        </div>
      </div>
    </section>
  );
}
