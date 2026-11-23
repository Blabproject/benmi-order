import { useEffect, useRef, useState } from 'react';
import {
  buildGoogleMapsDirectionsUrl,
  buildMarketplaceOrderUrl,
  buildWeeklyScheduleRows,
  resolveSafeLogoUrl,
  type MarketplaceLocale,
  type MarketplaceTenantDto
} from '@shared/contracts/marketplace';
import {
  ClockIcon,
  CloseIcon,
  ExternalLinkIcon,
  MapPinIcon,
  ShoppingBagIcon,
  UtensilsIcon
} from './MarketplaceIcons';
import { formatDistanceLabel, MARKETPLACE_DICTIONARY } from './marketplace-i18n';

interface StorePreviewDialogProps {
  tenant: MarketplaceTenantDto | null;
  locale: MarketplaceLocale;
  apiBase: string;
  onClose: () => void;
}

function isPointerOutsideDialog(event: PointerEvent, dialog: HTMLDialogElement): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

export function StorePreviewDialog({ tenant, locale, apiBase, onClose }: StorePreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const dict = MARKETPLACE_DICTIONARY[locale];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (tenant) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }, [tenant]);

  // Safari fallback for <dialog closedby="any"> light-dismiss via backdrop pointer press/release.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const handlePointerDown = (event: PointerEvent) => {
      pressedOutside = isPointerOutsideDialog(event, dialog);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (pressedOutside && isPointerOutsideDialog(event, dialog)) {
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          onClose();
        }
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onClose]);

  const safeLogoUrl = tenant ? resolveSafeLogoUrl(tenant.logoUrl) : null;
  const showLogo = Boolean(safeLogoUrl && failedLogoUrl !== safeLogoUrl);
  const brandColor = tenant?.brandColor || '#059669';
  const statusClass = tenant
    ? tenant.isOpen
      ? 'open'
      : tenant.storeStatus === 'busy'
        ? 'busy'
        : 'closed'
    : 'closed';
  const statusText = tenant
    ? tenant.isOpen
      ? dict.openNow
      : tenant.storeStatus === 'busy'
        ? dict.busy
        : dict.closed
    : '';
  const distLabel = tenant ? formatDistanceLabel(tenant.distanceKm, locale) : '';
  const directionsUrl = tenant ? buildGoogleMapsDirectionsUrl(tenant) : '#';
  const orderUrl = tenant ? buildMarketplaceOrderUrl(tenant.tenantId, tenant.orderUrl, apiBase) : '#';
  const weeklyRows = tenant ? buildWeeklyScheduleRows(tenant.parsedHours) : null;
  const fallbackHoursText =
    tenant?.operatingHours && !tenant.operatingHours.trim().startsWith('{')
      ? tenant.operatingHours
      : '11:00 - 21:00';

  return (
    <dialog
      ref={dialogRef}
      id="storePreviewModal"
      className="store-preview-dialog"
      aria-labelledby="storeModalTitle"
      onClose={onClose}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      {tenant && (
        <div className="store-modal-card" id="storeModalContent">
          <div
            className="modal-banner"
            style={{ background: `linear-gradient(135deg, ${brandColor} 0%, #10b981 100%)` }}
          >
            <button
              type="button"
              className="modal-close-btn"
              id="modalCloseBtn"
              aria-label={dict.modalCloseAria}
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>

          <div className="modal-body">
            <div className="modal-header-row">
              <div className="modal-avatar">
                {showLogo && safeLogoUrl ? (
                  <img
                    src={safeLogoUrl}
                    alt={tenant.brandName}
                    onError={() => setFailedLogoUrl(safeLogoUrl)}
                  />
                ) : (
                  <span>{tenant.brandName.charAt(0)}</span>
                )}
              </div>
              <div className="modal-title-group">
                <h2 id="storeModalTitle">{tenant.brandName}</h2>
                {tenant.brandSubtitle && <p>{tenant.brandSubtitle}</p>}
                <div className="modal-status-meta">
                  <span className={`status-badge ${statusClass}`}>
                    <span className="status-dot" />
                    <span>{statusText}</span>
                  </span>
                  {distLabel && (
                    <span className="distance-badge">
                      <MapPinIcon />
                      <span>{distLabel}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-features-row">
              {tenant.allowDineIn && (
                <span className="feature-pill">
                  <UtensilsIcon />
                  <span>{dict.modalDiningDineIn}</span>
                </span>
              )}
              {tenant.allowScheduledPickup && (
                <span className="feature-pill">
                  <ClockIcon />
                  <span>{dict.modalDiningScheduled}</span>
                </span>
              )}
              <span className="feature-pill">
                <ShoppingBagIcon />
                <span>{dict.modalDiningTakeaway}</span>
              </span>
            </div>

            <div className="modal-section-card">
              <div className="modal-info-row">
                <MapPinIcon />
                <div>
                  <strong>{dict.modalAddress}:</strong>
                  <br />
                  <span>{tenant.storeAddress || dict.defaultLocation}</span>
                  <br />
                  <a
                    className="maps-link"
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLinkIcon />
                    <span>{dict.modalDirections}</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="modal-section-card">
              <div className="modal-info-row">
                <ClockIcon />
                <div className="modal-hours-content">
                  <strong>{dict.modalHours}:</strong>
                  {weeklyRows ? (
                    <div className="schedule-list">
                      {weeklyRows.map((row) => {
                        const dayName = dict.days[row.dayIndex] ?? `Day ${row.dayKey}`;
                        const hoursText =
                          row.shifts.length > 0
                            ? row.shifts.map((shift) => `${shift.start} - ${shift.end}`).join(', ')
                            : dict.dayRest;
                        return (
                          <div
                            key={row.dayKey}
                            className={`schedule-row${row.isToday ? ' today' : ''}`}
                          >
                            <span className="schedule-day">
                              {dayName}
                              {row.isToday ? ` (${dict.todayLabel})` : ''}
                            </span>
                            <span className="schedule-hours">{hoursText}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      <span>{fallbackHoursText}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {tenant.deliveryPolicy && (
              <div className="modal-section-card">
                <div className="modal-info-row">
                  <ShoppingBagIcon />
                  <div>
                    <strong>{dict.modalDelivery}:</strong>
                    <br />
                    <span className="modal-delivery-text">{tenant.deliveryPolicy}</span>
                  </div>
                </div>
              </div>
            )}

            <a className="modal-cta-btn" href={orderUrl} autoFocus>
              <ShoppingBagIcon />
              <span>{dict.btnOrder}</span>
            </a>
          </div>
        </div>
      )}
    </dialog>
  );
}
