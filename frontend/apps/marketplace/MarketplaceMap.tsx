import { useCallback, useEffect, useRef } from 'react';
import {
  buildMarketplaceOrderUrl,
  resolveSafeLogoUrl,
  type Coordinates,
  type MarketplaceLocale,
  type MarketplaceTenantDto,
  type MarketplaceViewMode
} from '@shared/contracts/marketplace';
import { CompassIcon } from './MarketplaceIcons';
import { formatDistanceLabel, MARKETPLACE_DICTIONARY } from './marketplace-i18n';

interface MapLibreFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface MapLibreGeoJsonSource {
  setData: (data: unknown) => void;
  getClusterExpansionZoom: (clusterId: number, cb: (err: unknown, zoom: number) => void) => void;
}

interface MapLibrePopupInstance {
  setDOMContent: (node: Node) => MapLibrePopupInstance;
  isOpen: () => boolean;
}

interface MapLibreMarkerInstance {
  setLngLat: (coords: [number, number]) => MapLibreMarkerInstance;
  setPopup: (popup: MapLibrePopupInstance) => MapLibreMarkerInstance;
  addTo: (map: MapLibreMapInstance) => MapLibreMarkerInstance;
  remove: () => void;
  getPopup: () => MapLibrePopupInstance | undefined;
  togglePopup: () => void;
}

interface MapLibreMapInstance {
  addControl: (control: unknown, position: string) => void;
  on: (event: string, cb: () => void) => void;
  getSource: (id: string) => MapLibreGeoJsonSource | undefined;
  addSource: (id: string, spec: unknown) => void;
  getLayer: (id: string) => unknown;
  addLayer: (spec: unknown) => void;
  queryRenderedFeatures: (options: { layers: string[] }) => MapLibreFeature[];
  flyTo: (options: Record<string, unknown>) => void;
  fitBounds: (bounds: MapLibreBoundsInstance, options: Record<string, unknown>) => void;
  getZoom: () => number;
  resize: () => void;
  remove: () => void;
}

interface MapLibreBoundsInstance {
  extend: (coords: [number, number]) => void;
}

interface MapLibreNamespace {
  Map: new (options: Record<string, unknown>) => MapLibreMapInstance;
  NavigationControl: new (options: Record<string, unknown>) => unknown;
  Marker: new (options: Record<string, unknown>) => MapLibreMarkerInstance;
  Popup: new (options: Record<string, unknown>) => MapLibrePopupInstance;
  LngLatBounds: new () => MapLibreBoundsInstance;
}

interface MapWindow extends Window {
  maplibregl?: MapLibreNamespace;
}

export interface MarketplaceMapProps {
  tenants: readonly MarketplaceTenantDto[];
  locale: MarketplaceLocale;
  apiBase: string;
  userCoords: Coordinates | null;
  activeTenantId: string | null;
  hoveredTenantId: string | null;
  selectedSignal: { tenantId: string; nonce: number } | null;
  fitInitialNonce: number;
  viewMode: MarketplaceViewMode;
  onSelectStore: (tenantId: string) => void;
}

const UTENSILS_SVG_PATHS = [
  'M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2',
  'M15 2v10',
  'M15 14v8',
  'M6 2v20',
  'M6 2a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3'
];

const BAG_SVG_PATHS = ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'];

function createSvgIcon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon-svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function buildGeoJson(tenants: readonly MarketplaceTenantDto[]) {
  return {
    type: 'FeatureCollection',
    features: tenants
      .filter((tenant) => tenant.latitude != null && tenant.longitude != null)
      .map((tenant) => ({
        type: 'Feature',
        id: tenant.tenantId,
        geometry: {
          type: 'Point',
          coordinates: [Number(tenant.longitude), Number(tenant.latitude)]
        },
        properties: {
          tenantId: tenant.tenantId
        }
      }))
  };
}

function buildPopupElement(
  tenant: MarketplaceTenantDto,
  locale: MarketplaceLocale,
  apiBase: string
): HTMLElement {
  const dict = MARKETPLACE_DICTIONARY[locale];
  const isOpen = tenant.isOpen;
  const statusClass = isOpen ? 'open' : tenant.storeStatus === 'busy' ? 'busy' : 'closed';
  const statusText = isOpen ? dict.openNow : tenant.storeStatus === 'busy' ? dict.busy : dict.closed;
  const brandColor = tenant.brandColor || '#059669';
  const safeLogoUrl = resolveSafeLogoUrl(tenant.logoUrl);
  const distStr = formatDistanceLabel(tenant.distanceKm, locale);
  const orderUrl = buildMarketplaceOrderUrl(tenant.tenantId, tenant.orderUrl, apiBase);

  const card = document.createElement('div');
  card.className = 'map-popup-card';

  const header = document.createElement('div');
  header.className = 'popup-header';

  const avatar = document.createElement('div');
  avatar.className = 'popup-avatar';
  avatar.style.border = `1px solid ${brandColor}33`;
  if (safeLogoUrl) {
    const img = document.createElement('img');
    img.src = safeLogoUrl;
    img.alt = tenant.brandName;
    avatar.appendChild(img);
  } else {
    const letter = document.createElement('span');
    letter.textContent = tenant.brandName.charAt(0);
    avatar.appendChild(letter);
  }

  const titleBox = document.createElement('div');
  const title = document.createElement('h4');
  title.className = 'popup-brand-name';
  title.textContent = tenant.brandName;
  titleBox.appendChild(title);

  const statusBadge = document.createElement('span');
  statusBadge.className = `status-badge ${statusClass}`;
  statusBadge.style.marginTop = '2px';
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  statusBadge.appendChild(dot);
  statusBadge.appendChild(document.createTextNode(` ${statusText}`));
  titleBox.appendChild(statusBadge);

  if (distStr) {
    const distSpan = document.createElement('span');
    distSpan.style.fontSize = '0.75rem';
    distSpan.style.color = 'var(--text-muted)';
    distSpan.style.marginLeft = '4px';
    distSpan.textContent = distStr;
    titleBox.appendChild(distSpan);
  }

  header.appendChild(avatar);
  header.appendChild(titleBox);
  card.appendChild(header);

  const address = document.createElement('p');
  address.className = 'popup-address';
  address.textContent = tenant.storeAddress ? (tenant.storeAddress.split('\n')[0] ?? '') : '';
  card.appendChild(address);

  const footer = document.createElement('div');
  footer.className = 'popup-footer';
  const orderLink = document.createElement('a');
  orderLink.className = 'popup-order-btn';
  orderLink.href = orderUrl;
  orderLink.appendChild(createSvgIcon(BAG_SVG_PATHS));
  orderLink.appendChild(document.createTextNode(` ${dict.btnOrder} →`));
  footer.appendChild(orderLink);
  card.appendChild(footer);

  return card;
}

export function MarketplaceMap({
  tenants,
  locale,
  apiBase,
  userCoords,
  activeTenantId,
  hoveredTenantId,
  selectedSignal,
  fitInitialNonce,
  viewMode,
  onSelectStore
}: MarketplaceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const mapLoadedRef = useRef(false);
  const markersRef = useRef<Record<string, MapLibreMarkerInstance>>({});
  const clusterMarkersRef = useRef<Record<string, MapLibreMarkerInstance>>({});
  const userMarkerRef = useRef<MapLibreMarkerInstance | null>(null);

  const latestTenantsRef = useRef(tenants);
  const latestLocaleRef = useRef(locale);
  const latestApiBaseRef = useRef(apiBase);
  const latestUserCoordsRef = useRef(userCoords);
  const latestActiveIdRef = useRef(activeTenantId);
  const onSelectStoreRef = useRef(onSelectStore);

  latestTenantsRef.current = tenants;
  latestLocaleRef.current = locale;
  latestApiBaseRef.current = apiBase;
  latestUserCoordsRef.current = userCoords;
  latestActiveIdRef.current = activeTenantId;
  onSelectStoreRef.current = onSelectStore;

  const dict = MARKETPLACE_DICTIONARY[locale];

  const fitMapToBounds = useCallback(() => {
    const map = mapRef.current;
    const maplibregl = (window as MapWindow).maplibregl;
    if (!map || !maplibregl) return;

    const bounds = new maplibregl.LngLatBounds();
    let hasPoints = false;
    const coords = latestUserCoordsRef.current;
    if (coords) {
      bounds.extend([coords.lon, coords.lat]);
      hasPoints = true;
    }
    for (const tenant of latestTenantsRef.current) {
      if (tenant.latitude != null && tenant.longitude != null) {
        bounds.extend([Number(tenant.longitude), Number(tenant.latitude)]);
        hasPoints = true;
      }
    }
    if (hasPoints) {
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 14,
        pitch: 0,
        bearing: 0,
        duration: 1000
      });
    }
  }, []);

  const syncHtmlMarkers = useCallback((resetPopups = false) => {
    const map = mapRef.current;
    const maplibregl = (window as MapWindow).maplibregl;
    if (!map || !maplibregl || !map.getSource('tenants-source')) return;

    if (resetPopups) {
      for (const marker of Object.values(markersRef.current)) {
        marker.remove();
      }
      markersRef.current = {};
    }

    const tenantMap = new Map<string, MarketplaceTenantDto>();
    for (const tenant of latestTenantsRef.current) {
      tenantMap.set(tenant.tenantId, tenant);
    }

    const clusterFeatures = map.queryRenderedFeatures({ layers: ['clusters-target'] });
    const nextClusters: Record<string, MapLibreMarkerInstance> = {};

    for (const feat of clusterFeatures) {
      const clusterId = String(feat.properties.cluster_id ?? '');
      const pointCount = Number(feat.properties.point_count ?? 0);
      if (!clusterId || nextClusters[clusterId]) continue;

      let clusterMarker = clusterMarkersRef.current[clusterId];
      if (!clusterMarker) {
        const coords = feat.geometry.coordinates;
        const clusterEl = document.createElement('div');
        clusterEl.className = 'custom-cluster-badge';

        const halo = document.createElement('div');
        halo.className = 'cluster-halo';
        const core = document.createElement('div');
        core.className = 'cluster-core';
        const countSpan = document.createElement('span');
        countSpan.className = 'cluster-count';
        countSpan.textContent = String(pointCount);
        core.appendChild(countSpan);
        clusterEl.appendChild(halo);
        clusterEl.appendChild(core);

        clusterEl.addEventListener('click', (event) => {
          event.stopPropagation();
          const source = map.getSource('tenants-source');
          source?.getClusterExpansionZoom(Number(clusterId), (err, zoom) => {
            if (err) return;
            map.flyTo({
              center: coords,
              zoom: Math.min(zoom + 0.6, 15),
              pitch: 35,
              duration: 800
            });
          });
        });

        clusterMarker = new maplibregl.Marker({ element: clusterEl, anchor: 'center' })
          .setLngLat(coords)
          .addTo(map);
      }

      nextClusters[clusterId] = clusterMarker;
    }

    for (const [id, marker] of Object.entries(clusterMarkersRef.current)) {
      if (!nextClusters[id]) marker.remove();
    }
    clusterMarkersRef.current = nextClusters;

    const unclusteredFeatures = map.queryRenderedFeatures({ layers: ['unclustered-target'] });
    const nextMarkers: Record<string, MapLibreMarkerInstance> = {};

    for (const feat of unclusteredFeatures) {
      const storeId = String(feat.properties.tenantId ?? '');
      if (!storeId || nextMarkers[storeId]) continue;
      const tenant = tenantMap.get(storeId);
      if (!tenant) continue;

      let marker = markersRef.current[storeId];
      if (!marker) {
        const coords = feat.geometry.coordinates;
        const statusClass = tenant.isOpen ? 'open' : tenant.storeStatus === 'busy' ? 'busy' : 'closed';
        const brandColor = tenant.brandColor || '#059669';

        const pinWrapper = document.createElement('div');
        pinWrapper.className = `custom-marker-anchor${latestActiveIdRef.current === tenant.tenantId ? ' active' : ''}`;
        pinWrapper.id = `marker-pin-${tenant.tenantId}`;

        const pin = document.createElement('div');
        pin.className = 'custom-map-pin';
        const shadow = document.createElement('div');
        shadow.className = 'pin-shadow';

        const badge = document.createElement('div');
        badge.className = `pin-badge ${statusClass}`;
        badge.style.backgroundColor = brandColor;

        const iconWrap = document.createElement('div');
        iconWrap.className = 'pin-icon-wrap';
        const safeLogoUrl = resolveSafeLogoUrl(tenant.logoUrl);
        if (safeLogoUrl) {
          const img = document.createElement('img');
          img.src = safeLogoUrl;
          img.alt = tenant.brandName;
          iconWrap.appendChild(img);
        } else {
          iconWrap.appendChild(createSvgIcon(UTENSILS_SVG_PATHS));
        }

        const dot = document.createElement('span');
        dot.className = 'pin-status-dot';
        badge.appendChild(iconWrap);
        badge.appendChild(dot);

        const needle = document.createElement('div');
        needle.className = 'pin-needle';
        needle.style.borderTopColor = brandColor;

        pin.appendChild(shadow);
        pin.appendChild(badge);
        pin.appendChild(needle);
        pinWrapper.appendChild(pin);

        const popup = new maplibregl.Popup({ offset: [0, -48], closeButton: true }).setDOMContent(
          buildPopupElement(tenant, latestLocaleRef.current, latestApiBaseRef.current)
        );

        pinWrapper.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectStoreRef.current(tenant.tenantId);
        });

        marker = new maplibregl.Marker({ element: pinWrapper, anchor: 'bottom' })
          .setLngLat(coords)
          .setPopup(popup)
          .addTo(map);
      }

      nextMarkers[storeId] = marker;
    }

    for (const [id, marker] of Object.entries(markersRef.current)) {
      if (!nextMarkers[id]) marker.remove();
    }
    markersRef.current = nextMarkers;
  }, []);

  useEffect(() => {
    const maplibregl = (window as MapWindow).maplibregl;
    const container = containerRef.current;
    if (!maplibregl || !container) return;

    const map = new maplibregl.Map({
      container,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [121.44288, 24.97022],
      zoom: 11.5,
      pitch: 0,
      bearing: 0,
      antialias: true
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

    const handleSync = () => syncHtmlMarkers(false);
    map.on('load', () => {
      mapLoadedRef.current = true;
      if (!map.getSource('tenants-source')) {
        map.addSource('tenants-source', {
          type: 'geojson',
          data: buildGeoJson(latestTenantsRef.current),
          cluster: true,
          clusterMaxZoom: 13,
          clusterRadius: 65
        });
      }
      if (!map.getLayer('clusters-target')) {
        map.addLayer({
          id: 'clusters-target',
          type: 'circle',
          source: 'tenants-source',
          filter: ['has', 'point_count'],
          paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 24 }
        });
      }
      if (!map.getLayer('unclustered-target')) {
        map.addLayer({
          id: 'unclustered-target',
          type: 'circle',
          source: 'tenants-source',
          filter: ['!', ['has', 'point_count']],
          paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 1 }
        });
      }
      syncHtmlMarkers(true);
      fitMapToBounds();
    });
    map.on('move', handleSync);
    map.on('moveend', handleSync);

    return () => {
      mapLoadedRef.current = false;
      for (const marker of Object.values(markersRef.current)) marker.remove();
      for (const marker of Object.values(clusterMarkersRef.current)) marker.remove();
      userMarkerRef.current?.remove();
      markersRef.current = {};
      clusterMarkersRef.current = {};
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [fitMapToBounds, syncHtmlMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const source = map.getSource('tenants-source');
    if (source) {
      source.setData(buildGeoJson(tenants));
    }
    syncHtmlMarkers(true);
  }, [tenants, locale, apiBase, syncHtmlMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = (window as MapWindow).maplibregl;
    if (!map || !maplibregl) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (!userCoords) return;

    const userEl = document.createElement('div');
    userEl.className = 'user-location-marker';
    userMarkerRef.current = new maplibregl.Marker({ element: userEl, anchor: 'center' })
      .setLngLat([userCoords.lon, userCoords.lat])
      .addTo(map);

    map.flyTo({
      center: [userCoords.lon, userCoords.lat],
      zoom: 13,
      pitch: 35,
      duration: 1200
    });
  }, [userCoords]);

  useEffect(() => {
    if (fitInitialNonce === 0) return;
    fitMapToBounds();
  }, [fitInitialNonce, fitMapToBounds]);

  useEffect(() => {
    const highlightedId = hoveredTenantId || activeTenantId;
    document.querySelectorAll('.custom-marker-anchor').forEach((el) => el.classList.remove('active'));
    if (highlightedId) {
      document.getElementById(`marker-pin-${highlightedId}`)?.classList.add('active');
    }
  }, [hoveredTenantId, activeTenantId]);

  useEffect(() => {
    if (!selectedSignal) return;
    const map = mapRef.current;
    const tenant = tenants.find((item) => item.tenantId === selectedSignal.tenantId);
    if (!map || !tenant || tenant.latitude == null || tenant.longitude == null) return;

    map.flyTo({
      center: [Number(tenant.longitude), Number(tenant.latitude)],
      zoom: Math.max(map.getZoom(), 14.5),
      pitch: 35,
      duration: 900
    });

    const timer = window.setTimeout(() => {
      syncHtmlMarkers(false);
      const marker = markersRef.current[tenant.tenantId];
      const popup = marker?.getPopup();
      if (marker && popup && !popup.isOpen()) {
        marker.togglePopup();
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [selectedSignal, tenants, syncHtmlMarkers]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current) return;
    const timer = window.setTimeout(() => {
      mapRef.current?.resize();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [viewMode]);

  return (
    <section className="map-panel" aria-label="Stores Map">
      <div id="marketplaceMap" ref={containerRef} />
      <button type="button" id="mapRecenterBtn" className="map-recenter-btn" onClick={fitMapToBounds}>
        <CompassIcon />
        <span id="recenterMapText">{dict.recenterMap}</span>
      </button>
    </section>
  );
}
