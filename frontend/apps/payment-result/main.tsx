import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/ui/tokens.css';
import './payment-result.css';
import type { PaymentLocale } from '@shared/contracts/payment';
import { PaymentResultApp } from './PaymentResultApp';
import { createPaymentSessionClient, resolvePaymentWorkerBase } from './payment-result-client';

interface PaymentHostWindow extends Window {
  WORKER_BASE?: string;
  getTenantIdFromUrl?: () => string;
  PaymentSession?: ReturnType<typeof createPaymentSessionClient>;
}

function bootstrapPaymentResult(): void {
  const params = new URLSearchParams(window.location.search);
  const tenant = params.get('tenant_id') || params.get('tenant') || '';
  const paymentId = params.get('payment_id') || '';
  const hasExplicitLangParam = params.has('lang');
  const initialLocale: PaymentLocale = params.get('lang') === 'vi' ? 'vi' : 'zh-TW';

  const workerBase = resolvePaymentWorkerBase(window.location);
  const hostWindow = window as PaymentHostWindow;
  hostWindow.WORKER_BASE = workerBase;
  hostWindow.getTenantIdFromUrl = () => tenant;

  const client = createPaymentSessionClient({
    getTenant: () => tenant,
    getWorkerBase: () => hostWindow.WORKER_BASE || workerBase
  });
  hostWindow.PaymentSession = client;

  const mountEl = document.getElementById('sec-checkout');
  if (!mountEl) return;

  createRoot(mountEl).render(
    <StrictMode>
      <PaymentResultApp
        tenant={tenant}
        paymentId={paymentId}
        initialLocale={initialLocale}
        hasExplicitLangParam={hasExplicitLangParam}
        client={client}
      />
    </StrictMode>
  );
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapPaymentResult, { once: true });
  } else {
    bootstrapPaymentResult();
  }
}
