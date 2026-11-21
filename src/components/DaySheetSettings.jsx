/**
 * DaySheetSettings — Settings → Day sheets (owners). Saves each change at once
 * (not through the Settings Save button):
 *   - Use Day sheets (off by default) + the date they start from. Events whose
 *     first day is before that date keep their typed Job Log values.
 *   - Which Job Log column staff pay goes to, and the "every day" cost rows.
 *   - When daily-wage staff are paid (company default), default overtime.
 * Who may fill Day sheets is ticked on the Team tab.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { X } from 'lucide-react';
import Button from './Button';
import { useApp } from '../context/AppContext';
import { useConfirm } from './useConfirm';
import { SwitchRow, DateField, TextField, Select } from './PhoneUI';
import { Pills, PanelCard, DefaultOt } from './StaffUI';
import { isoDate } from '../utils/calendar';
import { daySheetColumnIds } from '../utils/daySheetView';
import { formatDateWithDay } from '../utils/helpers';

const selectCls = 'min-h-[44px] rounded-xl border border-bb-border bg-bb-input px-3 text-[15px] cursor-pointer';

// ============================================================
// DaySheetSettings — MAIN COMPONENT
// ============================================================
export default function DaySheetSettings() {
  const { settings, updateSettings, daySheetCfg: cfg, allJobLogColumns, daySheets, showToast, isOwner } = useApp();
  const confirm = useConfirm();
  const [newRow, setNewRow] = useState({ label: '', column: 'other' });
  const cols = allJobLogColumns.filter(c => !c.hidden && c.type !== 'income' && c.type !== 'text');
  const label = (id) => allJobLogColumns.find(c => c.id === id)?.label || id;
  const save = (patch) => updateSettings({ daySheets: { ...(settings.daySheets || {}), ...patch } });

  if (!isOwner) return <p className="text-sm text-bb-muted">Only the account owner can change Day sheets.</p>;

  const toggle = async (on) => {
    if (on) {
      const start = cfg.startDate || isoDate(new Date());
      const ok = await confirm({
        title: 'Switch on Day sheets?',
        message: `From ${formatDateWithDay(start)}, each day’s staff pay and shared costs (food, fuel…) are split equally across that day’s events and shown in their Job Log. Events before that keep what you typed.`,
        note: 'Your typed Job Log values are never overwritten — switching off brings them all back.',
        confirmLabel: 'Switch on', tone: 'primary',
      });
      if (!ok) return;
      if ((await save({ enabled: true, startDate: start })).success) showToast('Day sheets are on — add your staff in Staff & wages');
    } else {
      const ok = await confirm({ title: 'Switch off Day sheets?', message: 'Day sheets and Staff & wages are hidden and the Job Log shows your typed values again. Nothing is deleted — switch on again any time.', confirmLabel: 'Switch off', tone: 'warning' });
      if (ok && (await save({ enabled: false })).success) showToast('Day sheets are off');
    }
  };

  const addRow = () => {
    const l = newRow.label.trim();
    if (!l) return;
    save({ costRows: [...cfg.costRows, { label: l, column: newRow.column }] });
    setNewRow({ label: '', column: newRow.column });
  };
  const mapped = daySheetColumnIds(cfg, daySheets);

  return (
    <div className="space-y-4" data-testid="daysheet-settings">
      <div className="bg-white border border-bb-border rounded-2xl px-4">
        <SwitchRow title="Use Day sheets" sub="Daily staff, food and fuel — split across the day’s events" checked={cfg.enabled} onChange={toggle} testId="ds-enable" />
      </div>

      {cfg.enabled && <>
        <div className="bg-white border border-bb-border rounded-2xl p-4 space-y-2">
          <DateField label="Start from" value={cfg.startDate} id="ds-start" testId="ds-start"
            onChange={async (v) => { if (v && (await confirm({ title: 'Change the start date?', message: `Events starting on or after ${formatDateWithDay(v)} take their staff and shared costs from Day sheets; earlier ones go back to typed values.`, confirmLabel: 'Change', tone: 'primary' }))) save({ startDate: v }); }} />
          <p className="text-[12.5px] text-gray-600">Events whose first day is before this keep the costs you typed. Staff pay is counted from this date.</p>
        </div>

        <PanelCard title="Day sheet costs go to" testId="ds-mapping">
          <div className="px-4 lg:px-5 py-2 divide-y divide-bb-border">
            <label className="flex items-center gap-3 py-2.5">
              <span className="flex-1 text-[15px]">Staff & overtime</span>
              <Select value={cfg.staffColumn} onChange={e => save({ staffColumn: e.target.value })} className={selectCls} data-testid="ds-staff-col">
                {cols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </label>
            {cfg.costRows.map((r, i) => (
              <div key={`${r.label}-${i}`} className="flex items-center gap-3 py-2.5" data-testid={`ds-row-${i}`}>
                <span className="flex-1 text-[15px]">{r.label} <span className="text-[12px] text-gray-500">· every day</span></span>
                <Select value={r.column} onChange={e => save({ costRows: cfg.costRows.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)) })} className={selectCls}>
                  {cols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
                <button onClick={() => save({ costRows: cfg.costRows.filter((_, j) => j !== i) })} aria-label={`Remove ${r.label}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-bb-muted hover:bg-gray-100 cursor-pointer"><X size={16} /></button>
              </div>
            ))}
            <div className="flex items-end gap-2 py-3 flex-wrap">
              <TextField className="flex-1 min-w-[160px]" label="Add an every-day cost" placeholder="e.g. Food, Truck fuel" value={newRow.label} onChange={e => setNewRow(n => ({ ...n, label: e.target.value }))} data-testid="ds-new-row" />
              <Select value={newRow.column} onChange={e => setNewRow(n => ({ ...n, column: e.target.value }))} className={`${selectCls} min-h-[48px]`} aria-label="Job Log column">
                {cols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
              <Button variant="secondary" onClick={addRow} disabled={!newRow.label.trim()} className="min-h-[48px]" data-testid="ds-add-row">Add</Button>
            </div>
            <p className="py-3 text-[12.5px] text-gray-600">
              Each day’s total is split equally across that day’s events. On events using Day sheets these columns can’t be typed, so nothing is counted twice:
              {' '}<b>{mapped.map(label).join(', ')}</b>.
            </p>
          </div>
        </PanelCard>

        <div className="bg-white border border-bb-border rounded-2xl p-4 space-y-3">
          <div><b className="block text-[15.5px]">Daily-wage staff are paid</b><span className="block text-[13px] text-gray-600">The usual way; you can change it for one person. “Every day” adds a “Paid today” tick on the Day sheet.</span></div>
          <Pills options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }, { value: 'monthly', label: 'Every month' }]} value={cfg.payCycle} onChange={v => save({ payCycle: v })} testId="ds-cycle" />
        </div>

        <DefaultOt value={cfg.defaultOt} onSave={(ot) => save({ defaultOt: ot })} />
      </>}
    </div>
  );
}
