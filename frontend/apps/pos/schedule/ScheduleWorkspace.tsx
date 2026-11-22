import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@shared/ui/button';
import { Card } from '@shared/ui/card';
import { ChoiceInput } from '@shared/ui/choice-input';
import { ChevronRightIcon } from '@shared/ui/PosIcons';
import { categoryOn, itemOn } from './assignments';
import { categoryId, categoryName, itemId, type MenuCategory, type Shift, type Translate } from './contracts';
import { QrChannelsPanel, type QrChannelsPanelProps } from './QrChannelsPanel';
import type { createShiftEditor } from './shift-editor';
import { ShiftEditor } from './ShiftEditor';

interface ScheduleWorkspaceProps {
  categories: MenuCategory[];
  shifts: Shift[];
  language: string;
  dayNames: string[];
  t: Translate;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  editor: ReturnType<typeof createShiftEditor>;
  toggleCategory: (id: string, shift: string, checked: boolean) => void;
  toggleItem: (id: string, item: string, shift: string, checked: boolean) => void;
  setOutside: (hidden: boolean) => void;
  save: () => void;
  back: () => void;
  openHours: () => void;
  activeScreen?: 'schedule' | 'qr';
  onSelectScreen?: (screen: 'schedule' | 'qr', prefillShiftId?: string) => void;
  qrPanelProps?: Omit<QrChannelsPanelProps, 't' | 'shifts'>;
}

const outsideOptions = [
  ['hide', 'menuScheduleOutsideHide'],
  ['show', 'menuScheduleOutsideShow']
] as const;

function shiftSummary(shift: Shift, language: string) {
  const vietnamese = language === 'vi';
  const dayNames = vietnamese ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] : ['日', '一', '二', '三', '四', '五', '六'];
  const ranges = new Map<string, Set<number>>();
  for (const window of shift.windows ?? []) {
    if (window.isActive === false) continue;
    const time = `${window.startTime}–${window.endTime}`;
    if (!ranges.has(time)) ranges.set(time, new Set());
    ranges.get(time)?.add(Number(window.dayOfWeek) || 7);
  }
  return [...ranges].map(([time, days]) => {
    const labels: string[] = [];
    const ordered = [...days].sort((left, right) => left - right);
    for (let index = 0; index < ordered.length; index++) {
      const start = ordered[index]!;
      let end = index;
      while (ordered[end + 1] === ordered[end]! + 1) end++;
      if (end - index >= 2) {
        labels.push(`${dayNames[start % 7]}–${dayNames[ordered[end]! % 7]}`);
        index = end;
      } else {
        labels.push(dayNames[start % 7] ?? '');
      }
    }
    return { time, label: `${labels.join(vietnamese ? ', ' : '、')} · ${time}` };
  });
}

function MatrixCheckbox({ label, checked, mixed = false, disabled, cell, change }: {
  label: string; checked: boolean; mixed?: boolean; disabled: boolean; cell: string; change: (checked: boolean) => void;
}) {
  return <label className="ms-cell-toggle ps-relative ps-inline-flex ps-h-12 ps-w-12 ps-items-center ps-justify-center ps-align-middle">
    <ChoiceInput type="checkbox" aria-label={label} aria-checked={mixed ? 'mixed' : undefined} data-ms-focus={cell}
      checked={checked} disabled={disabled} ref={input => { if (input) input.indeterminate = mixed; }}
      onChange={event => change(event.currentTarget.checked)} />
    <span className="ms-check-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={mixed ? 'M5 12h14' : 'm5 12 4 4L19 6'} />
      </svg>
    </span>
  </label>;
}

function ScheduleHelp({ t }: { t: Translate }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <div ref={container} className="ps-inline-flex">
    <Button ref={trigger} className="ms-help-btn" aria-label={t('menuSchedulePageSub')} data-ms-focus="help" aria-expanded={open}
      aria-controls={open ? 'ms-title-help-popover' : undefined} onClick={() => setOpen(value => !value)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M12 11v5m0-8h.01" />
      </svg>
    </Button>
    {open && <Card className="ms-help-popover" id="ms-title-help-popover" role="note">{t('menuSchedulePageSub')}</Card>}
  </div>;
}

export function ScheduleWorkspace(props: ScheduleWorkspaceProps) {
  const { categories, shifts, editor, t, dirty, loading, saving, language } = props;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const assignmentsLocked = editor.dirty() || editor.state.opening || editor.state.saving;
  const matrixLocked = assignmentsLocked || saving;
  const hiddenCount = categories.filter(category => category.hideWhenUnavailable).length;
  const outsideMixed = hiddenCount > 0 && hiddenCount < categories.length;
  const outsideValue = !categories.length || outsideMixed ? null : hiddenCount > 0 ? 'hide' : 'show';
  const outsideDisabled = matrixLocked || loading || !shifts.length || !categories.length;
  const total = categories.reduce((count, category) => count + (category.items?.length ?? 0), 0);

  function expand(id: string) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeScreen = props.activeScreen ?? 'schedule';

  return <div className="ms-shell ps-min-h-0 ps-flex-1 ps-overflow-auto">
    {props.onSelectScreen && (
      <div className="ms-screen-tabs-wrap">
        <div className="ms-screen-tabs" role="tablist" aria-label={t('menuSchedulePageTitle')}>
          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === 'schedule'}
            className={`ms-screen-tab ${activeScreen === 'schedule' ? 'is-active' : ''}`}
            onClick={() => props.onSelectScreen?.('schedule')}
          >
            {t('scheduleScreenTabMenu')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === 'qr'}
            className={`ms-screen-tab ${activeScreen === 'qr' ? 'is-active' : ''}`}
            onClick={() => props.onSelectScreen?.('qr')}
          >
            {t('scheduleScreenTabQr')}
          </button>
        </div>
      </div>
    )}
    {activeScreen === 'qr' && props.qrPanelProps ? (
      <QrChannelsPanel t={t} shifts={shifts} {...props.qrPanelProps} />
    ) : (
    <Card className="ms-panel" flush>
      <section aria-labelledby="ms-title" aria-busy={saving}>
        <header className="ps-mb-4">
          <div className="ps-mb-2">
            <Button variant="outline" className="ms-back-btn" onClick={props.back} disabled={saving || editor.state.saving}>
              <ChevronRightIcon size={18} />{t('menuScheduleBackBtn')}
            </Button>
          </div>
          <div className="ms-title-row ps-flex ps-flex-wrap ps-items-center ps-gap-2">
            <div className="ms-title-group ps-relative ps-mr-auto ps-flex ps-min-w-0 ps-items-center">
              <h2 className="ms-title" id="ms-title">{t('menuSchedulePageTitle')}</h2>
              <ScheduleHelp t={t} />
            </div>
            <div className="ms-actions ps-flex ps-flex-wrap ps-items-center ps-gap-2" inert={assignmentsLocked}>
              <div className="ms-actions-right ps-flex ps-flex-wrap ps-items-center ps-gap-2">
                <span className={`ms-status ${saving ? 'is-saving' : dirty ? 'is-dirty' : 'is-saved'}`} role="status">
                  <span className="ms-status-dot" aria-hidden="true" />{t(saving ? 'saving' : dirty ? 'menuScheduleUnsavedPill' : 'menuScheduleSavedPill')}
                </span>
                <Button variant="default" id="btn-save-menu-schedule" className="ms-save-btn" onClick={props.save}
                  disabled={matrixLocked || loading || !dirty || !shifts.length}>{t('menuScheduleSaveBtn')}</Button>
              </div>
            </div>
          </div>
        </header>
        {loading ? <p className="ms-empty" role="status">{t('menuScheduleLoading')}</p>
          : !shifts.length ? <p className="ms-empty">{t('menuScheduleEmptyShifts')}</p>
            : <div className="ms-table-scroll" tabIndex={matrixLocked ? -1 : 0} role="region" aria-label={t('menuScheduleTableLabel')} inert={matrixLocked}>
              <table className="ms-matrix" style={{ '--ms-columns': shifts.length } as CSSProperties}>
                <caption className="ps-sr-only">{t('menuScheduleTableLabel')}</caption>
                <thead><tr>
                  <th scope="col" className="ms-name-heading">{t('menuScheduleNameColumn')}</th>
                  {shifts.map(shift => {
                    const count = categories.reduce((sum, category) => sum + (category.items ?? []).filter(item => itemOn(category, item, String(shift.id))).length, 0);
                    const times = shiftSummary(shift, language);
                    return <th scope="col" className={`ms-shift-heading ${shift.isActive === false ? 'is-inactive' : ''}`} key={shift.id}>
                      <div className="ps-flex ps-h-full ps-flex-col ps-justify-between ps-gap-2">
                        <div className="ps-flex ps-flex-col ps-gap-1">
                          <span className="ms-shift-name">{shift.name}</span>
                          {shift.isActive === false && <span className="ms-inactive">{t('menuScheduleInactive')}</span>}
                          <span className="ms-shift-times">{times.length
                            ? times.map(time => <span className="ps-block" key={time.time}>{time.label}</span>)
                            : t('menuScheduleNoWindows')}</span>
                        </div>
                        <span className="ms-shift-count">{t('menuScheduleAvailableCount', { count, total })}</span>
                        <Button variant="outline" className="ms-shift-qr-btn" onClick={() => {
                          if (props.onSelectScreen) props.onSelectScreen('qr', String(shift.id));
                          else (window as unknown as { openCollectionQrModal?: (shiftId: string) => void }).openCollectionQrModal?.(String(shift.id));
                        }}
                          aria-label={`${t('menuScheduleQrBtn')} ${shift.name}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                          {t('menuScheduleQrBtn')}
                        </Button>
                      </div>
                    </th>;
                  })}
                </tr></thead>
                <tbody>{categories.length ? categories.map(category => {
                  const id = categoryId(category), name = categoryName(category), items = category.items ?? [];
                  const isExpanded = expanded.has(id);
                  return <Fragment key={id}>
                    <tr className={`ms-category-row ${isExpanded ? 'is-expanded' : ''}`}>
                      <th scope="row"><Button className="ms-expand-btn" aria-expanded={isExpanded} disabled={matrixLocked || !items.length}
                        data-ms-focus={`expand:${id}`} onClick={() => expand(id)}>
                        <ChevronRightIcon size={18} />
                        <span className="ms-row-name">{name}</span>
                        <span className="ms-item-count">{items.length} {t('menuScheduleItemCountUnit')}</span>
                      </Button></th>
                      {shifts.map(shift => {
                        const shiftId = String(shift.id);
                        const count = items.filter(item => itemOn(category, item, shiftId)).length;
                        const checked = items.length ? count === items.length : categoryOn(category, shiftId);
                        return <td key={shift.id}><MatrixCheckbox label={t('menuScheduleCategoryCell', { name, shift: shift.name })}
                          cell={`cat:${id}:${shiftId}`} checked={checked} mixed={count > 0 && count < items.length} disabled={matrixLocked}
                          change={value => props.toggleCategory(id, shiftId, value)} /></td>;
                      })}
                    </tr>
                    {isExpanded && items.map((item, index) => <tr className="ms-item-row" key={itemId(item) || index}>
                      <th scope="row"><span className="ms-item-name">{item.name}</span></th>
                      {shifts.map(shift => {
                        const shiftId = String(shift.id), childId = itemId(item);
                        return <td key={shift.id}><MatrixCheckbox label={t('menuScheduleItemCell', { name: item.name, shift: shift.name })}
                          cell={`item:${id}:${childId}:${shiftId}`} checked={itemOn(category, item, shiftId)} disabled={matrixLocked}
                          change={value => props.toggleItem(id, childId, shiftId, value)} /></td>;
                      })}
                    </tr>)}
                  </Fragment>;
                }) : <tr><td className="ms-empty" colSpan={shifts.length + 1}>{t('menuScheduleEmptyCats')}</td></tr>}</tbody>
              </table>
            </div>}
        <Card className="ms-outside ps-mt-5 ps-flex ps-flex-wrap ps-items-center ps-justify-between ps-gap-4" inert={assignmentsLocked}>
          <div>
            <h3 id="ms-outside-title">{t('menuScheduleOutsideTitle')}</h3>
            <p id="ms-outside-description">{t('menuScheduleOutsideSub')}</p>
            {outsideMixed && <p className="ms-policy-mixed" id="ms-outside-mixed">{t('menuScheduleOutsideMixed')}</p>}
          </div>
          <div
            className="ms-outside-options ps-inline-grid ps-max-w-full ps-grid-cols-[auto_minmax(0,1fr)] ps-gap-1 ps-rounded-xl ps-border ps-border-solid ps-bg-white ps-p-1"
            role="radiogroup"
            aria-labelledby="ms-outside-title"
            aria-describedby={outsideMixed ? 'ms-outside-description ms-outside-mixed' : 'ms-outside-description'}
          >
            {outsideOptions.map(([value, label]) => (
              <label className="ms-outside-option ps-relative ps-grid ps-min-w-0" key={value}>
                <ChoiceInput
                  type="radio"
                  name="menu-schedule-outside"
                  value={value}
                  className="ps-absolute ps-inset-0 ps-m-0 ps-h-full ps-w-full ps-opacity-0"
                  checked={outsideValue === value}
                  disabled={outsideDisabled}
                  onChange={() => props.setOutside(value === 'hide')}
                />
                <span className="ps-flex ps-min-h-12 ps-min-w-12 ps-items-center ps-justify-center ps-rounded-lg ps-px-4 ps-py-2 ps-text-center ps-font-bold">
                  {t(label)}
                </span>
              </label>
            ))}
          </div>
        </Card>
        {!loading && (
          <ShiftEditor
            editor={editor}
            dayNames={props.dayNames}
            t={t}
            assignmentBusy={loading || saving || dirty}
            assignmentDirty={dirty}
            openHours={props.openHours}
          />
        )}
      </section>
    </Card>
    )}
  </div>;
}
