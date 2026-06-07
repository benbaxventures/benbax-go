export function GeofencesPage() {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Geofence Management</h1>
          <p>
            City zones, restricted routes, surge areas, service availability, and safety hotspots.
          </p>
        </div>
        <button className="primary-button" type="button">
          Draw zone
        </button>
      </div>
      <div className="map-placeholder">
        <span>Accra service zones</span>
      </div>
    </section>
  );
}
