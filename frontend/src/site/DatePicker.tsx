import { useMemo, useState } from 'react';
import { isNightDisabled, rangeHasUnavailable } from './booking';

interface DatePickerProps {
  checkIn: string;
  checkOut: string;
  unavailable: ReadonlySet<string>;
  minNights?: number;
  minDateIso?: string;
  onChange: (checkIn: string, checkOut: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthCells(year: number, monthIndex: number): (string | null)[] {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const startDow = (first.getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push(`${year}-${mm}-${dd}`);
  }
  return cells;
}

export function DatePicker({
  checkIn,
  checkOut,
  unavailable,
  minNights = 1,
  minDateIso,
  onChange,
}: DatePickerProps) {
  const [defaultTodayIso] = useState(() => new Date().toISOString().slice(0, 10));
  const todayIso = minDateIso ?? defaultTodayIso;
  const [cursor, setCursor] = useState(() => {
    const base = checkIn || todayIso;
    const [y, m] = base.split('-').map(Number);
    return { year: y || 2026, month: (m || 1) - 1 };
  });

  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const monthLabel = useMemo(() => {
    const dt = new Date(Date.UTC(cursor.year, cursor.month, 1));
    return dt.toLocaleDateString('en-KE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }, [cursor.year, cursor.month]);

  function prevMonth() {
    setCursor((c) =>
      c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 },
    );
  }

  function nextMonth() {
    setCursor((c) =>
      c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 },
    );
  }

  function handleDayClick(iso: string) {
    if (!checkIn || (checkIn && checkOut)) {
      if (isNightDisabled(iso, unavailable, todayIso)) return;
      onChange(iso, '');
      return;
    }

    if (iso <= checkIn) {
      if (isNightDisabled(iso, unavailable, todayIso)) return;
      onChange(iso, '');
      return;
    }

    const nights = Math.round(
      (new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) /
        86_400_000,
    );
    if (nights < minNights) return;
    if (rangeHasUnavailable(checkIn, iso, unavailable)) return;
    onChange(checkIn, iso);
  }

  return (
    <div className="site-datepicker" aria-label="Select stay dates">
      <div className="site-datepicker__header">
        <button
          type="button"
          className="site-datepicker__nav"
          onClick={prevMonth}
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="site-datepicker__title">{monthLabel}</div>
        <button
          type="button"
          className="site-datepicker__nav"
          onClick={nextMonth}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="site-datepicker__weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="site-datepicker__weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="site-datepicker__grid">
        {cells.map((iso, idx) => {
          if (!iso) {
            return <div key={`empty-${idx}`} className="site-datepicker__empty" />;
          }
          const isNightBlocked = isNightDisabled(iso, unavailable, todayIso);
          // When check-in is already chosen and check-out isn't, a date can serve as check-out
          // if the range [checkIn, iso) has no unavailable nights, even if `iso` itself is booked that night.
          const canBeCheckout =
            Boolean(checkIn && !checkOut && iso > checkIn) &&
            !rangeHasUnavailable(checkIn, iso, unavailable);
          const disabled = isNightBlocked && !canBeCheckout;
          const isStart = iso === checkIn;
          const isEnd = iso === checkOut;
          const inRange = Boolean(checkIn && checkOut && iso > checkIn && iso < checkOut);
          const dayNum = Number(iso.slice(8, 10));

          const classes = [
            'site-datepicker__day',
            disabled ? 'is-disabled' : '',
            unavailable.has(iso) ? 'is-unavailable' : '',
            isStart ? 'is-start' : '',
            isEnd ? 'is-end' : '',
            inRange ? 'is-in-range' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              className={classes}
              data-date={iso}
              onClick={() => handleDayClick(iso)}
            >
              <span>{dayNum}</span>
            </button>
          );
        })}
      </div>

      {checkIn && (
        <div className="site-datepicker__summary">
          <span>
            Check-in: <strong>{checkIn}</strong>
          </span>
          <span>
            Check-out: <strong>{checkOut || 'Select date'}</strong>
          </span>
          <button
            type="button"
            className="site-datepicker__clear"
            onClick={() => onChange('', '')}
          >
            Clear dates
          </button>
        </div>
      )}
    </div>
  );
}
