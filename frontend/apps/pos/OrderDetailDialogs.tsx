import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { HistoryOrderDto } from '@shared/contracts/api';
import { Button } from '@shared/ui/button';
import { AlertTriangleIcon, BanIcon, BellOffIcon, ClockIcon, CloseIcon, HourglassIcon, MoonIcon } from '@shared/ui/PosIcons';

type MenuItem = { name: string; category: string };
type StickerGroup = { title: string; options: string[] };
type DialogKind = 'change' | 'reject' | 'sticker';

declare function t(key: string): string;
declare function closeModal(): void;
declare function closeQuickStickerModal(): void;
declare function fetchTenantMenuItems(): Promise<MenuItem[]>;
declare function getQuickStickerGroups(): StickerGroup[];
declare function printQuickModifierOption(text: string): Promise<void>;
declare function confirmAction(type: 'CHANGE' | 'REJECT', reason: string, note?: string): Promise<void>;

const presets = [5, 10, 15, 20, 30, 45];
const reasons = [
  { value: '今日已售完', label: 'rejectR1', Icon: BanIcon },
  { value: '訂單過多', label: 'rejectR2', Icon: HourglassIcon },
  { value: '已過營業時間', label: 'rejectR3', Icon: MoonIcon },
  { value: '取消並不回復客戶', label: 'rejectR4', Icon: BellOffIcon },
] as const;

function DialogContent({ kind, title, onClose, children, actions }: { kind: DialogKind; title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  return <div className="modal-content">
    <div className="modal-title">
      <h3 id={`order-${kind}-title`}>{title}</h3>
      <Button className="modal-close" aria-label={t('btnClose')} onClick={onClose}><CloseIcon /></Button>
    </div>
    <div className="modal-body">{children}</div>
    {actions && <div className="modal-actions two">{actions}</div>}
  </div>;
}

function timeLabel(base: Date, offset = 0) {
  const time = new Date(base.getTime() + offset * 60000);
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
}

function ChangeOrder({ order, base }: { order: HistoryOrderDto; base: Date }) {
  const [soldOut, setSoldOut] = useState(false);
  const [offset, setOffset] = useState(10);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const time = timeLabel(base, offset);

  useEffect(() => {
    let active = true;
    void fetchTenantMenuItems().then(list => {
      if (!active) return;
      const inOrder = (item: MenuItem) => Number(Boolean(order.content?.includes(item.name)));
      setItems([...list].sort((a, b) => inOrder(b) - inOrder(a)));
    });
    return () => { active = false; };
  }, [order]);

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await confirmAction('CHANGE', soldOut ? '口味售完' : '時間需調整', soldOut ? selected.join(',') : time);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <DialogContent kind="change" title={t('changeTitle')} onClose={closeModal} actions={<>
    <Button className="btn btn-yellow" id="btn-change-send" disabled={busy} onClick={submit}>{busy ? t('processing') : `${t('btnSendSuggest')}${soldOut ? '' : ` (${time})`}`}</Button>
    <Button className="btn btn-ghost" id="btn-change-cancel" onClick={closeModal}>{t('btnCancel')}</Button>
  </>}>
    <div className="change-type-tabs">
      <Button className={`change-tab-btn${soldOut ? '' : ' active'}`} id="tab-reason-time" aria-pressed={!soldOut} onClick={() => setSoldOut(false)}>
        <ClockIcon size={20} /><span className="tab-text"><span className="tab-title">{t('changeTabTime')}</span><span className="tab-sub">{t('changeTabTimeSub')}</span></span>
      </Button>
      <Button className={`change-tab-btn${soldOut ? ' active' : ''}`} id="tab-reason-soldout" aria-pressed={soldOut} onClick={() => setSoldOut(true)}>
        <AlertTriangleIcon size={20} /><span className="tab-text"><span className="tab-title">{t('changeTabSoldout')}</span><span className="tab-sub">{t('changeTabSoldoutSub')}</span></span>
      </Button>
    </div>
    {soldOut ? <div id="change-items-div">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>{t('soldoutTitle')}</strong><Button className="mini-text-btn" id="btn-soldout-clear" onClick={() => setSelected([])}>{t('soldoutClear')}</Button>
      </div>
      <div className="checkbox-grid" id="change-soldout-grid">
        {items.length === 0 && <div>{t('reviewEmptyMenu')}</div>}
        {items.map(({ name }) => {
          const inOrder = order.content?.includes(name);
          return <label className="checkbox-card" key={name} style={inOrder ? { borderColor: '#f59e0b', background: '#fffdf5' } : undefined}>
            <input type="checkbox" className="sold-item" value={name} checked={selected.includes(name)}
              onChange={event => {
                const checked = event.currentTarget.checked;
                setSelected(previous => checked ? [...previous, name] : previous.filter(item => item !== name));
              }} />
            <span>{name}</span>{inOrder && <strong>{t('reviewItemInOrder')}</strong>}
          </label>;
        })}
      </div>
    </div> : <div id="change-time-div" className="time-adjust-block">
      <div className="time-summary-row">
        <div className="orig-time-badge"><span className="orig-time-label">{t('origTimeLabel')}</span><span className="orig-time-val" id="change-orig-time-val">{timeLabel(base)}</span></div>
        <div className="stepper-control">
          <Button className="stepper-btn" aria-label="-5m" onClick={() => setOffset(value => value - 5)}>−</Button>
          <input type="text" id="change-note" readOnly className="change-note-display" value={time} aria-label={t('labelPickup')} />
          <Button className="stepper-btn" aria-label="+5m" onClick={() => setOffset(value => value + 5)}>+</Button>
        </div>
      </div>
      <div className="presets-container">
        <div className="presets-header"><span>{t('changeQuickSelect')}</span> <span>{t('calcFromNowSub')}</span></div>
        <div className="presets-grid">
          {presets.map(minutes => <Button key={minutes} data-mins={minutes} className={`preset-card${offset === minutes ? ' active' : ''}`}
            aria-pressed={offset === minutes} onClick={() => setOffset(minutes)}>
            <span className="preset-add">+{minutes}m</span><span className="preset-target-time" id={`preset-target-${minutes}`}>{timeLabel(base, minutes)}</span>
          </Button>)}
        </div>
      </div>
    </div>}
  </DialogContent>;
}

function RejectOrder() {
  const [reason, setReason] = useState<(typeof reasons)[number]['value']>(reasons[0].value);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try { await confirmAction('REJECT', reason); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <DialogContent kind="reject" title={t('rejectTitle')} onClose={closeModal} actions={<>
    <Button className="btn btn-danger" id="btn-reject-confirm" disabled={busy} onClick={submit}>{t(busy ? 'processing' : 'btnConfirmReject')}</Button>
    <Button className="btn btn-ghost" id="btn-reject-cancel" onClick={closeModal}>{t('btnBack')}</Button>
  </>}>
    <div className="reject-reason-grid">
      {reasons.map(({ value, label, Icon }) => <Button key={value} data-val={value} className={`reject-card${value === reason ? ' active' : ''}`}
        aria-pressed={value === reason} onClick={() => setReason(value)}>
        <Icon className="ps-shrink-0" />
        <span className="reject-text"><span className="reject-title">{t(`${label}Title`)}</span><span className="reject-sub">{t(`${label}Sub`)}</span></span>
      </Button>)}
    </div>
  </DialogContent>;
}

function QuickSticker() {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const printing = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function print(text: string, custom = false) {
    if (printing.current) return;
    if (!text.trim()) {
      input.current?.focus();
      return;
    }
    printing.current = true;
    setBusy(true);
    try {
      await printQuickModifierOption(text.trim());
      if (custom) setNote('');
    } finally {
      printing.current = false;
      setBusy(false);
    }
  }

  return <DialogContent kind="sticker" title={t('quickStickerModalTitle')} onClose={closeQuickStickerModal}>
    <p>{t('quickStickerModalSub')}</p>
    <div id="quick-sticker-chips-container" style={{ display: 'grid', gap: 14 }}>
      {getQuickStickerGroups().map((group, index) => <section key={`${group.title}-${index}`} style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
        <h4>{group.title}</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {group.options.map((option, optionIndex) => <Button key={`${option}-${optionIndex}`} className="btn btn-ghost quick-sticker-chip" disabled={busy}
            onClick={() => print(option)}>{option}</Button>)}
        </div>
      </section>)}
    </div>
    <form style={{ marginTop: 18 }} onSubmit={event => { event.preventDefault(); void print(note, true); }}>
      <label htmlFor="quick-sticker-custom-input">{t('quickStickerCustomLabel')}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input ref={input} className="form-input" id="quick-sticker-custom-input" value={note} onChange={event => setNote(event.currentTarget.value)}
          placeholder={t('quickStickerCustomPlaceholder')} style={{ minHeight: 48, flex: '1 1 12rem' }} />
        <Button type="submit" className="btn btn-primary" id="i18n-btn-print-quick-custom" disabled={busy}>{t('quickStickerCustomPrintBtn')}</Button>
      </div>
    </form>
  </DialogContent>;
}

const ids: Record<DialogKind, string> = { change: 'changeModal', reject: 'rejectModal', sticker: 'quickStickerModal' };
const roots: Partial<Record<DialogKind, Root>> = {};
const views: Partial<Record<DialogKind, () => ReactNode>> = {};
let instance = 0;

function render(kind: DialogKind) {
  const host = document.getElementById(ids[kind]);
  if (!host || !views[kind]) return;
  const view = views[kind];
  flushSync(() => {
    roots[kind] ??= createRoot(host);
    roots[kind]?.render(view());
  });
}

Object.assign(window, { PosOrderDetailDialogs: {
  openChange(order: HistoryOrderDto, base: Date) {
    const key = ++instance;
    views.change = () => <ChangeOrder key={key} order={order} base={base} />;
    render('change');
  },
  openReject() {
    const key = ++instance;
    views.reject = () => <RejectOrder key={key} />;
    render('reject');
  },
  openSticker() {
    const key = ++instance;
    views.sticker = () => <QuickSticker key={key} />;
    render('sticker');
  },
  refresh() {
    for (const kind of Object.keys(ids) as DialogKind[]) {
      if (document.getElementById(ids[kind])?.style.display === 'flex') render(kind);
    }
  },
} });
