import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatOrderCode } from '@shared/contracts/order-formatters';
import {
  extractOrderDetailGlobalChoices,
  extractOrderDetailLines,
  extractOrderDetailNotes,
  formatOrderDetailPlainText,
  isOrderDetailSnapshot
} from '@shared/contracts/order-detail-view';
import type {
  PaymentLocale,
  PaymentProviderTarget,
  PaymentResultDto,
  PaymentSessionRecord
} from '@shared/contracts/payment';
import {
  buildPaymentMenuUrl,
  formatPaymentCancelMessage,
  type PaymentApiError,
  type PaymentSessionClient
} from './payment-result-client';

export interface PaymentResultAppProps {
  tenant: string;
  paymentId: string;
  initialLocale: PaymentLocale;
  hasExplicitLangParam: boolean;
  client: PaymentSessionClient;
  navigate?: (url: string) => void;
}

type ResultVisualState = 'paid' | 'cancelled' | 'pending';

interface PaymentWindowWithSession extends Window {
  PaymentSession?: PaymentSessionClient;
}

function getProviderBridge(client: PaymentSessionClient): Pick<PaymentSessionClient, 'openProvider' | 'providerTarget'> {
  if (typeof window === 'undefined') return client;
  const host = window as PaymentWindowWithSession;
  return {
    openProvider: (data, preferWeb = false) => (host.PaymentSession?.openProvider ?? client.openProvider)(data, preferWeb),
    providerTarget: (data) => (host.PaymentSession?.providerTarget ?? client.providerTarget)(data)
  };
}

/** Lucide check / cancel / clock icons (MIT license). */
function PaymentStateIcon({ kind }: { kind: 'check' | 'cancel' | 'clock' }) {
  const paths =
    kind === 'check'
      ? ['M20 6 9 17l-5-5']
      : kind === 'cancel'
        ? ['m18 6-12 12', 'm6 6 12 12']
        : ['M12 8v4l3 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'];
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function resolveHttpsLogoUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

interface ResultCopy {
  title: string;
  description: string;
  visualState: ResultVisualState;
  iconKind: 'check' | 'cancel' | 'clock';
  paid: boolean;
  terminal: boolean;
  refunding: boolean;
}

function resolveResultCopy(
  data: PaymentResultDto | null,
  missing: boolean,
  locale: PaymentLocale
): ResultCopy {
  const t = (zh: string, vi: string) => (locale === 'vi' ? vi : zh);
  const paid = Boolean(data?.paidAt);
  const terminal = data?.status === 'CANCELLED' || data?.status === 'FAILED';
  const refunded = data?.status === 'REFUNDED';
  const refunding = data?.status === 'REFUND_PENDING';
  const refundFailed = data?.status === 'REFUND_FAILED';

  let title: string;
  let description: string;
  if (missing) {
    title = t('無法讀取付款結果', 'Chưa thể xem kết quả thanh toán');
    description = t(
      '請使用原本下單的瀏覽器或視窗查看付款結果，暫時無需重新付款。',
      'Hãy mở lại trình duyệt hoặc cửa sổ đã đặt món để kiểm tra. Vui lòng chưa thanh toán lại.'
    );
  } else if (refunded) {
    title = t('已退款', 'Đã hoàn tiền');
    description = t('本筆付款已全額退款。', 'Khoản thanh toán này đã được hoàn toàn bộ.');
  } else if (refundFailed) {
    title = t('退款尚未完成', 'Chưa hoàn tiền xong');
    description = t('請聯絡門市確認退款進度。', 'Vui lòng liên hệ quán để kiểm tra việc hoàn tiền.');
  } else if (refunding) {
    title = t('退款處理中', 'Đang xử lý hoàn tiền');
    description = t('門市正在處理退款，請稍後重新查詢。', 'Quán đang xử lý hoàn tiền. Vui lòng kiểm tra lại sau.');
  } else if (paid) {
    title = t('付款成功', 'Thanh toán thành công');
    if (data?.orderStatus && ['REJECTED', 'FORCE_REJECT', 'EXPIRED'].includes(data.orderStatus)) {
      description = t('門市已取消訂單，請確認退款進度。', 'Quán đã hủy đơn. Vui lòng kiểm tra tình trạng hoàn tiền với quán.');
    } else if (data?.orderStatus === 'NEW') {
      description = t('訂單已送出，等待門市確認。', 'Đơn đã gửi, đang chờ quán xác nhận.');
    } else {
      description = t('請依約定時間取餐。', 'Vui lòng lấy món theo giờ đã hẹn.');
    }
  } else if (terminal) {
    title = t('尚未付款', 'Chưa thanh toán');
    description =
      data?.status === 'CANCELLED'
        ? t('付款已取消或逾時。您可以返回購物車繼續下單。', 'Thanh toán đã hủy hoặc hết hạn. Bạn có thể quay lại giỏ hàng để tiếp tục.')
        : t('付款未完成。請返回購物車確認後再試。', 'Thanh toán chưa hoàn tất. Hãy quay lại giỏ hàng để kiểm tra và thử lại.');
  } else if (data?.cancelRequestedAt) {
    title = t('正在確認取消結果', 'Đang kiểm tra trước khi hủy');
    description = formatPaymentCancelMessage(data, locale);
  } else {
    title = t('正在確認付款', 'Đang xác minh thanh toán');
    description = t(
      '請稍候。確認完成前，請勿重複下單或付款。',
      'Vui lòng chờ. Chưa đặt lại đơn hoặc thanh toán lại khi chưa có kết quả.'
    );
  }

  return {
    title,
    description,
    visualState: paid ? 'paid' : terminal ? 'cancelled' : 'pending',
    iconKind: paid ? 'check' : terminal ? 'cancel' : 'clock',
    paid,
    terminal,
    refunding
  };
}

function PaymentReceiptDetails({
  receipt,
  locale
}: {
  receipt: PaymentResultDto['receipt'];
  locale: PaymentLocale;
}) {
  if (!receipt) return null;
  const t = (zh: string, vi: string) => (locale === 'vi' ? vi : zh);
  const snapshot = isOrderDetailSnapshot(receipt) ? receipt : null;
  const globalChoices = snapshot ? extractOrderDetailGlobalChoices(snapshot) : [];
  const lines = snapshot ? extractOrderDetailLines(snapshot) : [];
  const roundNote = snapshot ? extractOrderDetailNotes(snapshot) : '';

  return (
    <details className="payment-receipt-details" open>
      <summary className="payment-receipt-toggle">{t('查看訂單明細', 'Xem chi tiết đơn')}</summary>
      <div className="payment-receipt-body">
        {snapshot ? (
          <>
            {globalChoices.length > 0 && (
              <dl className="payment-receipt-choices">
                {globalChoices.map((choice) => (
                  <div key={`${choice.roundNumber}-${choice.groupId}-${choice.optionId}`} className="payment-receipt-choice">
                    <dt>{choice.label}</dt>
                    <dd>{choice.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <ul className="payment-receipt-items">
              {lines.map((line) => (
                <li key={`${line.round_number}-${line.lineId}`} className="payment-receipt-item">
                  <div className="payment-receipt-line">
                    <span className="payment-receipt-name">
                      {line.quantity} × {line.name}
                    </span>
                    <span className="payment-receipt-price">${line.subtotal}</span>
                  </div>
                  {line.options.map((option, index) => (
                    <p key={`${option.groupId}-${option.optionId}-${index}`} className="payment-receipt-note">
                      {option.choice}
                    </p>
                  ))}
                  {line.note && <p className="payment-receipt-note">{line.note}</p>}
                </li>
              ))}
            </ul>
            {roundNote && <p className="payment-receipt-note">{roundNote}</p>}
          </>
        ) : (
          <p className="payment-receipt-note">{formatOrderDetailPlainText(receipt)}</p>
        )}
      </div>
    </details>
  );
}

/** Customer LINE Pay result page rendered cleanly as a standalone React + TypeScript entrypoint. */
export function PaymentResultApp({
  tenant,
  paymentId,
  initialLocale,
  hasExplicitLangParam,
  client,
  navigate = (url: string) => window.location.assign(url)
}: PaymentResultAppProps) {
  const [locale, setLocale] = useState<PaymentLocale>(initialLocale);
  const [result, setResult] = useState<PaymentResultDto | null>(null);
  const [session, setSession] = useState<PaymentSessionRecord | null>(null);
  const [missing, setMissing] = useState<boolean>(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);
  const [brokenLogoUrl, setBrokenLogoUrl] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState<boolean>(false);
  const [cancelBusy, setCancelBusy] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string>('');

  const busyRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<PaymentResultDto | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);

  const validParams = useMemo(
    () => /^[a-zA-Z0-9_-]+$/.test(tenant) && /^[a-f0-9-]{36}$/i.test(paymentId),
    [paymentId, tenant]
  );

  const t = useCallback((zh: string, vi: string) => (locale === 'vi' ? vi : zh), [locale]);

  const clearPollTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!validParams || busyRef.current) return;
    const currentSession = client.forResult(paymentId);
    if (!currentSession) {
      setResult(null);
      setSession(null);
      setMissing(true);
      setHasLoadedOnce(true);
      return;
    }
    busyRef.current = true;
    clearPollTimer();
    try {
      const endpoint = `/api/payments/${encodeURIComponent(paymentId)}${
        currentSession.completed || currentSession.terminal ? '' : '/confirm'
      }`;
      const body = currentSession.completed || currentSession.terminal ? undefined : {};
      const data = await client.api(endpoint, currentSession, body);
      if (!client.same(client.forResult(paymentId), currentSession)) return;
      latestRef.current = data;
      if (!hasExplicitLangParam && data.merchant?.locale === 'vi') {
        setLocale('vi');
      }
      if (data.paidAt) {
        client.paid(currentSession);
      } else if (data.status === 'CANCELLED' || data.status === 'FAILED') {
        client.terminal({ ...currentSession, terminal: true });
      }
      setSession(currentSession);
      setResult(data);
      setMissing(false);
      setHasLoadedOnce(true);
      client.cleanUrl(true);
      if (!data.paidAt && data.status !== 'CANCELLED' && data.status !== 'FAILED') {
        timerRef.current = setTimeout(() => {
          if (typeof document === 'undefined' || !document.hidden) {
            void refresh();
          }
        }, 5000);
      }
    } catch (error) {
      const status = (error as PaymentApiError)?.status;
      const isMissing = status === 403 || status === 404;
      setResult(null);
      setSession(currentSession);
      setMissing(isMissing);
      setHasLoadedOnce(true);
      if (!isMissing) {
        timerRef.current = setTimeout(() => {
          if (typeof document === 'undefined' || !document.hidden) {
            void refresh();
          }
        }, 10000);
      }
    } finally {
      busyRef.current = false;
    }
  }, [clearPollTimer, client, hasExplicitLangParam, paymentId, validParams]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  useEffect(() => {
    if (!validParams) {
      setMissing(true);
      setHasLoadedOnce(true);
      return;
    }
    client.cleanUrl(true);
    void refresh();

    const handleVisibilityChange = () => {
      if (!document.hidden) void refresh();
    };
    const handlePageHide = () => clearPollTimer();
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      clearPollTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [clearPollTimer, client, refresh, validParams]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (cancelDialogOpen) {
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
      backButtonRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [cancelDialogOpen]);

  const navigateMenu = useCallback(
    (restore = false) => {
      clearPollTimer();
      if (session) {
        if (restore) {
          client.restore(session);
        } else {
          client.detach(session);
        }
      }
      const targetUrl = buildPaymentMenuUrl(latestRef.current?.menuUrl, tenant, locale);
      navigate(targetUrl.toString());
    },
    [clearPollTimer, client, locale, navigate, session, tenant]
  );

  const openCancelDialog = () => {
    clearPollTimer();
    setCancelError('');
    setCancelBusy(false);
    setCancelDialogOpen(true);
  };

  const closeCancelDialog = () => {
    if (cancelBusy) return;
    setCancelDialogOpen(false);
    void refresh();
  };

  const handleConfirmCancel = async () => {
    if (cancelBusy || !session) return;
    setCancelBusy(true);
    setCancelError(t('正在處理…', 'Đang xử lý…'));
    try {
      const current = await client.resolve(session);
      if (!client.matches(session) && !client.same(client.archive(session.id), session)) {
        throw new Error('REPLACED');
      }
      const answer = await client.api(`/api/payments/${encodeURIComponent(current.id)}/cancel`, session, {});
      if (answer.paidAt) {
        client.paid(session);
      } else if (answer.status === 'CANCELLED' || answer.status === 'FAILED') {
        client.terminal({ ...client.forResult(current.id), ...session });
      }
      latestRef.current = answer;
      setResult(answer);
      setMissing(false);
      setCancelBusy(false);
      setCancelDialogOpen(false);
      if (!answer.paidAt && answer.status !== 'CANCELLED' && answer.status !== 'FAILED') {
        void refresh();
      }
    } catch {
      setCancelBusy(false);
      setCancelError(
        t(
          '尚未確認取消結果。請重試查詢，勿重新付款。',
          'Chưa xác nhận được kết quả hủy. Hãy kiểm tra lại, chưa thanh toán lại.'
        )
      );
    }
  };

  const showInitialPlaceholder = !hasLoadedOnce && !missing && !result;
  const copy = useMemo(() => resolveResultCopy(result, missing, locale), [locale, missing, result]);
  const logoSrc = useMemo(() => {
    const resolved = resolveHttpsLogoUrl(result?.merchant?.logoUrl);
    return resolved && resolved !== brokenLogoUrl ? resolved : null;
  }, [brokenLogoUrl, result?.merchant?.logoUrl]);

  const brandName = result?.merchant?.brandName || t('訂單付款', 'Thanh toán đơn hàng');

  useEffect(() => {
    if (typeof document !== 'undefined' && hasLoadedOnce) {
      document.title = copy.title;
    }
  }, [copy.title, hasLoadedOnce]);

  const providerBridge = getProviderBridge(client);
  const providerTarget: PaymentProviderTarget | null =
    !copy.paid && !copy.terminal && !missing && result?.paymentUrl ? providerBridge.providerTarget(result) : null;
  const formattedOrderKey = result?.displayKey ? formatOrderCode(result.displayKey) : '';

  return (
    <>
      <header className="payment-page-brand">
        <img
          id="payment-brand-logo"
          alt=""
          src={logoSrc || undefined}
          hidden={!logoSrc}
          onError={() => {
            if (logoSrc) setBrokenLogoUrl(logoSrc);
          }}
        />
        <span id="payment-brand-name">{brandName}</span>
        <span className="payment-provider">LINE Pay</span>
      </header>

      <section
        id="payment-result"
        className="payment-panel payment-result-card"
        aria-live="polite"
        aria-atomic="true"
        data-state={showInitialPlaceholder ? undefined : copy.visualState}
      >
        {showInitialPlaceholder ? (
          <p>{t('正在確認付款…', 'Đang kiểm tra thanh toán…')}</p>
        ) : (
          <>
            <div className="payment-result-heading">
              <span className="payment-result-mark">
                <PaymentStateIcon kind={copy.iconKind} />
              </span>
              <div className="payment-result-titles">
                <h1 className="payment-result-title">{copy.title}</h1>
                <p className="payment-result-description">{copy.description}</p>
              </div>
            </div>

            {result?.displayKey && (
              <div className="payment-receipt-meta">
                <div className="payment-receipt-identity">
                  <span className="payment-receipt-label">{t('訂單編號', 'Mã đơn')}</span>
                  <strong className="payment-receipt-key">{formattedOrderKey}</strong>
                </div>
                <div className="payment-receipt-amount">
                  <span className="payment-receipt-label">
                    {copy.paid ? t('已付金額', 'Đã thanh toán') : t('訂單金額', 'Giá trị đơn')}
                  </span>
                  <strong className="payment-receipt-total">{`TWD ${result.amount}`}</strong>
                </div>
                {result.pickupTime && (
                  <div className="payment-pickup">
                    <span>{t('取餐時間', 'Giờ lấy món')}</span>
                    <span>{result.pickupTime}</span>
                  </div>
                )}
              </div>
            )}

            <PaymentReceiptDetails receipt={result?.receipt} locale={locale} />

            {providerTarget?.usesApp && (
              <p className="payment-receipt-note">
                {t(
                  '若無法開啟 LINE Pay，您也可以改用瀏覽器付款。',
                  'Nếu không mở được LINE Pay, bạn có thể thanh toán trong trình duyệt.'
                )}
              </p>
            )}

            <div className="payment-page-actions">
              {copy.paid ? (
                <>
                  {copy.refunding && (
                    <button type="button" className="payment-button payment-secondary" onClick={() => void refresh()}>
                      {t('重新查詢', 'Kiểm tra lại')}
                    </button>
                  )}
                  <button type="button" className="payment-button payment-primary" onClick={() => navigateMenu(false)}>
                    {t('再訂一筆', 'Đặt đơn mới')}
                  </button>
                </>
              ) : copy.terminal ? (
                <button type="button" className="payment-button payment-primary" onClick={() => navigateMenu(true)}>
                  {t('返回購物車', 'Quay lại giỏ hàng')}
                </button>
              ) : missing ? (
                <button
                  type="button"
                  className="payment-button payment-secondary"
                  onClick={() => navigate(buildPaymentMenuUrl(latestRef.current?.menuUrl, tenant, locale).toString())}
                >
                  {t('返回菜單', 'Quay lại menu')}
                </button>
              ) : (
                <>
                  {result?.canCancel && (
                    <button type="button" className="payment-button payment-secondary" onClick={openCancelDialog}>
                      {t('取消舊付款流程', 'Hủy phiên cũ')}
                    </button>
                  )}
                  {result?.paymentUrl && (
                    <>
                      <button
                        type="button"
                        className="payment-button payment-primary"
                        onClick={() => providerBridge.openProvider(result, false)}
                      >
                        {t('繼續 LINE Pay 付款', 'Tiếp tục LINE Pay')}
                      </button>
                      {providerTarget?.usesApp && (
                        <button
                          type="button"
                          className="payment-button payment-secondary"
                          onClick={() => providerBridge.openProvider(result, true)}
                        >
                          {t('改用瀏覽器付款', 'Thanh toán trong trình duyệt')}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className={`payment-button ${!result?.paymentUrl ? 'payment-primary' : 'payment-secondary'}`}
                    onClick={() => void refresh()}
                  >
                    {t('重新查詢', 'Kiểm tra lại')}
                  </button>
                  <button
                    type="button"
                    className="payment-button payment-secondary"
                    onClick={() => navigate(buildPaymentMenuUrl(latestRef.current?.menuUrl, tenant, locale).toString())}
                  >
                    {t('返回菜單', 'Quay lại menu')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>

      {cancelDialogOpen && (
        <dialog
          ref={dialogRef}
          id="payment-cancel-dialog"
          className="payment-cancel-dialog"
          aria-labelledby="payment-cancel-title"
          onCancel={(event) => {
            if (cancelBusy) {
              event.preventDefault();
            } else {
              closeCancelDialog();
            }
          }}
          onClose={() => {
            if (cancelDialogOpen) {
              setCancelDialogOpen(false);
            }
          }}
        >
          <h2 id="payment-cancel-title">{t('取消舊付款流程', 'Hủy phiên thanh toán cũ')}</h2>
          <p>
            {locale === 'vi'
              ? `Hủy phiên thanh toán của đơn${formattedOrderKey ? ` ${formattedOrderKey}` : ''}? Các món đang chọn sẽ được giữ lại.`
              : `取消訂單${formattedOrderKey ? ` ${formattedOrderKey}` : ''}的付款流程？目前選擇的餐點將保留。`}
          </p>
          <p className="payment-action-message" role="status">
            {cancelError}
          </p>
          <div className="payment-dialog-actions">
            <button
              ref={backButtonRef}
              type="button"
              className="payment-button"
              disabled={cancelBusy}
              onClick={closeCancelDialog}
            >
              {t('保留付款', 'Giữ phiên')}
            </button>
            <button
              type="button"
              className="payment-button"
              disabled={cancelBusy}
              onClick={() => void handleConfirmCancel()}
            >
              {t('確認取消', 'Xác nhận hủy')}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
