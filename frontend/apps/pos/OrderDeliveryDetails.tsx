import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Button } from '@shared/ui/button';
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

export function OrderDeliveryDetails({ orderKey }: { orderKey: string }) {
  const [details, setDetails] = useState<DeliveryDetails>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsPin, setNeedsPin] = useState(false);
  const request = useRef<AbortController | null>(null);
  const tenant = getTenantIdFromUrl();
  const sessionKey = 'staff_session_token_' + tenant;

  async function load(signal: AbortSignal, password?: string) {
    setBusy(true);
    setError('');
    try {
      let token = sessionStorage.getItem(sessionKey);
      if (password) {
        const session = await fetch(WORKER_BASE + '/api/staff/session?tenant_id=' + encodeURIComponent(tenant), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal
        });
        if (!session.ok) {
          setError(session.status === 401 ? 'deliveryInvalidPin' : 'deliveryDetailsError');
          return;
        }
        token = (await session.json()).token;
        if (token) sessionStorage.setItem(sessionKey, token);
      }
      if (!token) {
        setNeedsPin(true);
        return;
      }
      const query = new URLSearchParams({ tenant_id: tenant, key: orderKey });
      const response = await fetch(WORKER_BASE + '/api/staff/delivery-details?' + query, {
        headers: { Authorization: 'Bearer ' + token }, signal, cache: 'no-store'
      });
      if (response.status === 401 || response.status === 409) {
        sessionStorage.removeItem(sessionKey);
        setNeedsPin(true);
        if (response.status === 409) setError('deliveryPinChange');
      } else if (!response.ok) {
        setError('deliveryDetailsError');
      } else {
        const data = await response.json();
        setDetails(data.details);
        setNeedsPin(false);
      }
    } catch {
      if (!signal.aborted) setError('deliveryDetailsError');
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    request.current = new AbortController();
    void load(request.current.signal);
    return () => request.current?.abort();
  }, [orderKey, tenant]);

  function unlock(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get('password') || '').trim();
    form.reset();
    if (!password || !request.current) return;
    void load(request.current.signal, password);
  }

  return <section className="order-delivery-card" aria-labelledby="order-delivery-heading">
    <h2 id="order-delivery-heading"><DeliveryIcon size={19} />{t('deliveryDetails')}</h2>
    {details ? <dl>
      <div><dt>{t('deliveryRecipient')}</dt><dd>{details.recipient}</dd></div>
      <div><dt>{t('deliveryPhone')}</dt><dd>{details.phone}</dd></div>
      <div className="order-delivery-address"><dt>{t('deliveryAddress')}</dt><dd>{details.address}</dd></div>
      {details.taxId && <div><dt>{t('deliveryTaxId')}</dt><dd>{details.taxId}</dd></div>}
    </dl> : <>
      {busy && <p role="status">{t('deliveryDetailsLoading')}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {needsPin && <form onSubmit={unlock}>
        <label htmlFor="delivery-pos-pin">{t('deliveryPinRequired')}</label>
        <div>
          <input id="delivery-pos-pin" name="password" type="password" inputMode="numeric" autoComplete="current-password" required disabled={busy} />
          <Button type="submit" disabled={busy}>{t('deliveryUnlock')}</Button>
        </div>
      </form>}
    </>}
  </section>;
}
