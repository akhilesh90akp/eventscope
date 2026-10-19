/**
 * FunctionDates — the date part of a function (main event or sub-event) on
 * the New / Edit event forms.
 *
 * One "Date" normally. With "Runs over multiple days" on, it becomes Start
 * date + End date and shows how many days that is (e.g. "2 days"). Saves as
 * { date, endDate } on the function — see helpers.functionDays(). Turning the
 * switch off clears endDate. Spans both columns of the form grid.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { Calendar } from 'lucide-react';
import Input from './Input';
import Toggle from './Toggle';
import { functionDays, functionDatesProblem } from '../utils/helpers';

// ============================================================
// FunctionDates — MAIN COMPONENT
// ============================================================

/**
 * @param {object}   fn        the function being edited: { date, endDate, multiDay }
 * @param {function} onChange  (field, value) → updates the function
 * @param {boolean}  required  date is required (main event)
 * @param {string}   error     set by the form's validation; the message shown is re-checked live
 */
export default function FunctionDates({ fn, onChange, required = false, error }) {
  const days = fn.multiDay ? functionDays(fn) : 1;
  // once the form has flagged a problem, keep the message live: it updates or clears as the dates are fixed
  const shownError = error ? functionDatesProblem(fn, required) : '';

  const setMulti = (on) => {
    onChange('multiDay', on);
    if (!on) onChange('endDate', '');
  };

  return (
    <div className="md:col-span-2 space-y-3">
      <Toggle
        label="Runs over multiple days"
        description={fn.multiDay ? 'Items start at this many days on the quote; you can change any item.' : undefined}
        checked={!!fn.multiDay}
        onChange={e => setMulti(e.target.checked)}
      />
      {fn.multiDay ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Start date" type="date" required={required} icon={Calendar}
            value={fn.date} onChange={e => onChange('date', e.target.value)} />
          <Input label="End date" type="date" required icon={Calendar} min={fn.date || undefined}
            value={fn.endDate || ''} onChange={e => onChange('endDate', e.target.value)} />
        </div>
      ) : (
        <Input label="Date" type="date" required={required} icon={Calendar}
          value={fn.date} onChange={e => onChange('date', e.target.value)} />
      )}
      {fn.multiDay && days > 1 && !shownError && (
        <span className="inline-block text-xs font-semibold bg-violet-100 text-violet-700 rounded-full px-2.5 py-0.5" data-testid="function-days">
          {days} days
        </span>
      )}
      {shownError && <p className="text-xs text-red-500">{shownError}</p>}
    </div>
  );
}
