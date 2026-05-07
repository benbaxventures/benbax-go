export function UsersPage() {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>User Management</h1>
          <p>Customer records, saved locations, wallets, complaints, ratings, and lifecycle controls.</p>
        </div>
      </div>
      <div className="panel">
        <h2>Customer operations</h2>
        <ul className="dense-list">
          <li><strong>Saved locations</strong><span>Landmarks, voice notes, and WhatsApp pins</span></li>
          <li><strong>Wallet</strong><span>Top-ups, refunds, and COD reconciliation</span></li>
          <li><strong>Trust</strong><span>Blocked accounts and suspicious behavior review</span></li>
        </ul>
      </div>
    </section>
  );
}
