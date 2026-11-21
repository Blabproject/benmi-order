import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { Button } from '@shared/ui/button';
import { ClockIcon, HelpCircleIcon, InboxIcon, ModifyIcon } from '@shared/ui/PosIcons';

declare function t(key: string, params?: Record<string, number>): string;
declare function toggleSidebar(force?: boolean): void;
declare function switchTab(tab: string): void;
declare function openBlabContactModal(topic: string): void;
declare function openStaffOrderWindow(): void;
declare function toggleStoreStatusMenu(event: MouseEvent): void;
declare function setStoreStatus(status: string): void;
declare function reviewNextNewOrder(): void;
declare function dismissNewAlert(): void;
declare function applyTenantBranding(branding: unknown): void;

function MenuIcon({ sidebar = false }: { sidebar?: boolean }) {
  return <svg className={sidebar ? 'sidebar-toggle-icon' : undefined} width={sidebar ? 22 : 20} height={sidebar ? 22 : 20}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <line x1="4" x2="20" y1={sidebar ? 12 : 6} y2={sidebar ? 12 : 6} />
    <line x1="4" x2="20" y1={sidebar ? 6 : 12} y2={sidebar ? 6 : 12} />
    <line x1="4" x2="20" y1="18" y2="18" />
  </svg>;
}

function StaffIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="8" height="4" x="8" y="2" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01" />
  </svg>;
}

function SettingsIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /><circle cx="12" cy="12" r="7" />
  </svg>;
}

const entries = [
  { id: 'live', label: '即時訂單', icon: <InboxIcon size={22} /> },
  { id: 'history', label: '歷史訂單', icon: <ClockIcon size={22} /> },
  { id: 'payments', label: '付款管理', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20M6 15h3" /></svg> },
  { id: 'menu', label: '菜單管理', icon: <ModifyIcon size={22} /> },
  { id: 'staff-order', label: '桌邊點餐', icon: <StaffIcon /> },
  { id: 'settings', label: '系統設定', icon: <SettingsIcon /> },
  { id: 'support', label: '技術支援', icon: <HelpCircleIcon size={22} /> },
];

function Sidebar() {
  return <>
    <div className="sidebar-header">
      <div className="sidebar-mobile-brand">
        <div className="sidebar-mobile-logo" id="sidebar-mobile-logo">B</div>
        <div className="sidebar-mobile-title-wrap">
          <span className="sidebar-mobile-title" id="sidebar-mobile-title">Blab POS</span>
          <span className="sidebar-mobile-sub" id="sidebar-mobile-sub">Online</span>
        </div>
      </div>
      <Button className="sidebar-toggle-btn" id="sidebar-toggle-btn" onClick={() => toggleSidebar()} aria-label={t('posNavigation')}>
        <MenuIcon sidebar />
      </Button>
    </div>
    <nav className="sidebar-nav" aria-label={t('posNavigation')}>
      {entries.map(({ id, label, icon }) => {
        const staff = id === 'staff-order';
        const payments = id === 'payments';
        return <Button key={id}
          className={`sidebar-nav-item${id === 'live' ? ' active' : ''}`} id={`tab-${id}`} data-tab={id}
          hidden={staff || payments} style={staff ? { display: 'none' } : undefined} aria-label={label}
          onClick={() => id === 'support' ? openBlabContactModal('support') : switchTab(id)}>
          <span className="nav-item-icon">{icon}</span>
          <span className="sidebar-label" id={payments ? undefined : `i18n-tab-${id}`} data-payment-i18n={payments ? 'paymentWorkspace' : undefined}>{label}</span>
          {id === 'live' && <span className="sidebar-count-badge" id="sidebar-live-count" style={{ display: 'none' }}>0</span>}
          {payments && <span className="sidebar-count-badge" id="sidebar-payment-count" hidden />}
        </Button>;
      })}
    </nav>
    <div className="sidebar-mobile-footer">
      <span className="sidebar-mobile-version">v4.8.2</span>
      <span className="sidebar-mobile-status-dot"><span className="status-indicator-dot" /> POS</span>
    </div>
  </>;
}

function Topbar() {
  return <>
    <Button className="mobile-nav-toggle-btn" id="mobile-nav-toggle-btn" onClick={() => toggleSidebar(true)} aria-label={t('posNavigation')}>
      <MenuIcon />
    </Button>
    <h1 className="page-main-title" id="page-main-title">訂單</h1>
    <div className="brand-badge-pill" id="brand-badge-pill">
      <img id="brand-logo" alt="" style={{ display: 'none', width: 22, height: 22, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }} />
      <span className="brand-title" id="brand-title">Blab POS</span>
      <span className="brand-sub" id="i18n-brand-sub" style={{ display: 'none' }}>即時訂單</span>
    </div>
  </>;
}

function StaffEntry() {
  return <Button className="btn btn-staff-order-pill" id="btn-staff-order-pill" style={{ display: 'none' }} onClick={openStaffOrderWindow}>
    <StaffIcon size={18} /><span id="i18n-btn-staff-order">桌邊點餐</span>
  </Button>;
}

const statuses = ['open', 'busy', 'paused', 'closed'] as const;

function StoreStatus() {
  return <>
    <Button className="store-status-pill open" id="store-status-btn" onClick={event => toggleStoreStatusMenu(event.nativeEvent)}>
      <span className="status-dot dot-open" />
      <span className="status-label" id="store-status-label">{t('statusOpen')}</span>
      <svg className="status-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </Button>
    <div className="store-status-menu" id="store-status-menu">
      <div className="status-menu-header" id="i18n-status-menu-header">{t('statusMenuHeader')}</div>
      {statuses.map(status => <Button key={status} className={`status-option${status === 'open' ? ' active' : ''}`} data-status={status} onClick={() => setStoreStatus(status)}>
        <span className="status-option-left">
          <span className={`status-dot dot-${status}`} />
          <span>
            <span className="status-opt-title" id={`i18n-status-opt-${status}`} />
            <span className="status-opt-desc" id={`i18n-status-desc-${status}`} />
          </span>
        </span>
        <svg className="status-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="m4 12 5 5L20 6" /></svg>
      </Button>)}
    </div>
  </>;
}

function Bell() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21a2 2 0 0 0 4 0" />
  </svg>;
}

function NewOrderAlert({ title, description }: { title: string; description: string }) {
  return <div className="new-alert-box" role="alertdialog" aria-labelledby="new-alert-title" aria-describedby="new-alert-sub">
    <div className="new-alert-badge-wrap"><div className="new-alert-pulse-ring" /><div className="new-alert-icon"><Bell /></div></div>
    <h2 className="new-alert-title" id="new-alert-title">{title}</h2>
    <p className="new-alert-sub" id="new-alert-sub">{description}</p>
    <div className="new-alert-actions">
      <Button className="btn btn-primary new-alert-btn-review" id="btn-alert-review" onClick={reviewNextNewOrder}>{t('alertBtnReview')}</Button>
      <Button className="btn btn-ghost new-alert-btn-dismiss" id="btn-alert-dismiss" onClick={dismissNewAlert}>{t('alertBtnDismiss')}</Button>
    </div>
  </div>;
}

function StaffOrderToast({ count }: { count: number }) {
  return <div id="staff-order-alert-toast" className="staff-order-alert-toast" role="status">
    <span><Bell />{t('staffOrderAlertCount', { count })}</span>
    <Button onClick={() => { switchTab('live'); reviewNextNewOrder(); }}>{t('staffOrderAlertReview')}</Button>
  </div>;
}

const regions: [string, ReactNode][] = [
  ['app-sidebar', <Sidebar />],
  ['pos-topbar-left', <Topbar />],
  ['pos-topbar-staff', <StaffEntry />],
  ['store-status-dropdown', <StoreStatus />],
];
flushSync(() => {
  for (const [id, view] of regions) {
    const host = document.getElementById(id);
    if (host) createRoot(host).render(view);
  }
});
document.getElementById('sidebar-backdrop')?.addEventListener('click', () => toggleSidebar(false));

const alertHost = document.getElementById('new-alert');
const toastHost = document.getElementById('pos-staff-alert');
let alertRoot: Root | undefined;
let toastRoot: Root | undefined;

Object.assign(window, { PosOrderAlert: {
  hide() {
    if (alertHost) alertHost.style.display = 'none';
    if (toastHost) toastHost.hidden = true;
  },
  show(title: string, description: string) {
    if (toastHost) toastHost.hidden = true;
    if (!alertHost) return;
    alertHost.style.display = 'flex';
    alertRoot ??= createRoot(alertHost);
    alertRoot.render(<NewOrderAlert title={title} description={description} />);
  },
  showStaff(count: number) {
    if (alertHost) alertHost.style.display = 'none';
    if (!toastHost) return;
    toastHost.hidden = false;
    toastRoot ??= createRoot(toastHost);
    toastRoot.render(<StaffOrderToast count={count} />);
  },
} });
const { posShellBranding } = window as Window & { posShellBranding?: unknown };
if (posShellBranding) applyTenantBranding(posShellBranding);
