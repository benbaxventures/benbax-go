export function SupportPage() {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Complaint Handling</h1>
          <p>Payment disputes, rider issues, delivery proof review, emergency follow-up, and SLA tracking.</p>
        </div>
      </div>
      <div className="panel">
        <h2>Smart support queue</h2>
        <ul className="dense-list">
          <li><strong>Urgent</strong><span>Emergency and safety incidents</span></li>
          <li><strong>Payment</strong><span>MoMo, Paystack, wallet, and COD issues</span></li>
          <li><strong>Delivery proof</strong><span>Photo, OTP, signature, and timestamp review</span></li>
        </ul>
      </div>
    </section>
  );
}
