import { useEffect, useState } from 'react';
import { Button } from '@shared/ui/button';
import { Card } from '@shared/ui/card';
import { Input } from '@shared/ui/input';
import { NativeSelect } from '@shared/ui/native-select';
import { Switch } from '@shared/ui/switch';
import { TableRows, type TablesView } from '../settings/TableRows';
import { settingsActions as actions } from '../settings/settings-actions';
import type { DineInTableMode, QrChannel, QrChannelDiningPolicy, Shift, Translate } from './contracts';

export interface QrChannelDraft {
  id?: string;
  label: string;
  code: string;
  diningPolicy: QrChannelDiningPolicy;
  defaultShiftId: string;
  defaultLocale: string;
  isActive: boolean;
}

export interface QrChannelsPanelProps {
  t: Translate;
  shifts: Shift[];
  channels: QrChannel[];
  loading: boolean;
  dineInTableMode: DineInTableMode;
  tableConfigSaving: boolean;
  hasDineIn: boolean;
  hasMenuSchedule: boolean;
  tablesView: TablesView;
  canReadTables: boolean;
  canWriteTables: boolean;
  prefillShiftId?: string | null;
  onClearPrefillShift?: () => void;
  onSaveChannel: (draft: QrChannelDraft) => Promise<QrChannel | null>;
  onToggleChannel: (channel: QrChannel, isActive: boolean) => Promise<void>;
  onDeleteChannel: (channel: QrChannel) => Promise<void>;
  onSetDineInTableMode: (mode: DineInTableMode) => Promise<void>;
}

const ORDER_TYPE_OPTIONS: { value: QrChannelDiningPolicy; labelKey: string; helpKey: string }[] = [
  { value: 'dine_in', labelKey: 'qrOrderTypeDineIn', helpKey: 'qrOrderTypeHelpDineIn' },
  { value: 'takeaway', labelKey: 'qrOrderTypeTakeaway', helpKey: 'qrOrderTypeHelpTakeaway' },
  { value: 'customer_choice', labelKey: 'qrOrderTypeChoice', helpKey: 'qrOrderTypeHelpChoice' },
];

const LOCALE_LABELS: Record<string, string> = {
  'zh-TW': '繁體中文',
  en: 'English',
  vi: 'Tiếng Việt',
};

function QrCodeSvg({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M21 21v.01" />
      <path d="M12 7v3a2 2 0 0 1-2 2H7" />
      <path d="M3 12h.01" />
      <path d="M12 3h.01" />
      <path d="M12 16v.01" />
      <path d="M16 12h1" />
      <path d="M21 12v.01" />
      <path d="M12 21v-1" />
    </svg>
  );
}

function PrinterSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function EditSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function emptyDraft(shiftId = '', hasDineIn = true): QrChannelDraft {
  return {
    label: '',
    code: '',
    diningPolicy: hasDineIn ? 'customer_choice' : 'takeaway',
    defaultShiftId: shiftId,
    defaultLocale: '',
    isActive: true,
  };
}

export function QrChannelsPanel(props: QrChannelsPanelProps) {
  const { t, shifts, channels, loading, dineInTableMode, tableConfigSaving, hasDineIn, hasMenuSchedule, tablesView, canReadTables, canWriteTables } = props;
  const [editorOpen, setEditorOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draft, setDraft] = useState<QrChannelDraft>(() => emptyDraft('', hasDineIn));
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (props.prefillShiftId) {
      setDraft(emptyDraft(props.prefillShiftId, hasDineIn));
      setEditorOpen(true);
      setAdvancedOpen(true);
      setErrorMsg('');
      props.onClearPrefillShift?.();
    }
  }, [props.prefillShiftId, props.onClearPrefillShift, hasDineIn]);

  const qrHost = window as unknown as {
    openChannelQrModal?: (channel: QrChannel) => void;
    printAllQrChannelsA4?: (list: QrChannel[]) => void;
  };

  function openNewForm() {
    setDraft(emptyDraft('', hasDineIn));
    setAdvancedOpen(false);
    setErrorMsg('');
    setEditorOpen(true);
  }

  function openEditForm(channel: QrChannel) {
    setDraft({
      id: channel.id,
      label: channel.label,
      code: channel.code,
      diningPolicy: hasDineIn ? (channel.diningPolicy || 'customer_choice') : 'takeaway',
      defaultShiftId: channel.defaultShiftId || '',
      defaultLocale: channel.defaultLocale || '',
      isActive: channel.isActive !== false,
    });
    setAdvancedOpen(Boolean(channel.defaultShiftId || channel.defaultLocale));
    setErrorMsg('');
    setEditorOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setEditorOpen(false);
    setErrorMsg('');
  }

  async function handleSave() {
    if (saving) return;
    if (!draft.label.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const saved = await props.onSaveChannel({
        ...draft,
        diningPolicy: hasDineIn ? draft.diningPolicy : 'takeaway',
        label: draft.label.trim(),
        code: draft.code.trim(),
      });
      if (saved) {
        setEditorOpen(false);
        qrHost.openChannelQrModal?.(saved);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft.id || saving) return;
    const editingChannel = channels.find(c => c.id === draft.id);
    if (!editingChannel) return;
    if (typeof window.confirm === 'function' && !window.confirm(t('qrDeleteConfirm', { label: editingChannel.label }))) {
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      await props.onDeleteChannel(editingChannel);
      setEditorOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(channel: QrChannel, nextActive: boolean) {
    if (busyId) return;
    setBusyId(channel.id);
    try {
      await props.onToggleChannel(channel, nextActive);
    } finally {
      setBusyId(null);
    }
  }

  function orderTypeLabel(policy?: QrChannelDiningPolicy) {
    if (policy === 'dine_in') return t('qrOrderTypeDineIn');
    if (policy === 'takeaway') return t('qrOrderTypeTakeaway');
    return t('qrOrderTypeChoice');
  }

  const visibleOrderOptions = hasDineIn
    ? ORDER_TYPE_OPTIONS
    : ORDER_TYPE_OPTIONS.filter(option => option.value === 'takeaway');
  const effectiveDiningPolicy = hasDineIn ? draft.diningPolicy : 'takeaway';
  const activeOrderHelpKey = visibleOrderOptions.find(o => o.value === effectiveDiningPolicy)?.helpKey ?? (hasDineIn ? 'qrOrderTypeHelpChoice' : 'qrOrderTypeHelpTakeaway');
  const draftShift = draft.defaultShiftId ? shifts.find(s => String(s.id) === String(draft.defaultShiftId)) : null;
  const summaryMenuText = draftShift
    ? t('qrSummaryMenuFixed', { shift: draftShift.name })
    : t('qrSummaryMenuAuto');
  const summaryPolicyText = effectiveDiningPolicy === 'dine_in'
    ? t('qrSummaryPolicyDineIn')
    : (effectiveDiningPolicy === 'takeaway' ? t('qrSummaryPolicyTakeaway') : t('qrSummaryPolicyChoice'));
  const summaryText = t('qrSummaryPrefix', {
    menu: summaryMenuText,
    label: draft.label.trim() || '...',
    policy: summaryPolicyText,
  });

  return (
    <Card className="ms-panel qr-workspace-panel" flush>
      <section className="qr-section" aria-labelledby="qr-tables-section-heading">
        <div className="qr-section-head">
          <h3 id="qr-tables-section-heading" className="qr-section-title">{t('qrTablesSectionTitle')}</h3>
        </div>

        {hasDineIn && (
          <div className="qr-tables-card">
            <div className="qr-tables-info">
              <div className="qr-tables-title">
                {dineInTableMode === 'none' ? t('qrTablesDisabledTitle') : t('qrTablesEnabledTitle')}
              </div>
              <div className="qr-tables-desc">
                {dineInTableMode === 'none' ? t('qrTablesDisabledDesc') : t('qrTablesEnabledDesc')}
              </div>
            </div>

            <div className="qr-tables-actions">
              {dineInTableMode === 'none' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="qr-header-btn"
                  disabled={tableConfigSaving}
                  onClick={() => props.onSetDineInTableMode('required')}
                >
                  {t('qrTablesEnableBtn')}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="qr-header-btn"
                  disabled={tableConfigSaving}
                  onClick={() => props.onSetDineInTableMode('none')}
                >
                  {t('qrTablesDisableBtn')}
                </Button>
              )}
            </div>
          </div>
        )}

        <section
          id="setting-card-tables"
          className="restaurant-tables-card"
          style={{ display: hasDineIn && dineInTableMode === 'none' ? 'none' : undefined }}
        >
          <header className="restaurant-tables-card-header" data-slot="card-header">
            <h2 className="settings-card-title" id="i18n-setting-tables-title">{t('tabTables')}</h2>
            <div
              className="restaurant-tables-header"
              id="settings-table-tools"
              role="group"
              aria-labelledby="i18n-setting-tables-title"
              style={{ display: canReadTables ? undefined : 'none' }}
            >
              <div className="restaurant-tables-header-actions">
                <Button
                  type="button"
                  className="restaurant-tables-header-btn btn-outline"
                  onClick={() => actions.printAllTablesQrA4()}
                  id="i18n-table-print-all-btn"
                  style={{ display: canReadTables ? 'inline-flex' : 'none' }}
                >
                  <PrinterSvg />
                  <span>{t('tableQrPrintAllA4')}</span>
                </Button>
                <Button
                  type="button"
                  className="restaurant-tables-header-btn btn-outline"
                  onClick={() => actions.openBatchTableModal()}
                  id="i18n-table-batch-btn"
                  style={{ display: canWriteTables ? 'inline-flex' : 'none' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  <span>{t('tableBatchAddBtn')}</span>
                </Button>
                <Button
                  type="button"
                  className="restaurant-tables-header-btn btn-primary"
                  onClick={() => actions.openAddTableModal()}
                  id="i18n-table-add-btn"
                  style={{ display: canWriteTables ? 'inline-flex' : 'none' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>{t('tableAddBtn')}</span>
                </Button>
              </div>
            </div>
          </header>
          <div id="setting-tables-body" style={{ padding: '20px' }}>
            <div
              id="setting-tables-locked-body"
              style={{
                display: canReadTables ? 'none' : 'flex',
                background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                border: '1.5px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '14px 18px',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '240px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ede9fe', color: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #ddd6fe' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: '900', fontSize: '15px', color: '#1e1b4b' }} data-staff-i18n="staffFeatureClosed">{t('staffFeatureClosed')}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.4', marginTop: '2px' }} data-staff-i18n="staffFeatureClosedHelp">{t('staffFeatureClosedHelp')}</div>
                </div>
              </div>
              <Button
                type="button"
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '14px', fontWeight: '800', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: '48px' }}
                onClick={() => actions.openBlabContactModal('upgrade')}
                variant="default"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span data-staff-i18n="staffContact">{t('staffContact')}</span>
              </Button>
            </div>
            <div id="setting-tables-unlocked-body" style={{ display: canReadTables ? 'flex' : 'none', flexDirection: 'column', gap: '16px' }}>
              <div className="restaurant-tables-table-wrap">
                <table className="restaurant-tables-table" data-slot="table">
                  <thead>
                    <tr>
                      <th className="col-name" id="i18n-th-table-name">{t('tableName')}</th>
                      <th className="col-sort" id="i18n-th-table-sort">{t('tableSort')}</th>
                      <th className="col-status" id="i18n-th-table-status">{t('tableStatus')}</th>
                      <th className="col-actions" id="i18n-th-table-action">{t('tableAction')}</th>
                    </tr>
                  </thead>
                  <tbody id="tables-list-tbody">
                    <TableRows view={tablesView} />
                  </tbody>
                </table>
              </div>
              <div className="restaurant-tables-notice">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#64748b' }} aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span id="i18n-setting-tables-notice">{t('tableHistoryNotice')}</span>
              </div>
            </div>
          </div>
        </section>
      </section>

      {hasMenuSchedule && (
      <>
      <header className="qr-header">
        <div>
          <h2 className="qr-screen-title">{t('qrScreenTitle')}</h2>
          <p className="qr-screen-sub">{t('qrScreenSub')}</p>
        </div>
        <div className="qr-header-actions">
          <Button
            type="button"
            variant="outline"
            className="qr-header-btn"
            onClick={() => qrHost.printAllQrChannelsA4?.(channels)}
            disabled={loading || channels.filter(c => c.isActive).length === 0}
          >
            <PrinterSvg />
            {t('qrPrintAllBtn')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="qr-header-btn is-primary"
            onClick={openNewForm}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('qrAddBtn')}
          </Button>
        </div>
      </header>

      {editorOpen && (
        <section className="qr-editor-card" aria-label={draft.id ? t('qrFormEditTitle') : t('qrFormAddTitle')}>
          <div className="qr-editor-head">
            <h3 className="qr-editor-title">{draft.id ? t('qrFormEditTitle') : t('qrFormAddTitle')}</h3>
            <Button
              type="button"
              variant="outline"
              className="qr-editor-close-btn"
              onClick={closeForm}
              aria-label={t('close')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Button>
          </div>

          <div className="qr-editor-body">
            <label className="qr-field">
              <span className="qr-field-label">{t('qrFormLabelField')}</span>
              <Input
                type="text"
                className="qr-input"
                value={draft.label}
                placeholder={t('qrFormLabelPlaceholder')}
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(prev => ({ ...prev, label: value }));
                }}
              />
            </label>

            <div className="qr-field">
              <span className="qr-field-label">{t('qrFormOrderTypeLabel')}</span>
              <div className="qr-segmented" role="radiogroup" aria-label={t('qrFormOrderTypeLabel')}>
                {visibleOrderOptions.map(option => {
                  const selected = effectiveDiningPolicy === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`qr-seg-btn ${selected ? 'is-selected' : ''}`}
                      onClick={() => setDraft(prev => ({ ...prev, diningPolicy: option.value }))}
                    >
                      {t(option.labelKey)}
                    </button>
                  );
                })}
              </div>
              <p className="qr-field-help">{t(activeOrderHelpKey)}</p>
            </div>

            <div>
              <button
                type="button"
                className="qr-advanced-toggle"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen(v => !v)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {t('qrFormAdvancedToggle')}
              </button>

              {advancedOpen && (
                <div className="qr-advanced-grid">
                  <label className="qr-field">
                    <span className="qr-field-label">{t('qrFormShiftField')}</span>
                    <NativeSelect
                      className="qr-select"
                      value={draft.defaultShiftId}
                      onChange={event => {
                        const value = event.currentTarget.value;
                        setDraft(prev => ({ ...prev, defaultShiftId: value }));
                      }}
                    >
                      <option value="">{t('qrMenuModeAuto')}</option>
                      {shifts.map(s => (
                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                      ))}
                    </NativeSelect>
                  </label>

                  <label className="qr-field">
                    <span className="qr-field-label">{t('qrFormLocaleField')}</span>
                    <NativeSelect
                      className="qr-select"
                      value={draft.defaultLocale}
                      onChange={event => {
                        const value = event.currentTarget.value;
                        setDraft(prev => ({ ...prev, defaultLocale: value }));
                      }}
                    >
                      <option value="">{t('collectionQrLangAuto')}</option>
                      <option value="zh-TW">繁體中文</option>
                      <option value="en">English</option>
                      <option value="vi">Tiếng Việt</option>
                    </NativeSelect>
                  </label>

                  <label className="qr-field">
                    <span className="qr-field-label">{t('qrFormCodeField')}</span>
                    <Input
                      type="text"
                      className="qr-input"
                      value={draft.code}
                      placeholder={t('qrFormCodePlaceholder')}
                      onChange={event => {
                        const value = event.currentTarget.value;
                        setDraft(prev => ({ ...prev, code: value }));
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="qr-summary-banner" role="status">
              {summaryText}
            </div>

            {errorMsg && <p className="qr-error-text" role="alert">{errorMsg}</p>}

            <div className="qr-editor-footer">
              <div>
                {draft.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="qr-footer-delete-btn"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    {t('qrDeleteBtn')}
                  </Button>
                )}
              </div>
              <div className="qr-editor-footer-right">
                <Button type="button" variant="outline" className="qr-footer-btn" onClick={closeForm} disabled={saving}>
                  {t('qrFormCancelBtn')}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  className="qr-footer-btn is-submit"
                  onClick={handleSave}
                  disabled={saving || !draft.label.trim()}
                >
                  {saving ? t('saving') : t('qrFormSubmitBtn')}
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="qr-section" aria-labelledby="qr-list-section-heading">
        <div className="qr-section-head">
          <h3 id="qr-list-section-heading" className="qr-section-title">{t('qrListSectionTitle')}</h3>
          <span className="qr-section-count">{t('qrListCountUnit', { count: channels.length })}</span>
        </div>

        <div className="qr-list-card">
          {loading ? (
            <p className="qr-empty-state" role="status">{t('menuScheduleLoading')}</p>
          ) : channels.length === 0 ? (
            <p className="qr-empty-state">{t('qrListEmpty')}</p>
          ) : (
            channels.map(ch => {
              const matchedShift = ch.defaultShiftId
                ? shifts.find(s => String(s.id) === String(ch.defaultShiftId))
                : null;
              const menuText = matchedShift ? matchedShift.name : t('qrMenuModeAuto');
              const localeText = ch.defaultLocale && LOCALE_LABELS[ch.defaultLocale] ? LOCALE_LABELS[ch.defaultLocale] : '';
              const metaLine = [orderTypeLabel(ch.diningPolicy), menuText, localeText].filter(Boolean).join(' · ');

              return (
                <div key={ch.id} className={`qr-channel-row ${!ch.isActive ? 'is-disabled' : ''}`}>
                  <div className="qr-row-main">
                    <div className="qr-row-title-line">
                      <span className="qr-row-name">{ch.label}</span>
                      {!ch.isActive && <span className="qr-row-disabled-pill">{t('qrStatusDisabled')}</span>}
                    </div>
                    <div className="qr-row-meta">{metaLine}</div>
                  </div>

                  <div className="qr-row-actions">
                    <div className="qr-row-stats">
                      <span className="qr-row-stats-num">{ch.orders30d ?? 0} {t('qrOrderUnit')}</span>
                      <span className="qr-row-stats-sub">{t('qrLast30Days')}</span>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="qr-row-link-btn"
                      onClick={() => qrHost.openChannelQrModal?.(ch)}
                    >
                      <QrCodeSvg size={15} />
                      {t('qrActionLinkBtn')}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="qr-row-edit-btn"
                      aria-label={`${t('qrActionEditAria')} ${ch.label}`}
                      onClick={() => openEditForm(ch)}
                    >
                      <EditSvg />
                    </Button>

                    <Switch
                      className="qr-switch"
                      checked={ch.isActive !== false}
                      disabled={busyId === ch.id}
                      aria-label={`${t('qrToggleActiveAria')} ${ch.label}`}
                      onCheckedChange={checked => handleToggle(ch, checked)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      </>
      )}
    </Card>
  );
}
