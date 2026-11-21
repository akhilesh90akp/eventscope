/**
 * TodayDaySheetCard — Home: "Today's Day sheet" with Filled / Not filled.
 * Shown only when Day sheets are on and this person may fill them.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Tag } from './StaffUI';
import { eventsByDate } from '../utils/daySheetView';
import { isoDate } from '../utils/calendar';
import { formatDateWithDay } from '../utils/helpers';

export default function TodayDaySheetCard() {
  const { daySheetsOn, canFillDaySheets, daySheets, daySheetsLoaded, events, daySheetCfg } = useApp();
  const navigate = useNavigate();
  const today = isoDate(new Date());
  if (!daySheetsOn || !canFillDaySheets || !daySheetCfg.startDate || today < daySheetCfg.startDate) return null;
  const n = (eventsByDate(events)[today] || []).length;
  const filled = !!daySheets[today];
  return (
    <button onClick={() => navigate(`/day-sheets/${today}`)} data-testid="home-daysheet"
      className="w-full flex items-center gap-3.5 bg-white border border-bb-border rounded-2xl px-4 py-3.5 text-left cursor-pointer hover:bg-bb-card-hover">
      <span className="w-11 h-11 rounded-xl bg-violet-50 text-bb-accent-hover flex items-center justify-center shrink-0"><ClipboardCheck size={21} /></span>
      <span className="flex-1 min-w-0">
        <b className="block text-[16px] text-bb-text">Today’s Day sheet</b>
        <span className="block text-[13px] text-gray-600">{formatDateWithDay(today).replace(/ \d{4}$/, '')} · {n ? `${n} ${n === 1 ? 'event' : 'events'}` : 'no events'}{daySheetsLoaded && !filled ? ' · not filled yet' : ''}</span>
      </span>
      {daySheetsLoaded && <Tag tone={filled ? 'green' : 'amber'}>{filled ? 'Filled' : 'Not filled'}</Tag>}
      <ChevronRight size={18} className="text-bb-muted shrink-0" />
    </button>
  );
}
