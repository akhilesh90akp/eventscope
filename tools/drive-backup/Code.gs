/**
 * EventScope — daily backup of all Firestore data to Google Drive.
 *
 * Runs inside the Google account that owns the Firebase project
 * (essope.work@gmail.com) as a Google Apps Script. Once a day it reads every
 * document in the database through the Firestore REST API and saves one zip
 * in a private Drive folder ("EventScope Backups"):
 *
 *   eventscope-backup-2026-10-09.zip
 *     ├── <companyId>.json   one per company — same format the Admin page's
 *     │                      "Import company" reads, so a restore is an import
 *     └── _everything.json   every document in the database, as-is
 *
 * Keeps the newest KEEP_DAYS zips and deletes older ones. Emails the account
 * if a backup fails. Free: no Blaze plan, no service-account key.
 *
 * Reads use the account owner's own Google sign-in (IAM), so Firestore
 * security rules don't apply and nothing in the app needs to change.
 *
 * Setup: see README.md next to this file.
 */

// ============================================================
// SETTINGS
// ============================================================

var PROJECT_ID = 'eventscope-app';
var DATABASE = '(default)';
var FOLDER_NAME = 'EventScope Backups';
var KEEP_DAYS = 30;          // how many daily zips to keep
var RUN_AT_HOUR = 2;         // ~2 am (script time zone: Asia/Kolkata)

var API = 'https://firestore.googleapis.com/v1/';
var ROOT = 'projects/' + PROJECT_ID + '/databases/' + DATABASE + '/documents';

// ============================================================
// ENTRY POINTS
// ============================================================

/** Run this once by hand (Run ▶ in the editor): makes a backup now and schedules the daily one. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(RUN_AT_HOUR).create();
  var result = backupNow();
  Logger.log('Daily backup scheduled (~' + RUN_AT_HOUR + ':00). First backup saved: ' + result.fileName +
             ' — ' + result.summary);
}

/** Called by the daily trigger. On any failure, emails the account owner. */
function dailyBackup() {
  try {
    backupNow();
  } catch (err) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'EventScope backup FAILED',
      'The daily EventScope backup did not complete.\n\nError: ' + (err && err.stack || err) +
      '\n\nOpen the backup script and press Run on backupNow to retry, or send this email to support.');
    throw err;
  }
}

/** Makes one backup right now. Returns { fileName, summary }. */
function backupNow() {
  var started = new Date();
  var docs = dumpDatabase();                       // [{ path, data }]
  var files = buildFiles(docs, started.toISOString());

  var blobs = Object.keys(files).map(function (name) {
    return Utilities.newBlob(JSON.stringify(files[name], null, 1), 'application/json', name);
  });
  var stamp = Utilities.formatDate(started, 'Asia/Kolkata', 'yyyy-MM-dd');
  var zipName = 'eventscope-backup-' + stamp + '.zip';
  var folder = backupFolder();

  // One zip per day: replace today's if it already exists (e.g. a manual re-run)
  var same = folder.getFilesByName(zipName);
  while (same.hasNext()) same.next().setTrashed(true);
  folder.createFile(Utilities.zip(blobs, zipName));
  pruneOld(folder);

  var companies = Object.keys(files).filter(function (n) { return n !== '_everything.json'; }).length;
  var summary = docs.length + ' documents, ' + companies + ' companies';
  Logger.log('Saved ' + zipName + ' (' + summary + ')');
  return { fileName: zipName, summary: summary };
}

// ============================================================
// READING FIRESTORE
// ============================================================

function request(method, path, body) {
  var res = UrlFetchApp.fetch(API + path, {
    method: method,
    contentType: 'application/json',
    payload: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      // bill/quota the call to the Firebase project, not the script's own hidden project
      'x-goog-user-project': PROJECT_ID,
    },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('Firestore ' + method + ' ' + path + ' → ' + code + ': ' + res.getContentText().slice(0, 500));
  return JSON.parse(res.getContentText() || '{}');
}

/** Names of the collections directly under a document (or the database root) */
function listCollectionIds(parent) {
  var ids = [], token = '';
  do {
    var r = request('post', parent + ':listCollectionIds', { pageSize: 300, pageToken: token || undefined });
    ids = ids.concat(r.collectionIds || []);
    token = r.nextPageToken || '';
  } while (token);
  return ids;
}

/** Every document in one collection (including "empty" ones that only hold subcollections) */
function listDocuments(parent, collectionId) {
  var out = [], token = '';
  do {
    var q = parent + '/' + collectionId + '?pageSize=300&showMissing=true' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    var r = request('get', q);
    out = out.concat(r.documents || []);
    token = r.nextPageToken || '';
  } while (token);
  return out;
}

/** Walks the whole database. Returns [{ path: 'tenants/abc/events/e1', data: {...} | null }] */
function dumpDatabase() {
  var all = [];
  (function walk(parent) {
    listCollectionIds(parent).forEach(function (cid) {
      listDocuments(parent, cid).forEach(function (d) {
        var path = d.name.slice(d.name.indexOf('/documents/') + '/documents/'.length);
        all.push({ path: path, data: d.fields ? fromFields(d.fields) : (d.createTime ? {} : null) });
        walk(d.name.slice(d.name.indexOf('projects/')));
      });
    });
  })(ROOT);
  return all;
}

/** Firestore's typed values → plain JSON (timestamps become ISO strings, like the app stores them) */
function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return { latitude: v.geoPointValue.latitude, longitude: v.geoPointValue.longitude };
  if ('bytesValue' in v) return v.bytesValue;
  return null;
}
function fromFields(fields) {
  var o = {};
  Object.keys(fields).forEach(function (k) { o[k] = fromValue(fields[k]); });
  return o;
}

// ============================================================
// BUILDING THE FILES
// ============================================================

/**
 * One file per company in the "eventscope-backup" format (version 2), plus
 * _everything.json. Company files are what Admin → Import company restores.
 */
function buildFiles(docs, exportedAt) {
  var files = {};
  var byId = function (prefix) {
    return docs.filter(function (d) { return d.path.indexOf(prefix) === 0 && d.path.slice(prefix.length).indexOf('/') === -1 && d.data; })
      .map(function (d) { return { id: d.path.slice(prefix.length), data: d.data }; });
  };

  var tenants = docs.filter(function (d) { return /^tenants\/[^/]+$/.test(d.path); });
  var users = byId('users/');
  var invites = byId('invites/');

  tenants.forEach(function (t) {
    var id = t.path.split('/')[1];
    var base = 'tenants/' + id + '/';
    var known = ['events', 'config', 'financials'];
    var other = {};
    docs.forEach(function (d) {
      if (d.path.indexOf(base) !== 0 || !d.data) return;
      var rest = d.path.slice(base.length).split('/');
      if (rest.length !== 2 || known.indexOf(rest[0]) !== -1) return;
      (other[rest[0]] = other[rest[0]] || []).push({ id: rest[1], data: d.data });
    });
    files[id + '.json'] = {
      format: 'eventscope-backup',
      version: 2,
      exportedAt: exportedAt,
      sourceProject: PROJECT_ID,
      tenantId: id,
      tenant: t.data || {},
      events: byId(base + 'events/'),
      config: byId(base + 'config/'),
      financials: byId(base + 'financials/'),
      members: users.filter(function (u) { return u.data.tenantId === id; })
        .map(function (u) { return { uid: u.id, email: u.data.email || '', role: u.data.role || 'staff', name: u.data.name || '' }; }),
      invites: invites.filter(function (i) { return i.data.tenantId === id; })
        .map(function (i) { return { email: i.id, role: i.data.role || 'staff' }; }),
      other: other,
    };
  });

  files['_everything.json'] = {
    format: 'eventscope-full-dump',
    exportedAt: exportedAt,
    sourceProject: PROJECT_ID,
    documents: docs,
  };
  return files;
}

// ============================================================
// DRIVE
// ============================================================

function backupFolder() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

/** Keeps the newest KEEP_DAYS backup zips, trashes the rest */
function pruneOld(folder) {
  var list = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^eventscope-backup-\d{4}-\d{2}-\d{2}\.zip$/.test(f.getName())) list.push(f);
  }
  list.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; });  // newest first
  list.slice(KEEP_DAYS).forEach(function (f) { f.setTrashed(true); });
}
