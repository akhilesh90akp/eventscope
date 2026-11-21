/**
 * daySheetDocs — turns Day sheet / Staff & wages numbers into tables for
 * Excel and Print (see staffExcel.js). Pure; covered by tests/daySheetDocs.test.mjs.
 */

// ============================================================
// HELPERS
// ============================================================
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayText = (iso) => { const d = new Date(`${iso}T00:00:00`); return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`; };
const monthText = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const WHERE_LABEL = { events: 'Events', warehouse: 'Warehouse', leave: 'Leave', notfilled: 'Not filled' };

// ============================================================
// ONE DAY
// ============================================================

/** d = computeDay result · fns = that day's functions · columnLabel(id) → Job Log column name */
export function dayDoc({ company = '', d, sheet, fns = [], columnLabel = (x) => x }) {
  const sections = [];
  if (fns.length) {
    sections.push({
      heading: `Events · ${fns.length}`,
      columns: [{ header: 'Event', key: 'name' }, { header: 'Venue', key: 'venue' }, { header: 'Day share', key: 'share', money: true }],
      rows: fns.map((f, i) => ({ name: `${f.client} · ${f.name}`, venue: f.location || '', share: d.each[i] || 0 })),
      total: { name: 'Total', share: d.eventDay },
    });
  }
  sections.push({
    heading: 'Staff',
    columns: [{ header: 'Name', key: 'name' }, { header: 'Where', key: 'where' }, { header: 'Overtime (h)', key: 'otHours', align: 'right' },
      { header: 'Day cost', key: 'pay', money: true }, { header: 'OT', key: 'ot', money: true }, { header: 'Total', key: 'total', money: true }],
    rows: d.rows.map(r => ({ name: r.name, where: WHERE_LABEL[r.where] || r.where, otHours: sheet?.staff?.[r.id]?.otHours || '', pay: r.pay, ot: r.ot, total: r.total })),
    total: { name: `${d.rows.length} people`, pay: d.rows.reduce((t, r) => t + r.pay, 0), ot: d.rows.reduce((t, r) => t + r.ot, 0), total: d.rows.reduce((t, r) => t + r.total, 0) },
  });
  const costs = (sheet?.costs || []).filter(c => Number(c.amount) > 0);
  sections.push({
    heading: 'Shared costs',
    columns: [{ header: 'Cost', key: 'label' }, { header: 'Goes to Job Log column', key: 'col' }, { header: 'Amount', key: 'amount', money: true }],
    rows: costs.map(c => ({ label: c.label, col: columnLabel(c.column), amount: Math.round(Number(c.amount)) })),
    total: { label: 'Total', amount: d.shared },
  });
  sections.push({
    heading: 'How it adds up',
    columns: [{ header: '', key: 'k' }, { header: 'Amount', key: 'v', money: true }],
    rows: [
      { k: 'Staff at events (incl. overtime)', v: d.staffAtEvents },
      { k: 'Shared costs', v: d.shared },
      { k: fns.length ? `Event-day costs (÷ ${fns.length} events)` : 'Event-day costs', v: d.eventDay },
      { k: 'Running cost (warehouse, leave, no events)', v: d.running },
    ],
    total: { k: 'Day total', v: d.total },
    notes: sheet?.notes ? [`Notes: ${sheet.notes}`] : [],
  });
  return { title: `${company ? `${company} · ` : ''}Day sheet · ${dayText(d.date)}`, sub: d.filled ? '' : 'Not filled — monthly pay counted, other costs missing', sheetName: d.date, sections };
}

// ============================================================
// ONE MONTH
// ============================================================

/** m = computeMonth result · byDate = { date: [eventIds] } */
export function monthDoc({ company = '', ym, month: m, byDate = {} }) {
  const rows = m.days.map(d => ({
    day: dayText(d.date),
    status: !d.filled ? 'Not filled' : (byDate[d.date] || []).length ? `${byDate[d.date].length} events` : 'Warehouse',
    eventDay: d.eventDay, running: d.running, total: d.total,
  }));
  return {
    title: `${company ? `${company} · ` : ''}Day sheets · ${monthText(ym)}`,
    sub: 'Event-day costs are shared equally across that day’s events. Running cost = warehouse, leave, days with no events or not filled.',
    sheetName: monthText(ym),
    sections: [{
      columns: [{ header: 'Day', key: 'day' }, { header: 'What happened', key: 'status' }, { header: 'Shared into events', key: 'eventDay', money: true },
        { header: 'Running cost', key: 'running', money: true }, { header: 'Day total', key: 'total', money: true }],
      rows,
      total: { day: `Total · ${rows.length} days`, eventDay: m.eventDay, running: m.running, total: m.total },
      notes: [`Office salaries this month (not part of any day): ₹${Math.round(m.office).toLocaleString('en-IN')}`],
    }],
  };
}

// ============================================================
// SALARY SHEET
// ============================================================

/** list = [{ p, s }] where s = staffMonth(p, …) — split into Events team and Office */
export function salaryDoc({ company = '', ym, list = [] }) {
  const columns = [{ header: 'Name', key: 'name' }, { header: 'Pay', key: 'pay' }, { header: 'Days', key: 'days', align: 'right' },
    { header: 'Earned', key: 'earned', money: true }, { header: 'Overtime', key: 'ot', money: true }, { header: 'Paid early', key: 'paidEarly', money: true },
    { header: 'Paid', key: 'paid', money: true }, { header: 'Advance back', key: 'advanceBack', money: true }, { header: 'To pay', key: 'toPay', money: true },
    { header: 'Bonus (paid)', key: 'bonus', money: true }, { header: 'Advance owed', key: 'advanceOwed', money: true }];
  const section = (heading, items) => {
    const rows = items.map(({ p, s }) => ({
      name: p.name, pay: `${p.pay === 'monthly' ? 'Monthly' : 'Daily'} ₹${Math.round(Number(p.amount) || 0).toLocaleString('en-IN')}`,
      days: s.leave ? `${s.days} + ${s.leave} leave` : String(s.days),
      earned: s.earned, ot: s.ot, paidEarly: s.paidEarly, paid: s.paid, advanceBack: s.advanceBack, toPay: s.toPay, bonus: s.bonus, advanceOwed: s.advanceOwed,
    }));
    const sum = (k) => items.reduce((t, { s }) => t + s[k], 0);
    return { heading: `${heading} · ${items.length}`, columns, rows,
      total: { name: 'Total', earned: sum('earned'), ot: sum('ot'), paidEarly: sum('paidEarly'), paid: sum('paid'), advanceBack: sum('advanceBack'), toPay: sum('toPay'), bonus: sum('bonus'), advanceOwed: sum('advanceOwed') } };
  };
  const team = list.filter(x => x.p.worksIn !== 'office');
  const office = list.filter(x => x.p.worksIn === 'office');
  return {
    title: `${company ? `${company} · ` : ''}Salary sheet · ${monthText(ym)}`,
    sub: 'To pay = earned + overtime − paid early − paid − advance taken back. Bonuses are paid on the spot.',
    sheetName: `Salary ${monthText(ym)}`,
    sections: [section('Events team', team), ...(office.length ? [section('Office', office)] : [])],
  };
}
