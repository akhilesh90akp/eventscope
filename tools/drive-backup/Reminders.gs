/**
 * EventScope — morning event reminders for owners (push notifications).
 *
 * Runs in the same Apps Script project as Code.gs (it reuses request(),
 * listDocuments(), fromFields() and PROJECT_ID from there). Every morning at
 * ~9 am India time it looks at each active company's confirmed events and
 * sends a notification to the owners' devices (tenants/{id}/pushTokens):
 *
 *   "In 2 days: Joseph Family — Wedding"   (2 days before each function)
 *   "Today: Joseph Family — Home Function"  (on the day)
 *   "Day 2 today: Infopark Expo — Expo"     (each extra day of a multi-day function)
 *
 * Sent through Firebase Cloud Messaging (free). Devices that are no longer
 * registered are removed. Owners turn reminders on per device in the app
 * (Calendar → Reminders). Setup: README.md → "Reminders".
 */

// ============================================================
// SETTINGS
// ============================================================

var REMIND_AT_HOUR = 9;                         // ~9 am (script time zone: Asia/Kolkata)
var DAYS_BEFORE = 2;
var APP_URL = 'https://akhilesh90akp.github.io/eventscope/';
var FCM_API = 'https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send';

// ============================================================
// ENTRY POINTS
// ============================================================

/** Run once by hand after pasting this file: schedules the 9 am reminders (and keeps the backup schedule). */
function setupReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReminders').timeBased().everyDays(1).atHour(REMIND_AT_HOUR).create();
  var r = sendRemindersNow();
  Logger.log('Reminders scheduled (~' + REMIND_AT_HOUR + ':00). Today: ' + r.summary);
}

/** Called by the daily trigger. Emails the account owner if it fails. */
function dailyReminders() {
  try {
    sendRemindersNow();
  } catch (err) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'EventScope reminders FAILED',
      'The morning reminders were not sent.\n\nError: ' + (err && err.stack || err) +
      '\n\nOpen the script and press Run on sendRemindersNow to retry.');
    throw err;
  }
}

/** Sends today's reminders. Returns { sent, removed, summary }. */
function sendRemindersNow(todayOverride) {
  var today = todayOverride || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var inTwo = shiftDate(today, DAYS_BEFORE);
  var sent = 0, removed = 0, companies = 0;

  var users = listDocuments(ROOT, 'users').filter(function (d) { return d.fields; }).map(function (d) {
    return { uid: d.name.split('/').pop(), data: fromFields(d.fields) };
  });

  listDocuments(ROOT, 'tenants').forEach(function (t) {
    if (!t.fields) return;
    var tenant = fromFields(t.fields);
    if (tenant.status === 'suspended') return;
    var tenantPath = t.name.slice(t.name.indexOf('projects/'));
    var tenantId = tenantPath.split('/').pop();

    // owners' devices (skip anyone who is no longer an owner here)
    var owners = users.filter(function (u) { return u.data.tenantId === tenantId && u.data.role === 'owner'; }).map(function (u) { return u.uid; });
    var tokens = listDocuments(tenantPath, 'pushTokens').filter(function (d) { return d.fields; }).map(function (d) {
      return { path: d.name.slice(d.name.indexOf('projects/')), data: fromFields(d.fields) };
    }).filter(function (tk) { return owners.indexOf(tk.data.uid) !== -1 && tk.data.token; });
    if (!tokens.length) return;

    var events = listDocuments(tenantPath, 'events').filter(function (d) { return d.fields; }).map(function (d) {
      return { id: d.name.split('/').pop(), data: fromFields(d.fields) };
    });
    var messages = reminderMessages(events, today, inTwo);
    if (!messages.length) return;
    companies++;

    messages.forEach(function (m) {
      tokens.forEach(function (tk) {
        var res = sendPush(tk.data.token, m);
        if (res === 'sent') sent++;
        if (res === 'gone') { request('delete', tk.path); removed++; tk.data.token = null; }
      });
      tokens = tokens.filter(function (tk) { return tk.data.token; });
    });
  });

  var summary = sent + ' notifications to ' + companies + ' companies' + (removed ? ', ' + removed + ' old devices removed' : '');
  Logger.log(summary);
  return { sent: sent, removed: removed, summary: summary };
}

// ============================================================
// WHAT TO SAY
// ============================================================

/**
 * One message per confirmed function starting today or in DAYS_BEFORE days,
 * plus "Day N today" for each later day of a multi-day function.
 */
function reminderMessages(events, today, inTwo) {
  var out = [];
  events.forEach(function (ev) {
    var e = ev.data;
    if (e.status !== 'confirmed') return;
    functionsOf(e).forEach(function (f) {
      var dayN = f.days > 1 && f.date < today && f.endDate >= today ? daysBetween(f.date, today) + 1 : 0;
      var when = f.date === today ? 'Today' : f.date === inTwo ? 'In ' + DAYS_BEFORE + ' days' : dayN ? 'Day ' + dayN + ' today' : null;
      if (!when) return;
      var dates = f.days > 1 ? prettyDate(f.date) + ' – ' + prettyDate(f.endDate) + ' (' + f.days + ' days)' : prettyDate(f.date);
      var bits = [dates + (f.time ? ', ' + time12(f.time) : ''), f.location].filter(Boolean);
      out.push({
        title: when + ': ' + (e.clientName || 'Event') + ' — ' + f.name,
        body: bits.join(' · '),
        url: APP_URL + '#/confirmed',
        tag: ev.id + '-' + f.date + (dayN ? '-d' + dayN : ''),
      });
    });
  });
  return out;
}

/** main event + sub-events with a date: [{ date, endDate, days, time, name, location }] */
function functionsOf(e) {
  var list = [];
  var add = function (fn, name) {
    var end = fn.endDate && fn.endDate > fn.date ? fn.endDate : fn.date;
    list.push({ date: fn.date, endDate: end, days: daysBetween(fn.date, end) + 1, time: fn.time || '', name: name, location: fn.location || fn.eventLocation || '' });
  };
  if (e.mainEvent && e.mainEvent.date) add(e.mainEvent, e.mainEvent.name || e.eventType || 'Event');
  else if (e.date) add(e, e.eventType || 'Event');
  (e.subEvents || []).forEach(function (s) {
    if (s && s.date) add(s, s.name || 'Function');
  });
  return list;
}

// ============================================================
// SENDING (Firebase Cloud Messaging HTTP v1)
// ============================================================

/** 'sent' | 'gone' (device no longer registered — remove it) | 'failed' */
function sendPush(token, m) {
  var res = UrlFetchApp.fetch(FCM_API, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ message: {
      token: token,
      data: { title: m.title, body: m.body, url: m.url, tag: m.tag },
      webpush: { headers: { Urgency: 'high', TTL: '43200' } },
    } }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT_ID },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code === 200) return 'sent';
  var text = res.getContentText();
  if (code === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) return 'gone';
  if (code === 400 && /INVALID_ARGUMENT/.test(text) && /token/i.test(text)) return 'gone';
  Logger.log('Push failed (' + code + '): ' + text.slice(0, 300));
  if (code === 401 || code === 403) throw new Error('Not allowed to send notifications (' + code + '). Run setupReminders once and click Allow. ' + text.slice(0, 300));
  return 'failed';
}

// ============================================================
// DATES
// ============================================================

function shiftDate(iso, n) {
  var p = iso.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  var p = a.split('-').map(Number), q = b.split('-').map(Number);
  return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000);
}
function prettyDate(iso) {
  var p = iso.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return days[d.getUTCDay()] + ' ' + p[2] + ' ' + months[p[1] - 1];
}
function time12(t) {
  var p = t.split(':').map(Number);
  return (((p[0] + 11) % 12) + 1) + ':' + ('0' + (p[1] || 0)).slice(-2) + (p[0] >= 12 ? ' pm' : ' am');
}
