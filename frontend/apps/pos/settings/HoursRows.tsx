import { Button } from '@shared/ui/button';
import { Card } from '@shared/ui/card';
import { ChoiceInput } from '@shared/ui/choice-input';
import { Input } from '@shared/ui/input';
import { CloseIcon } from '@shared/ui/PosIcons';
import { settingsActions as actions } from './settings-actions';

export type WeeklyHours = Record<number, { start: string; end: string }[]>;

export function HoursRows({ days, hours }: { days: string[]; hours: WeeklyHours }) {
  const t = actions.t;
  return (
    <>
      {[1, 2, 3, 4, 5, 6, 0].map(day => {
        const shifts = hours[day] ?? [];
        const isOpen = shifts.length > 0;
        return (
          <Card flush key={day} className={`hours-day-card ${isOpen ? 'is-open' : 'is-closed'}`}>
            <div className="hours-day-header">
              <label className="hours-day-toggle">
                <ChoiceInput type="checkbox" className="hours-day-checkbox" checked={isOpen}
                  onChange={event => actions.toggleDayStatus(day, event.currentTarget.checked)} />
                <span className="hours-day-name">{days[day]}</span>
              </label>
              {isOpen ? (
                <Button className="hours-add-shift-btn" variant="outline" onClick={() => actions.addShift(day)}>
                  {t('btnAddShift')}
                </Button>
              ) : <span className="hours-closed-badge">{t('closedDay')}</span>}
            </div>
            {isOpen && (
              <div id={`shifts-box-${day}`}>
                {shifts.map((shift, index) => (
                  <div key={index} className="hours-shift-row">
                    <Input type="time" className="hours-time-input" aria-label={`${days[day]} ${t('startTime')}`}
                      id={`sh-start-${day}-${index}`} defaultValue={shift.start} />
                    <span className="hours-shift-sep" aria-hidden="true">–</span>
                    <Input type="time" className="hours-time-input" aria-label={`${days[day]} ${t('endTime')}`}
                      id={`sh-end-${day}-${index}`} defaultValue={shift.end} />
                    <Button className="hours-remove-shift-btn" aria-label={t('shiftDeleteBtn')}
                      onClick={() => actions.removeShift(day, index)}>
                      <CloseIcon size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}
