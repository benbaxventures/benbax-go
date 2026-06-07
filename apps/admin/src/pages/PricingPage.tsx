export function PricingPage() {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Dynamic Pricing</h1>
          <p>
            Base fare, distance, time, service fee, surge, coupons, and category-specific rules.
          </p>
        </div>
        <button className="primary-button" type="button">
          New rule
        </button>
      </div>
      <div className="panel-grid">
        <div className="panel">
          <h2>Accra parcel default</h2>
          <dl className="definition-grid">
            <dt>Base fare</dt>
            <dd>GHS 18</dd>
            <dt>Per km</dt>
            <dd>GHS 3.50</dd>
            <dt>Per minute</dt>
            <dd>GHS 0.35</dd>
            <dt>Service fee</dt>
            <dd>GHS 2.50</dd>
          </dl>
        </div>
        <div className="panel">
          <h2>Promotion controls</h2>
          <p className="muted">
            Coupon limits, redemption windows, geofence targeting, and fraud throttling live here.
          </p>
        </div>
      </div>
    </section>
  );
}
