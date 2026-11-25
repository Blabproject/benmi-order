import { useEffect, useState } from 'react';
import { Button } from '@shared/ui/button';
import { DeliveryIcon } from '@shared/ui/PosIcons';

declare const WORKER_BASE: string;
declare function getTenantIdFromUrl(): string;
declare function posDeliverySessionKey(tenantId: string): string;
declare function savePosDeliverySession(tenantId: string, token: null): void;
declare function showStoreActivationModal(force: boolean, forDeliveryDetails: boolean): void;
declare function t(key: string): string;

interface DeliveryDetails {
  recipient: string;
  phone: string;
  address: string;
  taxId?: string;
}

type DeliveryState =
  | { status: 'loading' | 'pairing' | 'error' }
  | { status: 'ready'; details: DeliveryDetails };

export function OrderDeliveryDetails({ orderKey }: { orderKey: string }) {
  const [state, setState] = useState<DeliveryState>({ status: 'loading' });
  const tenant = getTenantIdFromUrl();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const deviceToken = localStorage.getItem(posDeliverySessionKey(tenant));
        const token = deviceToken || sessionStorage.getItem('staff_session_token_' + tenant);
        if (!token) {
          setState({ status: 'pairing' });
          return;
        }
        const query = new URLSearchParams({ tenant_id: tenant, key: orderKey });
        const response = await fetch(WORKER_BASE + '/api/staff/delivery-details?' + query, {
          headers: { Authorization: 'Bearer ' + token },
          signal: controller.signal,
          cache: 'no-store'
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          if (deviceToken) savePosDeliverySession(tenant, null);
          setState({ status: 'pairing' });
        } else if (!response.ok) {
          setState({ status: 'error' });
        } else {
          const { details } = await response.json();
          if (!controller.signal.aborted) setState({ status: 'ready', details });
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, [orderKey, tenant]);

  return <section className="order-delivery-card" aria-labelledby="order-delivery-heading">
    <h2 id="order-delivery-heading"><DeliveryIcon size={19} />{t('deliveryDetails')}</h2>
    {state.status === 'ready' && <dl>
      <div><dt>{t('deliveryRecipient')}</dt><dd>{state.details.recipient}</dd></div>
      <div><dt>{t('deliveryPhone')}</dt><dd>{state.details.phone}</dd></div>
      <div className="order-delivery-address"><dt>{t('deliveryAddress')}</dt><dd>{state.details.address}</dd></div>
      {state.details.taxId && <div><dt>{t('deliveryTaxId')}</dt><dd>{state.details.taxId}</dd></div>}
    </dl>}
    {state.status === 'loading' && <p role="status">{t('deliveryDetailsLoading')}</p>}
    {state.status === 'error' && <p role="alert">{t('deliveryDetailsError')}</p>}
    {state.status === 'pairing' && <>
      <p>{t('deliveryPairingRequired')}</p>
      <Button type="button" onClick={() => showStoreActivationModal(true, true)}>{t('deliveryPairDevice')}</Button>
    </>}
  </section>;
}
