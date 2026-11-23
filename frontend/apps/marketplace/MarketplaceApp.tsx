import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  attachAndSortTenantsByDistance,
  buildMarketplaceOrderUrl,
  filterMarketplaceTenants,
  resolveCardOperatingHours,
  resolveSafeLogoUrl,
  type Coordinates,
  type MarketplaceCuisineFilter,
  type MarketplaceLocale,
  type MarketplaceRegionFilter,
  type MarketplaceTenantDto,
  type MarketplaceTenantsResponseDto,
  type MarketplaceViewMode
} from '@shared/contracts/marketplace';
import { fetchJson, resolveWorkerBase } from '@shared/infra/http';
import {
  ClockIcon,
  CloseIcon,
  CompassIcon,
  GlobeIcon,
  ListIcon,
  MapIcon,
  MapPinIcon,
  SearchIcon,
  ShoppingBagIcon,
  StoreIcon
} from './MarketplaceIcons';
import { MarketplaceMap } from './MarketplaceMap';
import { StorePreviewDialog } from './StorePreviewDialog';
import {
  CUISINE_FILTERS,
  formatDistanceLabel,
  formatMarketplaceText,
  MARKETPLACE_DICTIONARY,
  REGION_FILTERS,
  resolveCuisineLabel
} from './marketplace-i18n';

const LANG_STORAGE_KEY = 'benmi_lang';
const SKELETON_COUNT = 6;

type FetchStatus = 'loading' | 'ready' | 'error';
type GpsStatus = 'idle' | 'locating' | 'located' | 'denied';

export interface MarketplaceAppProps {
  initialLocale?: MarketplaceLocale;
  apiBaseOverride?: string;
  loadTenants?: (signal: AbortSignal) => Promise<MarketplaceTenantDto[]>;
}

function readStoredLocale(fallback: MarketplaceLocale): MarketplaceLocale {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'vi' || saved === 'zh-TW' ? saved : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredLocale(locale: MarketplaceLocale): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, locale);
  } catch {
    // Ignore storage restrictions in embedded WebViews.
  }
}

interface StoreCardProps {
  tenant: MarketplaceTenantDto;
  locale: MarketplaceLocale;
  apiBase: string;
  isActive: boolean;
  onHover: (tenantId: string) => void;
  onLeave: () => void;
  onSelect: (tenantId: string) => void;
  onOpenModal: (tenantId: string) => void;
}

function StoreCard({
  tenant,
  locale,
  apiBase,
  isActive,
  onHover,
  onLeave,
  onSelect,
  onOpenModal
}: StoreCardProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const dict = MARKETPLACE_DICTIONARY[locale];
  const isOpen = tenant.isOpen;
  const brandColor = tenant.brandColor || '#059669';
  const statusClass = isOpen ? 'open' : tenant.storeStatus === 'busy' ? 'busy' : 'closed';
  const statusText = isOpen ? dict.openNow : tenant.storeStatus === 'busy' ? dict.busy : dict.closed;
  const distStr = formatDistanceLabel(tenant.distanceKm, locale);
  const cuisineText = resolveCuisineLabel(tenant.cuisineType, locale);
  const safeLogoUrl = resolveSafeLogoUrl(tenant.logoUrl);
  const showLogo = Boolean(safeLogoUrl && failedLogoUrl !== safeLogoUrl);
  const orderUrl = buildMarketplaceOrderUrl(tenant.tenantId, tenant.orderUrl, apiBase);

  const cardHours = resolveCardOperatingHours(tenant.operatingHours, tenant.parsedHours);
  const hoursText =
    cardHours.kind === 'rest'
      ? dict.todayRest
      : formatMarketplaceText(dict.todayHours, { hours: cardHours.value });

  return (
    <div
      className={`store-card${isActive ? ' active-focus' : ''}`}
      id={`store-card-${tenant.tenantId}`}
      data-tenant-id={tenant.tenantId}
      style={{ ['--card-brand-color' as string]: brandColor }}
      onMouseEnter={() => onHover(tenant.tenantId)}
      onMouseLeave={onLeave}
      onClick={() => onSelect(tenant.tenantId)}
    >
      <div
        className="card-accent-bar"
        style={{ background: `linear-gradient(90deg, ${brandColor}, ${brandColor}66)` }}
      />
      <div className="card-header">
        <div className="card-avatar" style={{ borderColor: `${brandColor}33` }}>
          {showLogo && safeLogoUrl ? (
            <img
              src={safeLogoUrl}
              alt={tenant.brandName}
              loading="lazy"
              onError={() => setFailedLogoUrl(safeLogoUrl)}
            />
          ) : (
            <span className="card-avatar-text" style={{ color: brandColor }}>
              {tenant.brandName.charAt(0)}
            </span>
          )}
        </div>
        <div className="card-title-group">
          <div className="card-title-row">
            <h3 className="card-brand-name">{tenant.brandName}</h3>
          </div>
          <div className="card-meta-row">
            <span className="card-cuisine-pill">{cuisineText}</span>
            {distStr && (
              <span className="card-distance-pill">
                <MapPinIcon />
                <span>{distStr}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card-status-row">
        <span className={`status-badge ${statusClass}`}>
          <span className="status-dot" />
          <span>{statusText}</span>
        </span>
        <span className="hours-badge">
          <ClockIcon />
          <span>{hoursText}</span>
        </span>
      </div>

      <div className="card-details">
        <div className="detail-line" title={tenant.storeAddress || ''}>
          <MapPinIcon />
          <span>{tenant.storeAddress ? tenant.storeAddress.split('\n')[0] : dict.defaultLocation}</span>
        </div>
      </div>

      {Array.isArray(tenant.categoriesSummary) && tenant.categoriesSummary.length > 0 && (
        <div className="card-categories">
          {tenant.categoriesSummary.slice(0, 3).map((category) => (
            <span key={category} className="category-chip">
              {category}
            </span>
          ))}
        </div>
      )}

      <div className="card-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="btn-card-preview"
          onClick={() => onOpenModal(tenant.tenantId)}
        >
          <StoreIcon />
          <span>{dict.btnDetails}</span>
        </button>
        <a className="btn-card-order" href={orderUrl}>
          <ShoppingBagIcon />
          <span>{dict.btnOrder}</span>
          <span className="btn-arrow">→</span>
        </a>
      </div>
    </div>
  );
}

export function MarketplaceApp({
  initialLocale = 'zh-TW',
  apiBaseOverride,
  loadTenants
}: MarketplaceAppProps) {
  const [locale, setLocale] = useState<MarketplaceLocale>(() =>
    typeof window !== 'undefined' ? readStoredLocale(initialLocale) : initialLocale
  );
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('loading');
  const [rawTenants, setRawTenants] = useState<MarketplaceTenantDto[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<MarketplaceRegionFilter>('all');
  const [cuisineFilter, setCuisineFilter] = useState<MarketplaceCuisineFilter>('all');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [viewMode, setViewMode] = useState<MarketplaceViewMode>('list');
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [hoveredTenantId, setHoveredTenantId] = useState<string | null>(null);
  const [modalTenantId, setModalTenantId] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<{ tenantId: string; nonce: number } | null>(null);
  const [fitInitialNonce, setFitInitialNonce] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);

  const apiBase = useMemo(
    () => apiBaseOverride || (typeof window !== 'undefined' ? resolveWorkerBase(window.location) : ''),
    [apiBaseOverride]
  );

  const dict = MARKETPLACE_DICTIONARY[locale];
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.title = dict.pageTitle;
  }, [locale, dict.pageTitle]);

  useEffect(() => {
    if (!searchInput) {
      setDebouncedSearch('');
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setFetchStatus('loading');

    const runFetch = async () => {
      try {
        let items: MarketplaceTenantDto[];
        if (loadTenants) {
          items = await loadTenants(controller.signal);
        } else {
          const response = await fetchJson<MarketplaceTenantsResponseDto>(
            `${apiBase}/api/marketplace/tenants`,
            { signal: controller.signal }
          );
          if (!response.success || !Array.isArray(response.data)) {
            throw new Error(response.error || 'Invalid marketplace payload');
          }
          items = response.data;
        }
        if (controller.signal.aborted) return;
        setRawTenants(items);
        setFetchStatus('ready');
        setFitInitialNonce((n) => n + 1);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('[Marketplace] Fetch error:', err);
        setFetchStatus('error');
      }
    };

    void runFetch();
    return () => {
      controller.abort();
    };
  }, [apiBase, loadTenants, reloadNonce]);

  const sortedTenants = useMemo(
    () => attachAndSortTenantsByDistance(rawTenants, userCoords),
    [rawTenants, userCoords]
  );

  const filteredTenants = useMemo(
    () =>
      filterMarketplaceTenants(sortedTenants, {
        search: debouncedSearch,
        region: regionFilter,
        cuisine: cuisineFilter,
        onlyOpen
      }),
    [sortedTenants, debouncedSearch, regionFilter, cuisineFilter, onlyOpen]
  );

  const modalTenant = useMemo(
    () => sortedTenants.find((tenant) => tenant.tenantId === modalTenantId) ?? null,
    [sortedTenants, modalTenantId]
  );

  const handleToggleLanguage = useCallback(() => {
    setLocale((prev) => {
      const next: MarketplaceLocale = prev === 'zh-TW' ? 'vi' : 'zh-TW';
      writeStoredLocale(next);
      return next;
    });
  }, []);

  const handleRequestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsStatus('located');
      },
      (err) => {
        console.warn('[Marketplace] Geolocation error:', err);
        setGpsStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const handleSelectStore = useCallback((tenantId: string) => {
    setActiveTenantId(tenantId);
    setSelectedSignal((prev) => ({ tenantId, nonce: (prev?.nonce ?? 0) + 1 }));
    const card = document.getElementById(`store-card-${tenantId}`);
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setRegionFilter('all');
    setCuisineFilter('all');
    setOnlyOpen(false);
  }, []);

  const gpsText =
    gpsStatus === 'locating'
      ? dict.locating
      : gpsStatus === 'located'
        ? dict.located
        : gpsStatus === 'denied'
          ? dict.locationDenied
          : dict.locateMe;

  return (
    <>
      <header className="marketplace-header">
        <div className="header-container">
          <a href="/" className="brand-section">
            <div className="brand-logo-icon">
              <StoreIcon style={{ width: 22, height: 22 }} />
            </div>
            <div className="brand-info">
              <h1 id="headerBrandTitle">{dict.brandTitle}</h1>
              <p id="headerBrandSubtitle">{dict.brandSubtitle}</p>
            </div>
          </a>

          <div className="search-wrapper">
            <span className="search-icon-left">
              <SearchIcon />
            </span>
            <input
              type="text"
              id="marketplaceSearchInput"
              className="search-input-box"
              placeholder={dict.searchPlaceholder}
              autoComplete="off"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                id="searchClearBtn"
                className="search-clear-btn search-clear-btn--visible"
                aria-label={dict.clearSearchAria}
                onClick={() => {
                  setSearchInput('');
                  setDebouncedSearch('');
                }}
              >
                <CloseIcon style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>

          <div className="header-actions">
            <button
              type="button"
              id="gpsLocateBtn"
              className={`gps-locate-btn${gpsStatus === 'locating' ? ' loading' : ''}${gpsStatus === 'located' ? ' active' : ''}`}
              title={dict.locateTitle}
              onClick={handleRequestLocation}
            >
              <CompassIcon />
              <span className="gps-text">{gpsText}</span>
            </button>

            <button
              type="button"
              id="langSwitchBtn"
              className="lang-switch-btn"
              title={dict.langSwitchTitle}
              onClick={handleToggleLanguage}
            >
              <GlobeIcon />
              <span id="langSwitchText">{dict.langLabel}</span>
            </button>
          </div>
        </div>
      </header>

      <nav className="marketplace-filters" aria-label="Marketplace Filters">
        <div className="filter-container">
          <div className="filter-pills-row">
            {REGION_FILTERS.map((region) => (
              <button
                key={region.value}
                type="button"
                className={`filter-chip${regionFilter === region.value ? ' active' : ''}`}
                data-filter-region={region.value}
                onClick={() => setRegionFilter(region.value)}
              >
                {dict[region.labelKey] as string}
              </button>
            ))}

            <div className="filter-divider" />

            {CUISINE_FILTERS.map((cuisine) => (
              <button
                key={cuisine.value}
                type="button"
                className={`filter-chip${cuisineFilter === cuisine.value ? ' active' : ''}`}
                data-filter-cuisine={cuisine.value}
                onClick={() => setCuisineFilter(cuisine.value)}
              >
                {dict[cuisine.labelKey] as string}
              </button>
            ))}
          </div>

          <div className="filter-right-actions">
            <label className="toggle-switch-label" htmlFor="openOnlySwitch">
              <input
                type="checkbox"
                id="openOnlySwitch"
                className="switch-input"
                checked={onlyOpen}
                onChange={(event) => setOnlyOpen(event.target.checked)}
              />
              <span className="switch-slider" />
              <span id="openOnlyLabel">{dict.onlyOpen}</span>
            </label>

            <div className="view-mode-toggle">
              <button
                type="button"
                className={`view-mode-btn${viewMode === 'list' ? ' active' : ''}`}
                data-view-mode="list"
                onClick={() => setViewMode('list')}
              >
                <ListIcon style={{ width: 14, height: 14 }} />
                <span>{dict.viewList}</span>
              </button>
              <button
                type="button"
                className={`view-mode-btn${viewMode === 'map' ? ' active' : ''}`}
                data-view-mode="map"
                onClick={() => setViewMode('map')}
              >
                <MapIcon style={{ width: 14, height: 14 }} />
                <span>{dict.viewMap}</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="marketplace-main" data-view={viewMode}>
        <section className="stores-panel" aria-label="Stores List">
          <div className="stores-summary-bar">
            <span className="stores-count-badge" id="storesCountBadge" aria-live="polite">
              {fetchStatus === 'loading' ? (
                dict.loadingStores
              ) : fetchStatus === 'error' ? (
                dict.loadErrorTitle
              ) : (
                <>
                  {dict.storesFoundPrefix}
                  <b>{filteredTenants.length}</b>
                  {dict.storesFoundSuffix}
                </>
              )}
            </span>
          </div>

          <div className="stores-grid" id="storesGrid" aria-busy={fetchStatus === 'loading'}>
            {fetchStatus === 'loading' &&
              Array.from({ length: SKELETON_COUNT }, (_, idx) => (
                <div key={idx} className="store-card store-card-skeleton" aria-hidden="true">
                  <div className="card-accent-bar" />
                  <div className="skeleton-body">
                    <div className="skeleton-row">
                      <div className="skeleton-avatar" />
                      <div className="skeleton-lines">
                        <div className="skeleton-line skeleton-line-lg" />
                        <div className="skeleton-line skeleton-line-sm" />
                      </div>
                    </div>
                    <div className="skeleton-line skeleton-line-md" />
                    <div className="skeleton-line skeleton-line-full" />
                  </div>
                </div>
              ))}

            {fetchStatus === 'error' && (
              <div className="empty-state empty-state-full">
                <div className="empty-state-icon">
                  <StoreIcon />
                </div>
                <h3>{dict.loadErrorTitle}</h3>
                <p>{dict.loadErrorDesc}</p>
                <button
                  type="button"
                  className="btn-card-preview empty-state-action"
                  onClick={() => setReloadNonce((n) => n + 1)}
                >
                  {dict.retryLoad}
                </button>
              </div>
            )}

            {fetchStatus === 'ready' && filteredTenants.length === 0 && (
              <div className="empty-state empty-state-full">
                <div className="empty-state-icon">
                  <SearchIcon />
                </div>
                <h3>{dict.noStoresFound}</h3>
                <p>{dict.noStoresDesc}</p>
                <button
                  type="button"
                  className="btn-card-preview empty-state-action"
                  onClick={handleResetFilters}
                >
                  {dict.clearFilters}
                </button>
              </div>
            )}

            {fetchStatus === 'ready' &&
              filteredTenants.map((tenant) => (
                <StoreCard
                  key={tenant.tenantId}
                  tenant={tenant}
                  locale={locale}
                  apiBase={apiBase}
                  isActive={activeTenantId === tenant.tenantId}
                  onHover={setHoveredTenantId}
                  onLeave={() => setHoveredTenantId(null)}
                  onSelect={handleSelectStore}
                  onOpenModal={setModalTenantId}
                />
              ))}
          </div>
        </section>

        <MarketplaceMap
          tenants={filteredTenants}
          locale={locale}
          apiBase={apiBase}
          userCoords={userCoords}
          activeTenantId={activeTenantId}
          hoveredTenantId={hoveredTenantId}
          selectedSignal={selectedSignal}
          fitInitialNonce={fitInitialNonce}
          viewMode={viewMode}
          onSelectStore={handleSelectStore}
        />
      </main>

      <StorePreviewDialog
        tenant={modalTenant}
        locale={locale}
        apiBase={apiBase}
        onClose={() => setModalTenantId(null)}
      />
    </>
  );
}
