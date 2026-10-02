/**
 * Sheet Sync — Bridge to the Google Sheets Apps Script Web App
 *
 * Two operations, both hitting the same Apps Script Web App URL
 * configured in Settings (sheetSyncUrl / sheetSyncSecret):
 *   - pushCompletedEventsToSheet: sends app-known fields for every
 *     completed event so Job Log stays up to date, regardless of
 *     whatever Reports filter happens to be active.
 *   - pullProfitsFromSheet: reads back the Profit figure the sheet
 *     calculates from the manually-entered cost columns.
 *
 * The POST body is sent as text/plain (not application/json) on
 * purpose — browsers only preflight non-"simple" content types, and
 * Apps Script Web Apps don't handle CORS preflight (OPTIONS) requests.
 * Sending as text/plain avoids the preflight; the Apps Script side
 * parses the JSON manually from e.postData.contents.
 */

// ============================================================
// PUSH (App -> Job Log)
// ============================================================

/**
 * Pushes every completed event's app-known fields to the sheet.
 * Returns { success, updated, added } or { success: false, error }.
 */
export async function pushCompletedEventsToSheet(completedEvents, syncUrl, secret) {
  if (!syncUrl || !secret) {
    return { success: false, error: 'Sheet sync isn\'t configured yet — add the Apps Script URL and secret in Settings.' };
  }

  const payload = {
    secret,
    action: 'push',
    events: completedEvents.map(ev => ({
      id: ev.id,
      date: ev.mainEvent?.date || ev.date || '',
      eventName: ev.mainEvent?.name || ev.eventType || '',
      client: ev.clientName || '',
      location: ev.mainEvent?.location || ev.eventLocation || '',
      eventType: ev.eventType || '',
      revenue: ev.totalAmount || 0,
      contact: ev.clientPhone || '',
    })),
  };

  try {
    const res = await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) return { success: false, error: data.error || 'Sync failed' };
    return { success: true, updated: data.updated, added: data.added };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// PULL (Job Log -> App)
// ============================================================

/**
 * Reads back the Profit column, keyed by event id.
 * Returns { success, profits: { [id]: number } } or { success: false, error }.
 */
export async function pullProfitsFromSheet(syncUrl, secret) {
  if (!syncUrl || !secret) {
    return { success: false, error: 'Sheet sync isn\'t configured yet — add the Apps Script URL and secret in Settings.' };
  }

  try {
    const url = `${syncUrl}?action=pull&secret=${encodeURIComponent(secret)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) return { success: false, error: data.error || 'Pull failed' };
    return { success: true, profits: data.profits || {} };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
