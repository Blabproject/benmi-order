import { Button } from '@shared/ui/button';
import { Card } from '@shared/ui/card';
import { Input } from '@shared/ui/input';
import { ClockIcon, CloseIcon, PlusIcon } from '@shared/ui/PosIcons';
import { orderedDays, type Translate } from './contracts';
import { formatCoverageReasons, shiftBands, type createShiftEditor } from './shift-editor';

interface ShiftEditorProps {
  editor: ReturnType<typeof createShiftEditor>;
  dayNames: string[];
  t: Translate;
  assignmentBusy: boolean;
  openHours: () => void;
}

export function ShiftEditor({ editor, dayNames, t, assignmentBusy, openHours }: ShiftEditorProps) {
  const { draft, hours, saving, error, serverConflicts } = editor.state;
  const { coverage, timeInvalid } = editor.validation();
  const reasons = formatCoverageReasons(coverage.length ? coverage : serverConflicts, hours, dayNames, t);
  const message = timeInvalid ? t('shiftInvalidTime') : reasons.length ? t('shiftCoverageError') : error;
  return (
    <Card className="ms-shift-panel ps-w-full ps-order-3 ps-mt-1 ps-bg-slate-50" id="menu-shifts-editor" aria-busy={saving}>
      <h3 className="ms-shift-panel-title">{t('menuShiftsTitle')}</h3>
      <p className="ms-shift-panel-sub">{t('shiftCoverageHint')}</p>
      <div className="ps-mb-4 ps-flex ps-flex-wrap ps-gap-2">
        {orderedDays.map(day => {
          const ranges = (hours[day] ?? []).map(window => `${window.start}–${window.end}`).join(', ');
          return <span key={day} className={`ms-store-hour-chip ${ranges ? '' : 'is-closed'}`}>
            <strong>{dayNames[day]}</strong><span>{ranges || t('closedDay')}</span>
          </span>;
        })}
      </div>
      <div id="menu-shifts-error" className="ms-shift-error" tabIndex={-1} role="status">
        {message && <div className="ps-min-w-0 ps-flex-1">
          <strong>{message}</strong>
          {reasons.length > 0 && <ul className="ms-shift-error-list">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        </div>}
        {reasons.length > 0 && <Button variant="outline" className="ms-shift-error-hours-btn" onClick={openHours} disabled={saving || assignmentBusy}>
          <ClockIcon size={16} />{t('shiftCoverageEditHoursBtn')}
        </Button>}
      </div>
      <fieldset className="ps-m-0 ps-min-w-0 ps-border-0 ps-p-0" disabled={saving || assignmentBusy}>
        <div id="menu-shifts-cards" className="ps-mb-4 ps-flex ps-flex-col ps-gap-3">
          {!draft.length && <p className="ms-shift-empty">{t('shiftEmptyHint')}</p>}
          {draft.map((shift, index) => {
            const bands = shiftBands(shift);
            return <Card className="ms-shift-card ps-flex ps-flex-col ps-gap-3" key={shift.id}>
              <div className="ps-flex ps-flex-wrap ps-items-center ps-gap-2">
                <Input type="text" className="ms-shift-name-input" aria-label={t('shiftNameLabel')} placeholder={t('shiftNameLabel')}
                  value={shift.name} onChange={event => editor.rename(index, event.currentTarget.value)}
                  onBlur={event => editor.rename(index, event.currentTarget.value, true)}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                <Button variant="outline" className="ms-shift-delete-btn" onClick={() => editor.remove(index)}>{t('shiftDeleteBtn')}</Button>
              </div>
              {bands.map((band, bandIndex) => {
                const invalid = [...coverage, ...serverConflicts].some(conflict =>
                  conflict.shiftId === shift.id && conflict.startTime === band.startTime && conflict.endTime === band.endTime);
                return <div className={`ms-shift-band ps-flex ps-flex-col ps-gap-2 ${invalid ? 'is-invalid' : ''}`} key={bandIndex}>
                  <div className="ps-flex ps-flex-wrap ps-items-center ps-gap-2">
                    {orderedDays.map(day => <Button key={day} variant="outline" className="ms-day-btn"
                      aria-pressed={band.days.has(day)} onClick={() => editor.toggleDay(index, band.key, day)}>{dayNames[day]}</Button>)}
                  </div>
                  <div className="ps-flex ps-flex-wrap ps-items-center ps-gap-2">
                    <Input type="time" className="ms-time-input" aria-invalid={invalid} aria-describedby="menu-shifts-error"
                      aria-label={t('startTime')} value={band.startTime}
                      onChange={event => editor.changeTime(index, band.key, 'startTime', event.currentTarget.value)} />
                    <span className="ms-time-sep" aria-hidden="true">–</span>
                    <Input type="time" className="ms-time-input" aria-invalid={invalid} aria-describedby="menu-shifts-error"
                      aria-label={t('endTime')} value={band.endTime}
                      onChange={event => editor.changeTime(index, band.key, 'endTime', event.currentTarget.value)} />
                    {bands.length > 1 && <Button variant="outline" className="ms-band-remove-btn" aria-label={t('shiftDeleteBtn')}
                      onClick={() => editor.removeBand(index, band.key)}><CloseIcon size={16} /></Button>}
                  </div>
                </div>;
              })}
              <div className="ps-flex ps-justify-end">
                <Button variant="outline" className="ms-shift-add-band-btn" onClick={() => editor.addBand(index)}>
                  <PlusIcon size={16} />{t('shiftAddWeekdayWindow').replace(/^\+\s*/, '')}
                </Button>
              </div>
            </Card>;
          })}
        </div>
        <div className="ps-flex ps-flex-wrap ps-items-center ps-justify-between ps-gap-3">
          <Button variant="outline" className="ms-hours-btn ms-shift-add-btn" onClick={editor.add}>
            <PlusIcon size={16} />{t('btnAddNamedShift').replace(/^\+\s*/, '')}
          </Button>
          <div className="ms-shift-footer-right ps-ml-auto ps-flex ps-flex-wrap ps-gap-2">
            <Button variant="outline" className="ms-hours-btn" onClick={editor.close}>{t('shiftEditorClose')}</Button>
            <Button variant="default" id="btn-save-menu-shifts" className="ms-save-btn" onClick={editor.save} disabled={!editor.dirty()}>
              {t(saving ? 'saving' : 'btnSaveMenuShifts')}
            </Button>
          </div>
        </div>
        {editor.dirty() && <p className="ms-shift-lock-hint" role="status">{t('shiftDirtyLockHint')}</p>}
      </fieldset>
    </Card>
  );
}
