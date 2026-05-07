export function RiskPage() {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Fraud Detection</h1>
          <p>Suspicious activity, fake GPS, repeated cancellations, payment abuse, and emergency escalations.</p>
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel">
          <h2>Signals</h2>
          <ul className="dense-list">
            <li><strong>GPS drift</strong><span>Unrealistic speed or stale location</span></li>
            <li><strong>OTP mismatch</strong><span>Repeated delivery verification failures</span></li>
            <li><strong>Payment abuse</strong><span>Refund or chargeback anomaly</span></li>
          </ul>
        </div>
        <div className="panel">
          <h2>Actions</h2>
          <p className="muted">Hold payouts, freeze accounts, force facial verification, or escalate to operations.</p>
        </div>
      </div>
    </section>
  );
}
