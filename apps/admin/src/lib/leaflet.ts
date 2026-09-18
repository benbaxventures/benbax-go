// Leaflet is loaded on demand from a pinned CDN build (with Subresource
// Integrity) rather than bundled, so the admin stays deployable from its own
// folder without touching the monorepo lockfile, and the login page stays light.
const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = {
  href: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
  integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
const LEAFLET_JS = {
  src: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
  integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
};

export type LatLng = [number, number];

/** The slice of the Leaflet API the admin uses. */
export type LeafletLayer = {
  addTo(target: LeafletMap | LeafletLayerGroup): LeafletLayer;
  bindTooltip(content: string, options?: Record<string, unknown>): LeafletLayer;
  on(event: string, handler: () => void): LeafletLayer;
};
export type LeafletLayerGroup = {
  addTo(map: LeafletMap): LeafletLayerGroup;
  clearLayers(): void;
};
export type LeafletMap = {
  setView(center: LatLng, zoom: number): LeafletMap;
  fitBounds(bounds: LatLng[], options?: Record<string, unknown>): LeafletMap;
  invalidateSize(): void;
  remove(): void;
};
export type LeafletNamespace = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): LeafletLayer;
  layerGroup(): LeafletLayerGroup;
  circleMarker(at: LatLng, options?: Record<string, unknown>): LeafletLayer;
  polyline(points: LatLng[], options?: Record<string, unknown>): LeafletLayer;
};

let loading: Promise<LeafletNamespace> | null = null;

export function loadLeaflet(): Promise<LeafletNamespace> {
  const existing = (window as unknown as { L?: LeafletNamespace }).L;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;

  loading = new Promise<LeafletNamespace>((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS.href;
    css.integrity = LEAFLET_CSS.integrity;
    css.crossOrigin = '';
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = LEAFLET_JS.src;
    script.integrity = LEAFLET_JS.integrity;
    script.crossOrigin = '';
    script.async = true;
    script.onload = () => {
      const L = (window as unknown as { L?: LeafletNamespace }).L;
      if (L) resolve(L);
      else reject(new Error('Leaflet failed to initialise'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the map library'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
