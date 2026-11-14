import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatOrderCode } from '@shared/contracts/order-formatters';
import {
  PAYMENT_WORKSPACE_STATUSES,
  type PaymentWorkspaceItemDto,
  type PaymentWorkspaceView
} from '@shared/contracts/payment-workspace';
import { translatePos, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import {
  formatPaymentMoney,
  formatPaymentTimestamp,
  resolvePaymentStatusLabel,
  type PaymentPromptDialogState,
  type PaymentWorkspaceSnapshot
} from './payment-workspace-store';

export interface PosPaymentWorkspaceProps {
  snapshot: PaymentWorkspaceSnapshot;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onLogin: () => void;
  onStartPinChange: () => void;
  onSelectView: (view: PaymentWorkspaceView) => void;
  onSelectRange: (days: number) => void;
  onApplyFilters: (filters: { from: string; to: string; status: string; q: string }) => boolean;
  onLoadMore: () => void;
  onOpenDetail: (id: string) => void;
  onCloseDetail: () => void;
  onReconcileDetail: (id: string) => void;
  onRefundDetail: (payment: PaymentWorkspaceItemDto) => void;
  onOpenSupport: () => void;
  onSubmitPrompt: (values: Record<string, string>) => Promise<void>;
  onDismissPrompt: () => void;
}

function PaymentPromptDialog({
  prompt,
  locale,
  onSubmit,
  onDismiss,
  onStartPinChange
}: {
  prompt: PaymentPromptDialogState;
  locale: PaymentWorkspaceSnapshot['locale'];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onDismiss: () => void;
  onStartPinChange: () => void;
}) {
  const t = (key: PosTranslationKey, params?: Record<string, string | number>) => translatePos(locale, key, params);
  const [value, setValue] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const changePinRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setValue('');
    setSelectedPreset(null);
  }, [prompt.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    if (prompt.pinChangeRequired) {
      changePinRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [prompt.id, prompt.pinChangeRequired]);

  const reasonPresets = [
    t('paymentReasonOutStock'),
    t('paymentReasonCustomerCancelled'),
    t('paymentReasonStoreBusy'),
    t('paymentReasonOther')
  ];

  const titleId = `payment-dialog-title-${prompt.id}`;

  return (
    <dialog
      ref={dialogRef}
      className="payment-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <h2 id={titleId}>{prompt.title}</h2>
      {prompt.summary && (
        <div className="pos-refund-summary-box">
          <span className="pos-refund-summary-key">{prompt.summary.key}</span>
          <span className="pos-refund-summary-amount">{prompt.summary.amount}</span>
        </div>
      )}
      {prompt.hint && <p>{prompt.hint}</p>}

      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(prompt.kind === 'pin' ? { password: value } : { reason: value });
        }}
      >
        <label hidden={prompt.pinChangeRequired}>
          {prompt.kind === 'pin' ? t('paymentPIN') : t('paymentReason')}
          {prompt.kind === 'refund' ? (
            <>
              <div className="payment-quick-chips">
                {reasonPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    tabIndex={-1}
                    className={`payment-quick-chip${selectedPreset === preset ? ' is-selected' : ''}`}
                    onClick={() => {
                      setValue(preset);
                      setSelectedPreset(preset);
                      inputRef.current?.focus();
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                ref={(el) => {
                  inputRef.current = el;
                }}
                required
                maxLength={1000}
                disabled={prompt.pinChangeRequired}
                placeholder={t('paymentRefundReasonPlaceholder')}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </>
          ) : (
            <input
              ref={(el) => {
                inputRef.current = el;
              }}
              type="password"
              required
              maxLength={1000}
              autoComplete="current-password"
              disabled={prompt.pinChangeRequired}
              value={prompt.pinChangeRequired ? '' : value}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </label>

        {prompt.notice && <p className="payment-dialog-notice">{prompt.notice}</p>}

        <p role="alert" data-payment-i18n={prompt.errorKey || undefined}>
          {prompt.errorKey ? t(prompt.errorKey) : ''}
        </p>

        <div className="payment-actions">
          <button type="button" className="payment-button payment-button-ghost" onClick={onDismiss}>
            {t('paymentCancel')}
          </button>
          <button
            type="submit"
            className="payment-button payment-button-danger"
            hidden={prompt.pinChangeRequired}
            disabled={prompt.busy}
          >
            {t('paymentConfirm')}
          </button>
          <button
            ref={changePinRef}
            type="button"
            className="payment-button"
            hidden={!prompt.pinChangeRequired}
            data-payment-i18n="paymentChangePinContinue"
            onClick={() => {
              dialogRef.current?.close();
              onStartPinChange();
            }}
          >
            {t('paymentChangePinContinue')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** React + TypeScript Payment reconciliation workspace mounted inside #view-payments. */
export function PosPaymentWorkspace({
  snapshot,
  onOpenSettings,
  onRefresh,
  onLogin,
  onStartPinChange,
  onSelectView,
  onSelectRange,
  onApplyFilters,
  onLoadMore,
  onOpenDetail,
  onCloseDetail,
  onReconcileDetail,
  onRefundDetail,
  onOpenSupport,
  onSubmitPrompt,
  onDismissPrompt
}: PosPaymentWorkspaceProps) {
  const { locale } = snapshot;
  const t = (key: PosTranslationKey, params?: Record<string, string | number>) => translatePos(locale, key, params);

  const [fromInput, setFromInput] = useState(snapshot.filters.from);
  const [toInput, setToInput] = useState(snapshot.filters.to);
  const [statusInput, setStatusInput] = useState(snapshot.filters.status);
  const [queryInput, setQueryInput] = useState(snapshot.filters.q);

  useEffect(() => {
    setFromInput(snapshot.filters.from);
    setToInput(snapshot.filters.to);
    setStatusInput(snapshot.filters.status);
    setQueryInput(snapshot.filters.q);
  }, [snapshot.filters.from, snapshot.filters.to, snapshot.filters.status, snapshot.filters.q]);

  const detailDialogRef = useRef<HTMLDialogElement | null>(null);
  const detailTitleRef = useRef<HTMLHeadingElement | null>(null);
  const fromInputRef = useRef<HTMLInputElement | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const wasDetailOpenRef = useRef(false);

  useEffect(() => {
    const dialog = detailDialogRef.current;
    if (!dialog) return;
    if (snapshot.detailOpen) {
      if (!wasDetailOpenRef.current) {
        lastTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
      detailTitleRef.current?.focus();
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (wasDetailOpenRef.current) {
        const prev = lastTriggerRef.current;
        const paymentId = prev?.dataset?.paymentId;
        const target =
          prev && prev.isConnected
            ? prev
            : paymentId
              ? document.querySelector<HTMLElement>(`[data-payment-id="${CSS.escape(paymentId)}"]`)
              : document.getElementById(`payment-tab-${snapshot.view}`);
        target?.focus({ preventScroll: true });
        lastTriggerRef.current = null;
      }
    }
    wasDetailOpenRef.current = snapshot.detailOpen;
  }, [snapshot.detailOpen, snapshot.view]);

  const unlocked = snapshot.configured === true && Boolean(snapshot.auth);

  const statusBannerKey = snapshot.error ?? snapshot.notice ?? (snapshot.countError ? 'paymentWorkspaceStale' : null);
  const statusBannerText = statusBannerKey ? t(statusBannerKey) : '';
  const statusIsSuccess = Boolean(snapshot.notice && !snapshot.error);

  const accessDescriptionKey: PosTranslationKey = snapshot.configError
    ? 'paymentWorkspaceStale'
    : snapshot.configured === null
      ? 'paymentConfigLoading'
      : snapshot.configured === false
        ? 'paymentNotConfigured'
        : snapshot.pinChangeRequired
          ? 'paymentDefaultPIN'
          : 'paymentWorkspaceLocked';

  const summaryPeriod =
    snapshot.view === 'history'
      ? { from: snapshot.filters.from, to: snapshot.filters.to }
      : { from: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), to: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) };

  const emptyMessageKey: PosTranslationKey = snapshot.listBusy
    ? 'paymentLoading'
    : snapshot.error
      ? 'paymentWorkspaceStale'
      : snapshot.loaded
        ? snapshot.view === 'history'
          ? 'paymentHistoryEmpty'
          : 'paymentAttentionEmpty'
        : 'paymentLoading';

  const detail = snapshot.detail;
  const detailStatusText = detail ? resolvePaymentStatusLabel(detail.status, locale) : '';
  const detailMessageText = snapshot.detailMessage
    ? t(snapshot.detailMessage, detail ? { status: detailStatusText } : undefined)
    : '';

  const detailFields: Array<[PosTranslationKey, string]> = detail
    ? [
        ['paymentOrder', formatOrderCode(detail.displayKey || detail.orderKey)],
        ['paymentStatus', detailStatusText],
        ['paymentAmount', formatPaymentMoney(detail.amount, locale)],
        ['paymentTransactionId', detail.transactionId || '—'],
        ['paymentProviderOrderId', detail.providerOrderId || '—'],
        ['paymentCreated', formatPaymentTimestamp(detail.createdAt, locale)],
        ['paymentPaidAt', formatPaymentTimestamp(detail.paidAt, locale)],
        ['paymentRefundedAt', formatPaymentTimestamp(detail.refundedAt, locale)]
      ]
    : [];

  if (detail?.attentionReason) {
    detailFields.push(['paymentAttentionReason', t(`paymentReason${detail.attentionReason}` as PosTranslationKey)]);
  }
  if (detail?.refund) {
    detailFields.push(
      ['paymentReason', detail.refund.reason || '—'],
      ['paymentRefundRequestedAt', formatPaymentTimestamp(detail.refund.requestedAt, locale)],
      ['paymentRefundStatus', t(`paymentRefundState${detail.refund.status}` as PosTranslationKey)],
      ['paymentRefundTransactionId', detail.refund.transactionId || '—']
    );
  }
  if (detail && (detail.resultCode || detail.refund?.resultCode)) {
    detailFields.push(['paymentResultCode', detail.refund?.resultCode || detail.resultCode || '—']);
  }

  return (
    <>
      <div className="payment-workspace-heading">
        <div>
          <h2>LINE Pay</h2>
          <p data-payment-i18n="paymentWorkspaceIntro">{t('paymentWorkspaceIntro')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onOpenSettings}
            data-payment-i18n="paymentSettingsBtn"
          >
            {t('paymentSettingsBtn')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onRefresh}
            data-payment-i18n="paymentRefresh"
          >
            {t('paymentRefresh')}
          </button>
        </div>
      </div>

      <div
        id="payment-workspace-status"
        className={`payment-workspace-status${statusIsSuccess ? ' is-success' : ''}`}
        role="status"
        aria-live="polite"
      >
        {statusBannerText}
      </div>

      <section id="payment-access-panel" className="payment-access-panel" hidden={unlocked}>
        <p id="payment-access-description">{t(accessDescriptionKey)}</p>
        <button
          type="button"
          className="btn btn-primary"
          id="payment-workspace-login"
          hidden={snapshot.configured !== true || snapshot.pinChangeRequired}
          disabled={snapshot.loginBusy}
          onClick={onLogin}
        >
          {t(snapshot.pinChanged ? 'paymentLoginNewPin' : 'paymentLogin')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          id="payment-workspace-change-pin"
          hidden={snapshot.configured !== true || !snapshot.pinChangeRequired}
          onClick={onStartPinChange}
          data-payment-i18n="paymentChangePinContinue"
        >
          {t('paymentChangePinContinue')}
        </button>
      </section>

      <div id="payment-private-workspace" hidden={!unlocked}>
        <div
          className="payment-workspace-tabs"
          role="tablist"
          aria-label={t('paymentWorkspace')}
          data-payment-label="paymentWorkspace"
        >
          <button
            type="button"
            className={`btn${snapshot.view === 'attention' ? ' active' : ''}`}
            id="payment-tab-attention"
            role="tab"
            aria-controls="payment-list-panel"
            aria-selected={snapshot.view === 'attention'}
            onClick={() => onSelectView('attention')}
            data-payment-i18n="paymentNeedsReview"
          >
            {t('paymentNeedsReview')}
          </button>
          <button
            type="button"
            className={`btn${snapshot.view === 'history' ? ' active' : ''}`}
            id="payment-tab-history"
            role="tab"
            aria-controls="payment-list-panel"
            aria-selected={snapshot.view === 'history'}
            onClick={() => onSelectView('history')}
            data-payment-i18n="paymentHistory"
          >
            {t('paymentHistory')}
          </button>
        </div>

        <form
          id="payment-history-filters"
          className="payment-history-filters"
          hidden={snapshot.view !== 'history'}
          onSubmit={(event) => {
            event.preventDefault();
            const ok = onApplyFilters({
              from: fromInput,
              to: toInput,
              status: statusInput,
              q: queryInput
            });
            if (!ok) {
              fromInputRef.current?.focus();
            }
          }}
        >
          <div className="payment-range-shortcuts">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onSelectRange(1)}
              data-payment-i18n="paymentToday"
            >
              {t('paymentToday')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onSelectRange(7)}
              data-payment-i18n="paymentSevenDays"
            >
              {t('paymentSevenDays')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onSelectRange(30)}
              data-payment-i18n="paymentThirtyDays"
            >
              {t('paymentThirtyDays')}
            </button>
          </div>

          <div className="payment-filter-fields">
            <label>
              <span data-payment-i18n="paymentFrom">{t('paymentFrom')}</span>
              <input
                ref={fromInputRef}
                type="date"
                className="form-input"
                id="payment-filter-from"
                required
                value={fromInput}
                onChange={(event) => setFromInput(event.target.value)}
              />
            </label>
            <label>
              <span data-payment-i18n="paymentTo">{t('paymentTo')}</span>
              <input
                type="date"
                className="form-input"
                id="payment-filter-to"
                required
                value={toInput}
                onChange={(event) => setToInput(event.target.value)}
              />
            </label>
            <label>
              <span data-payment-i18n="paymentStatus">{t('paymentStatus')}</span>
              <select
                className="form-input"
                id="payment-filter-status"
                value={statusInput}
                onChange={(event) => setStatusInput(event.target.value)}
              >
                <option value="">{t('paymentAllStatuses')}</option>
                {PAYMENT_WORKSPACE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {resolvePaymentStatusLabel(status, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="payment-search-field">
              <span data-payment-i18n="paymentSearch">{t('paymentSearch')}</span>
              <input
                type="search"
                className="form-input"
                id="payment-filter-search"
                maxLength={100}
                autoComplete="off"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary" data-payment-i18n="paymentApplyFilters">
              {t('paymentApplyFilters')}
            </button>
          </div>

          <p className="payment-workspace-hint" data-payment-i18n="paymentDateHint">
            {t('paymentDateHint')}
          </p>
        </form>

        <section className="payment-summary-section">
          <p id="payment-summary-period" className="payment-workspace-hint">
            {t('paymentSummaryPeriod', summaryPeriod)}
          </p>
          <div className="payment-summary-grid">
            <div>
              <span data-payment-i18n="paymentCollectedLabel">{t('paymentCollectedLabel')}</span>
              <strong id="payment-summary-collected">
                {snapshot.summary ? formatPaymentMoney(snapshot.summary.collected, locale) : '—'}
              </strong>
            </div>
            <div>
              <span data-payment-i18n="paymentRefundedLabel">{t('paymentRefundedLabel')}</span>
              <strong id="payment-summary-refunded">
                {snapshot.summary ? formatPaymentMoney(snapshot.summary.refunded, locale) : '—'}
              </strong>
            </div>
            <div>
              <span data-payment-i18n="paymentNetLabel">{t('paymentNetLabel')}</span>
              <strong id="payment-summary-net">
                {snapshot.summary ? formatPaymentMoney(snapshot.summary.net, locale) : '—'}
              </strong>
            </div>
          </div>
          <p className="payment-workspace-hint" data-payment-i18n="paymentSummaryHint">
            {t('paymentSummaryHint')}
          </p>
        </section>

        <section
          id="payment-list-panel"
          className="payment-list-panel"
          role="tabpanel"
          aria-labelledby={`payment-tab-${snapshot.view}`}
          aria-busy={snapshot.listBusy}
        >
          <p id="payment-list-empty" className="payment-list-empty" hidden={snapshot.items.length > 0}>
            {t(emptyMessageKey)}
          </p>
          <table className="payment-transactions-table" id="payment-transactions-table" hidden={snapshot.items.length === 0}>
            <thead>
              <tr>
                <th data-payment-i18n="paymentOrder">{t('paymentOrder')}</th>
                <th data-payment-i18n="paymentCreated">{t('paymentCreated')}</th>
                <th data-payment-i18n="paymentAmount">{t('paymentAmount')}</th>
                <th data-payment-i18n="paymentStatus">{t('paymentStatus')}</th>
                <th data-payment-i18n="paymentAttentionReason">{t('paymentAttentionReason')}</th>
                <th data-payment-i18n="paymentActions">{t('paymentActions')}</th>
              </tr>
            </thead>
            <tbody id="payment-transaction-rows">
              {snapshot.items.map((payment) => {
                const actionKey: PosTranslationKey =
                  snapshot.view === 'attention'
                    ? payment.status === 'REFUND_FAILED'
                      ? 'paymentViewRefundFailure'
                      : payment.canRefund
                        ? 'paymentViewRefund'
                        : payment.canReconcile
                          ? 'paymentViewCheck'
                          : 'paymentViewDetail'
                    : 'paymentViewDetail';

                return (
                  <tr key={payment.id}>
                    <td data-label={t('paymentOrder')}>{formatOrderCode(payment.displayKey || payment.orderKey)}</td>
                    <td data-label={t('paymentCreated')}>{formatPaymentTimestamp(payment.createdAt, locale)}</td>
                    <td data-label={t('paymentAmount')}>{formatPaymentMoney(payment.amount, locale)}</td>
                    <td data-label={t('paymentStatus')}>{resolvePaymentStatusLabel(payment.status, locale)}</td>
                    <td data-label={t('paymentAttentionReason')}>
                      {payment.attentionReason ? t(`paymentReason${payment.attentionReason}` as PosTranslationKey) : '—'}
                    </td>
                    <td data-label={t('paymentActions')}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        data-payment-id={payment.id}
                        onClick={() => onOpenDetail(payment.id)}
                      >
                        {t(actionKey)}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            type="button"
            className="btn btn-ghost payment-load-more"
            id="payment-load-more"
            hidden={!snapshot.nextCursor}
            disabled={snapshot.listBusy}
            onClick={onLoadMore}
            data-payment-i18n="paymentLoadMore"
          >
            {t('paymentLoadMore')}
          </button>
        </section>
      </div>

      <dialog
        ref={detailDialogRef}
        id="payment-detail-dialog"
        className="payment-detail-dialog"
        aria-labelledby="payment-detail-title"
        onCancel={(event) => {
          event.preventDefault();
          onCloseDetail();
        }}
        onClick={(event) => {
          if (event.target === detailDialogRef.current) {
            const rect = detailDialogRef.current.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            ) {
              onCloseDetail();
            }
          }
        }}
      >
        <div className="payment-detail-heading">
          <h2 ref={detailTitleRef} id="payment-detail-title" tabIndex={-1} data-payment-i18n="paymentTransactionDetail">
            {t('paymentTransactionDetail')}
          </h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCloseDetail}
            data-payment-i18n="paymentClose"
          >
            {t('paymentClose')}
          </button>
        </div>

        <div id="payment-detail-body">
          {snapshot.detailBusy ? (
            <p>{t('paymentLoading')}</p>
          ) : detail ? (
            <>
              <dl className="payment-detail-data">
                {detailFields.map(([key, val]) => (
                  <div key={key}>
                    <dt>{t(key)}</dt>
                    <dd>{val}</dd>
                  </div>
                ))}
              </dl>
              {detail.status === 'REFUND_FAILED' && (
                <p className="payment-workspace-hint">{t('paymentRefundFailedHelp')}</p>
              )}
            </>
          ) : null}
        </div>

        <p id="payment-detail-message" role="status" aria-live="polite">
          {detailMessageText}
        </p>

        <div id="payment-detail-actions" className="payment-actions">
          {!snapshot.detailBusy && detail && (
            <>
              {detail.canReconcile && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  id="payment-detail-reconcile"
                  disabled={snapshot.actionBusy}
                  onClick={() => onReconcileDetail(detail.id)}
                >
                  {t(snapshot.actionBusy ? 'paymentChecking' : 'paymentCheck')}
                </button>
              )}
              {detail.canRefund && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  id="payment-detail-refund"
                  disabled={snapshot.actionBusy}
                  onClick={() => onRefundDetail(detail)}
                >
                  {t('paymentRefund')}
                </button>
              )}
              {detail.status === 'REFUND_FAILED' && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  id="payment-detail-support"
                  disabled={snapshot.actionBusy}
                  onClick={onOpenSupport}
                >
                  {t('paymentContactSupport')}
                </button>
              )}
            </>
          )}
        </div>
      </dialog>

      {snapshot.prompt &&
        (typeof document !== 'undefined' ? (
          createPortal(
            <PaymentPromptDialog
              prompt={snapshot.prompt}
              locale={locale}
              onSubmit={onSubmitPrompt}
              onDismiss={onDismissPrompt}
              onStartPinChange={onStartPinChange}
            />,
            document.body
          )
        ) : (
          <PaymentPromptDialog
            prompt={snapshot.prompt}
            locale={locale}
            onSubmit={onSubmitPrompt}
            onDismiss={onDismissPrompt}
            onStartPinChange={onStartPinChange}
          />
        ))}
    </>
  );
}
