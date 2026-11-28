import { useEffect, useState } from 'react';
import { DeliveryIcon } from '@shared/ui/PosIcons';

declare const WORKER_BASE: string;
declare function getTenantIdFromUrl(): string;
declare function t(key: string): string;

interface DeliveryDetails {
  recipient: string;
  phone: string;
  address: string;
  taxId?: string;
}

type DeliveryState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; details: DeliveryDetails };

export function OrderDeliveryDetails({ orderKey }: { orderKey: string }) {
  const [state, setState] = useState<DeliveryState>({ status: 'loading' });
  const tenant = getTenantIdFromUrl();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const query = new URLSearchParams({ tenant_id: tenant, key: orderKey });
        const fetcher = (window as unknown as { posApiFetch?: typeof fetch }).posApiFetch ?? fetch;
        const response = await fetcher(WORKER_BASE + '/api/orders/delivery-details?' + query, {
          signal: controller.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('Delivery details unavailable');
        const { details } = await response.json();
        if (!controller.signal.aborted) setState({ status: 'ready', details });
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
  </section>;
}
