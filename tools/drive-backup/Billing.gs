/**
 * EventScope — plan & payment notifications (push), in the same Apps Script
 * project as Code.gs and Reminders.gs (reuses request(), listDocuments(),
 * fromFields(), ROOT, sendPush(), shiftDate(), daysBetween(), prettyDate()).
 *
 * To you (EventScope admins — every device where you turned on reminders):
 *   "💰 Kochi Celebrations says they paid ₹15,990 (ref …)"   — checked every hour
 *   "⏳ Thrissur Decor — pilot ends in 3 days (13 Jan)"
 *   "📅 Zen Weddings — Premium yearly ends in 7 days" / "… ends today"
 *   "⚠️ Blue Bell — payment due, 5 grace days left"            (day after it ends)
 *   "⛔ Kochi Caterers — pilot ended, now read-only"          (when the grace days run out)
 *
 * To each company's owners:
 *   "Your free pilot ends in 3 days" / "Your Standard plan ends in 3 days"
 *   "Your plan has ended — 5 days to pay before the app turns read-only"
 *
 * The daily part runs inside dailyReminders (≈9 am); payment claims hourly
 * (checkPaymentClaims). setupReminders() schedules both.
 */

// ============================================================
// SETTINGS
// ============================================================
var GRACE_DAYS = 5;                 // must match src/utils/billing.js
var PLAN_NAMES = { trial: 'Free pilot', basic: 'Basic', standard: 'Standard', premium: 'Premium' };

// ============================================================
// HELPERS
// ============================================================

/** Every push token, with its company and owner uid: [{ path, tenantId, uid, token }] */
function allTokens_(tenantDocs) {
  var out = [];
  tenantDocs.forEach(function (t) {
    var tenantPath = t.name.slice(t.name.indexOf('projects/'));
    listDocuments(tenantPath, 'pushTokens').forEach(function (d) {
      if (!d.fields) return;
      var data = fromFields(d.fields);
      if (data.token) out.push({ path: d.name.slice(d.name.indexOf('projects/')), tenantId: tenantPath.split('/').pop(), uid: data.uid, token: data.token });
    });
  });
  return out;
}

/** uids listed in platformAdmins */
function adminUids_() {
  return listDocuments(ROOT, 'platformAdmins').map(function (d) { return d.name.split('/').pop(); });
}

/** Sends one message to a list of tokens; drops dead ones. Returns how many were sent. */
function pushAll_(tokens, m) {
  var sent = 0;
  tokens.forEach(function (tk) {
    var res = sendPush(tk.token, m);
    if (res === 'sent') sent++;
    if (res === 'gone') { try { request('delete', tk.path); } catch (e) { /* already gone */ } }
  });
  return sent;
}

function rupees_(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

// ============================================================
// DAILY — dates (called from sendRemindersNow)
// ============================================================

/**
 * Today's plan / pilot messages for admins and owners.
 * @param {string} today 'YYYY-MM-DD' (India)
 * @returns {string} summary for the log
 */
function sendBillingNotices(today) {
  var tenantDocs = listDocuments(ROOT, 'tenants').filter(function (t) { return t.fields; });
  var users = listDocuments(ROOT, 'users').filter(function (d) { return d.fields; }).map(function (d) {
    return { uid: d.name.split('/').pop(), data: fromFields(d.fields) };
  });
  var tokens = allTokens_(tenantDocs);
  var admins = adminUids_();
  var adminTokens = tokens.filter(function (tk) { return admins.indexOf(tk.uid) !== -1; });
  var toAdmin = [], sent = 0;

  tenantDocs.forEach(function (t) {
    var tenant = fromFields(t.fields);
    var id = t.name.split('/').pop();
    if (tenant.status === 'suspended' || !/^\d{4}-\d{2}-\d{2}$/.test(tenant.accessUntil || '')) return;
    var name = tenant.name || id;
    var pilot = (tenant.plan || 'trial') === 'trial';
    var plan = PLAN_NAMES[tenant.plan] || tenant.plan;
    var cycle = tenant.cycle === 'yearly' ? ' yearly' : tenant.cycle === 'monthly' ? ' monthly' : '';
    var left = daysBetween(today, tenant.accessUntil) + 1;          // days of access left, incl. today
    var auto = tenant.autoSuspend !== false;
    var ends = prettyDate(tenant.accessUntil);
    var url = APP_URL + '#/billing';

    // --- to admins
    if (pilot && left === 3) toAdmin.push('⏳ ' + name + ' — pilot ends in 3 days (' + ends + ')');
    if (!pilot && left === 7) toAdmin.push('📅 ' + name + ' — ' + plan + cycle + ' ends in 7 days (' + ends + ')');
    if (!pilot && left === 1) toAdmin.push('📅 ' + name + ' — ' + plan + cycle + ' ends today');
    if (left === 0) toAdmin.push('⚠️ ' + name + ' — ' + (pilot ? 'pilot ended' : 'payment due') + (auto ? ', ' + GRACE_DAYS + ' grace days left' : ' (auto-suspend off)'));
    if (auto && left === -GRACE_DAYS) toAdmin.push('⛔ ' + name + ' — ' + (pilot ? 'pilot ended' : 'not paid') + ', now read-only');

    // --- to the company's owners
    var ownerMsg = null;
    if (left === 3) ownerMsg = { title: pilot ? 'Your free pilot ends in 3 days' : 'Your ' + plan + ' plan ends in 3 days', body: 'Ends on ' + ends + '. Open Plan & billing to ' + (pilot ? 'pick a plan.' : 'renew.') };
    if (left === 0 && auto) ownerMsg = { title: pilot ? 'Your free pilot has ended' : 'Your ' + plan + ' plan has ended', body: 'You have ' + GRACE_DAYS + ' days to pay before the app turns read-only.' };
    if (ownerMsg) {
      var owners = users.filter(function (u) { return u.data.tenantId === id && u.data.role === 'owner'; }).map(function (u) { return u.uid; });
      var mine = tokens.filter(function (tk) { return tk.tenantId === id && owners.indexOf(tk.uid) !== -1; });
      sent += pushAll_(mine, { title: ownerMsg.title, body: ownerMsg.body, url: url, tag: 'plan-' + id + '-' + today });
    }
  });

  toAdmin.forEach(function (line, i) {
    sent += pushAll_(adminTokens, { title: 'EventScope Admin', body: line, url: APP_URL + '#/admin', tag: 'admin-' + today + '-' + i });
  });
  return sent + ' plan notices' + (adminTokens.length ? '' : ' (no admin devices — turn on reminders on your phone)');
}

// ============================================================
// HOURLY — "I've paid" claims
// ============================================================

/** Tells admins about new "I've paid" claims (each claim once). Scheduled hourly. */
function checkPaymentClaims() {
  var props = PropertiesService.getScriptProperties();
  var tenantDocs = listDocuments(ROOT, 'tenants').filter(function (t) { return t.fields; });
  var fresh = [];
  tenantDocs.forEach(function (t) {
    var tenantPath = t.name.slice(t.name.indexOf('projects/'));
    var claim = listDocuments(tenantPath, 'payments').filter(function (d) { return d.fields && d.name.split('/').pop() === 'pending'; })[0];
    if (!claim) return;
    var c = fromFields(claim.fields);
    var key = 'claim:' + tenantPath.split('/').pop() + ':' + c.createdAt;
    if (props.getProperty(key)) return;
    props.setProperty(key, '1');
    fresh.push('💰 ' + (fromFields(t.fields).name || tenantPath.split('/').pop()) + ' says they paid ' + rupees_(c.amount) + ' (ref ' + c.ref + '). Tap to confirm.');
  });
  if (!fresh.length) return 'no new claims';
  var admins = adminUids_();
  var adminTokens = allTokens_(tenantDocs).filter(function (tk) { return admins.indexOf(tk.uid) !== -1; });
  fresh.forEach(function (line, i) {
    pushAll_(adminTokens, { title: 'EventScope Admin', body: line, url: APP_URL + '#/admin', tag: 'claim-' + Date.now() + '-' + i });
  });
  Logger.log(fresh.length + ' new payment claims');
  return fresh.length + ' new claims';
}
