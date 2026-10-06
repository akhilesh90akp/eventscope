/**
 * JobLogColumnsEditor — Settings → Job Log columns (owner only)
 *
 * Each tenant chooses its own cost/income columns. A column's `id` is the
 * key its values are stored under, so it never changes — renaming only
 * changes the label. "Remove" hides a column (past values are kept and come
 * back if it's restored), so nothing is ever silently deleted.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import Button from './Button';
import { genId } from '../utils/helpers';
import { ArrowUp, ArrowDown, Save, Plus, RotateCcw } from 'lucide-react';

// ============================================================
// JobLogColumnsEditor — MAIN COMPONENT
// ============================================================

export default function JobLogColumnsEditor() {
  const { allJobLogColumns, saveJobLogColumns, canEditSettings, showToast } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [cols, setCols] = useState(allJobLogColumns);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('cost');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCols(allJobLogColumns); }, [allJobLogColumns]);

  const active = cols.filter(c => !c.hidden);
  const removed = cols.filter(c => c.hidden);
  const dirty = JSON.stringify(cols) !== JSON.stringify(allJobLogColumns);

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const update = (id, patch) => setCols(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)));

  /** Moves a column up/down among the visible ones */
  const move = (id, dir) => setCols(cs => {
    const vis = cs.filter(c => !c.hidden);
    const i = vis.findIndex(c => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= vis.length) return cs;
    [vis[i], vis[j]] = [vis[j], vis[i]];
    return [...vis, ...cs.filter(c => c.hidden)];
  });

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    if (cols.some(c => c.label.toLowerCase() === label.toLowerCase())) {
      showToast('A column with that name already exists', 'error');
      return;
    }
    setCols(cs => [...cs.filter(c => !c.hidden), { id: 'c_' + genId(), label, type: newType }, ...cs.filter(c => c.hidden)]);
    setNewLabel('');
  };

  const handleSave = async () => {
    if (active.some(c => !c.label.trim())) {
      showToast('Every column needs a name', 'error');
      return;
    }
    setSaving(true);
    const result = await saveJobLogColumns(cols.map(c => ({ ...c, label: c.label.trim() })));
    setSaving(false);
    if (result.success) showToast('Job Log columns saved');
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="space-y-4">
      <p className="text-sm text-bb-muted">
        These are the columns in your Job Log and the Costs section of each completed event.
        Costs reduce profit; income adds to it. Removing a column hides it — its past values are kept.
      </p>

      <div className="space-y-2">
        {active.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 border border-bb-border rounded-lg px-2 py-1.5 bg-white">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(c.id, -1)} disabled={i === 0} className="text-bb-muted hover:text-bb-text disabled:opacity-20 cursor-pointer" title="Move up"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(c.id, 1)} disabled={i === active.length - 1} className="text-bb-muted hover:text-bb-text disabled:opacity-20 cursor-pointer" title="Move down"><ArrowDown size={14} /></button>
            </div>
            <input
              value={c.label}
              onChange={e => update(c.id, { label: e.target.value })}
              className="flex-1 min-w-0 text-sm font-semibold bg-transparent border border-transparent hover:border-bb-border focus:border-bb-accent rounded px-2 py-1.5 outline-none"
            />
            <select
              value={c.type}
              onChange={e => update(c.id, { type: e.target.value })}
              className={`text-xs font-bold rounded-full px-2 py-1 border-0 ${c.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
            >
              <option value="cost">Cost</option>
              <option value="income">Income</option>
            </select>
            <button type="button" onClick={() => update(c.id, { hidden: true })} className="text-xs text-red-600 hover:underline px-1 cursor-pointer">Remove</button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="New column name, e.g. Generator fuel"
          className="flex-1 min-w-[180px] text-sm border border-bb-border rounded-lg px-3 py-2 bg-white outline-none focus:border-bb-accent"
        />
        <select value={newType} onChange={e => setNewType(e.target.value)} className="text-sm border border-bb-border rounded-lg px-2 py-2 bg-white">
          <option value="cost">Cost</option>
          <option value="income">Income</option>
        </select>
        <Button icon={Plus} variant="secondary" onClick={add}>Add column</Button>
      </div>

      {removed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-bb-muted uppercase mb-1.5">Removed columns</p>
          <div className="flex flex-wrap gap-2">
            {removed.map(c => (
              <button key={c.id} type="button" onClick={() => update(c.id, { hidden: false })} className="inline-flex items-center gap-1 text-xs border border-bb-border rounded-full px-2.5 py-1 text-bb-muted hover:text-bb-text cursor-pointer">
                <RotateCcw size={11} /> {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {canEditSettings && (
        <Button icon={Save} fullWidth size="lg" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save columns' : 'Saved'}
        </Button>
      )}
    </div>
  );
}
