/**
 * Firestore security rules tests — multi-tenant isolation.
 *
 * Runs against the local Firestore emulator:
 *   npm run test:rules
 * (which wraps: firebase emulators:exec --only firestore "node --test tests/firestore.rules.test.mjs")
 *
 * Also runs automatically on GitHub (.github/workflows/tests.yml).
 */

// ============================================================
// IMPORTS
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

// ============================================================
// SETUP
// ============================================================
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'eventscope-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

/** Seed two tenants, their members, one platform admin — bypassing rules. */
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'platformAdmins/admin'), { email: 'admin@eventscope.app' });
    await setDoc(doc(db, 'tenants/acme'), { name: 'Acme Events', plan: 'basic', status: 'active', ownerUid: 'alice' });
    await setDoc(doc(db, 'tenants/zen'), { name: 'Zen Weddings', plan: 'basic', status: 'active', ownerUid: 'zara' });
    await setDoc(doc(db, 'tenants/frozen'), { name: 'Frozen Co', plan: 'basic', status: 'suspended', ownerUid: 'fred' });
    await setDoc(doc(db, 'users/alice'), { tenantId: 'acme', role: 'owner' });
    await setDoc(doc(db, 'users/sam'), { tenantId: 'acme', role: 'staff' });
    await setDoc(doc(db, 'users/zara'), { tenantId: 'zen', role: 'owner' });
    await setDoc(doc(db, 'users/fred'), { tenantId: 'frozen', role: 'owner' });
    await setDoc(doc(db, 'invites/newhire@gmail.com'), { tenantId: 'acme', role: 'staff', invitedBy: 'alice' });
    for (const t of ['acme', 'zen', 'frozen']) {
      await setDoc(doc(db, `tenants/${t}/events/e1`), { clientName: `${t} client` });
      await setDoc(doc(db, `tenants/${t}/config/settings`), { companyName: t });
    }
  });
});

const as = (uid, email) => env.authenticatedContext(uid, email ? { email, email_verified: true } : {}).firestore();
const asUnverified = (uid, email) => env.authenticatedContext(uid, { email, email_verified: false }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// ============================================================
// ISOLATION — no cross-tenant access
// ============================================================
test('member reads own tenant events', async () => {
  await assertSucceeds(getDocs(collection(as('alice'), 'tenants/acme/events')));
  await assertSucceeds(getDocs(collection(as('sam'), 'tenants/acme/events')));
});

test('member CANNOT read another tenant', async () => {
  await assertFails(getDoc(doc(as('alice'), 'tenants/zen/events/e1')));
  await assertFails(getDocs(collection(as('alice'), 'tenants/zen/events')));
  await assertFails(getDoc(doc(as('alice'), 'tenants/zen/config/settings')));
  await assertFails(getDoc(doc(as('alice'), 'tenants/zen')));
});

test('member CANNOT write into another tenant', async () => {
  await assertFails(setDoc(doc(as('alice'), 'tenants/zen/events/x'), { clientName: 'sneaky' }));
  await assertFails(setDoc(doc(as('alice'), 'tenants/zen/config/settings'), { companyName: 'hijack' }));
});

test('signed-out and unlinked logins get nothing', async () => {
  await assertFails(getDoc(doc(anon(), 'tenants/acme/events/e1')));
  await assertFails(getDoc(doc(as('stranger'), 'tenants/acme/events/e1')));
  await assertFails(setDoc(doc(as('stranger'), 'tenants/acme/events/x'), {}));
});

// ============================================================
// ROLES — owner vs staff
// ============================================================
test('staff can create/edit/delete events', async () => {
  const db = as('sam');
  await assertSucceeds(setDoc(doc(db, 'tenants/acme/events/s1'), { clientName: 'by staff' }));
  await assertSucceeds(updateDoc(doc(db, 'tenants/acme/events/s1'), { clientName: 'edited' }));
  await assertSucceeds(deleteDoc(doc(db, 'tenants/acme/events/s1')));
});

test('staff can read but NOT change settings/categories', async () => {
  const db = as('sam');
  await assertSucceeds(getDoc(doc(db, 'tenants/acme/config/settings')));
  await assertFails(setDoc(doc(db, 'tenants/acme/config/settings'), { companyName: 'x' }));
  await assertFails(setDoc(doc(db, 'tenants/acme/config/categories'), { list: [] }));
});

test('owner can change settings', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'tenants/acme/config/settings'), { companyName: 'Acme 2' }));
});

// ============================================================
// PLATFORM-CONTROLLED FIELDS — plan/status, membership
// ============================================================
test('owner CANNOT change own plan or status', async () => {
  await assertFails(updateDoc(doc(as('alice'), 'tenants/acme'), { plan: 'premium' }));
  await assertFails(updateDoc(doc(as('fred'), 'tenants/frozen'), { status: 'active' }));
});

test('users CANNOT move themselves to another tenant or promote themselves', async () => {
  await assertFails(updateDoc(doc(as('sam'), 'users/sam'), { role: 'owner' }));
  await assertFails(updateDoc(doc(as('sam'), 'users/sam'), { tenantId: 'zen' }));
  await assertFails(setDoc(doc(as('stranger'), 'users/stranger'), { tenantId: 'acme', role: 'owner' }));
});

test('users CANNOT make themselves platform admins', async () => {
  await assertFails(setDoc(doc(as('alice'), 'platformAdmins/alice'), {}));
});

test('owner can see own team, not other tenants’ members', async () => {
  await assertSucceeds(getDoc(doc(as('alice'), 'users/sam')));
  await assertFails(getDoc(doc(as('alice'), 'users/zara')));
  await assertFails(getDoc(doc(as('sam'), 'users/alice'))); // staff can't browse team
});

// ============================================================
// SUSPENSION — read-only
// ============================================================
test('suspended tenant can read but not write', async () => {
  const db = as('fred');
  await assertSucceeds(getDoc(doc(db, 'tenants/frozen/events/e1')));
  await assertFails(setDoc(doc(db, 'tenants/frozen/events/new'), { clientName: 'x' }));
  await assertFails(setDoc(doc(db, 'tenants/frozen/config/settings'), { companyName: 'x' }));
});

// ============================================================
// PLATFORM ADMIN
// ============================================================
test('platform admin can see and manage every tenant', async () => {
  const db = as('admin');
  await assertSucceeds(getDoc(doc(db, 'tenants/zen')));
  await assertSucceeds(getDocs(collection(db, 'tenants')));
  await assertSucceeds(updateDoc(doc(db, 'tenants/frozen'), { status: 'active' }));
  await assertSucceeds(updateDoc(doc(db, 'tenants/acme'), { plan: 'premium' }));
  await assertSucceeds(setDoc(doc(db, 'users/newbie'), { tenantId: 'acme', role: 'staff' }));
});

test('non-admins CANNOT list all tenants', async () => {
  await assertFails(getDocs(collection(as('alice'), 'tenants')));
});

// ============================================================
// TEAM INVITES
// ============================================================
test('owner can invite staff to own tenant, and cancel', async () => {
  const db = as('alice');
  await assertSucceeds(setDoc(doc(db, 'invites/friend@gmail.com'), { tenantId: 'acme', role: 'staff' }));
  await assertSucceeds(deleteDoc(doc(db, 'invites/friend@gmail.com')));
});

test('owner CANNOT invite into another tenant, or as owner', async () => {
  await assertFails(setDoc(doc(as('alice'), 'invites/x@gmail.com'), { tenantId: 'zen', role: 'staff' }));
  await assertFails(setDoc(doc(as('alice'), 'invites/x@gmail.com'), { tenantId: 'acme', role: 'owner' }));
});

test('owner CANNOT hijack another tenant\u2019s pending invite', async () => {
  await assertFails(setDoc(doc(as('zara'), 'invites/newhire@gmail.com'), { tenantId: 'zen', role: 'staff' }));
  await assertFails(deleteDoc(doc(as('zara'), 'invites/newhire@gmail.com')));
});

test('staff and suspended owners CANNOT invite', async () => {
  await assertFails(setDoc(doc(as('sam'), 'invites/y@gmail.com'), { tenantId: 'acme', role: 'staff' }));
  await assertFails(setDoc(doc(as('fred'), 'invites/y@gmail.com'), { tenantId: 'frozen', role: 'staff' }));
});

test('platform admin can invite owners and staff (e.g. Import company)', async () => {
  const db = as('admin');
  await assertSucceeds(setDoc(doc(db, 'invites/boss@gmail.com'), { tenantId: 'zen', role: 'owner' }));
  await assertSucceeds(setDoc(doc(db, 'invites/helper@gmail.com'), { tenantId: 'zen', role: 'staff' }));
  await assertFails(setDoc(doc(db, 'invites/Mixed@gmail.com'), { tenantId: 'zen', role: 'owner' }));
  await assertFails(setDoc(doc(db, 'invites/god@gmail.com'), { tenantId: 'zen', role: 'admin' }));
});

test('an owner invited by the admin joins as owner — and only as owner', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'invites/boss@gmail.com'), { tenantId: 'zen', role: 'owner' }));
  const db = as('boss', 'boss@gmail.com');
  await assertFails(setDoc(doc(db, 'users/boss'), { tenantId: 'acme', role: 'owner' }));
  await assertSucceeds(setDoc(doc(db, 'users/boss'), { tenantId: 'zen', role: 'owner', name: 'B', email: 'boss@gmail.com', joinedAt: 'x' }));
});

test('owners still CANNOT invite other owners', async () => {
  await assertFails(setDoc(doc(as('zara'), 'invites/co@gmail.com'), { tenantId: 'zen', role: 'owner' }));
  await assertFails(updateDoc(doc(as('alice'), 'invites/newhire@gmail.com'), { role: 'owner' }));
});

test('invitee with verified email can join via invite', async () => {
  const db = as('newbie', 'NewHire@gmail.com');
  await assertSucceeds(getDoc(doc(db, 'invites/newhire@gmail.com')));
  await assertSucceeds(setDoc(doc(db, 'users/newbie'), { tenantId: 'acme', role: 'staff', name: 'N', email: 'newhire@gmail.com', joinedAt: 'x' }));
  await assertSucceeds(deleteDoc(doc(db, 'invites/newhire@gmail.com')));
});

test('invitee CANNOT upgrade role or switch tenant while joining', async () => {
  const db = as('newbie', 'newhire@gmail.com');
  await assertFails(setDoc(doc(db, 'users/newbie'), { tenantId: 'acme', role: 'owner' }));
  await assertFails(setDoc(doc(db, 'users/newbie'), { tenantId: 'zen', role: 'staff' }));
});

test('someone else CANNOT use an invite that isn\u2019t theirs', async () => {
  await assertFails(getDoc(doc(as('stranger', 'stranger@gmail.com'), 'invites/newhire@gmail.com')));
  await assertFails(setDoc(doc(as('stranger', 'stranger@gmail.com'), 'users/stranger'), { tenantId: 'acme', role: 'staff' }));
  // unverified email claiming the invited address
  await assertFails(setDoc(doc(asUnverified('faker', 'newhire@gmail.com'), 'users/faker'), { tenantId: 'acme', role: 'staff' }));
});

test('owner can remove staff, but not self or other tenants\u2019 members', async () => {
  await assertFails(deleteDoc(doc(as('alice'), 'users/alice')));
  await assertFails(deleteDoc(doc(as('alice'), 'users/zara')));
  await assertFails(deleteDoc(doc(as('sam'), 'users/alice')));
  await assertSucceeds(deleteDoc(doc(as('alice'), 'users/sam')));
});

test('owner can list own team and invites', async () => {
  const { query, where } = await import('firebase/firestore');
  await assertSucceeds(getDocs(query(collection(as('alice'), 'users'), where('tenantId', '==', 'acme'))));
  await assertSucceeds(getDocs(query(collection(as('alice'), 'invites'), where('tenantId', '==', 'acme'))));
  await assertFails(getDocs(query(collection(as('alice'), 'users'), where('tenantId', '==', 'zen'))));
});

// ============================================================
// PUBLIC SIGN-UP
// ============================================================
const signupBatch = async (db, uid, tenantId, tenant = {}, user = {}, { withUser = true, withContact = true } = {}) => {
  const { writeBatch } = await import('firebase/firestore');
  const b = writeBatch(db);
  b.set(doc(db, `tenants/${tenantId}`), { name: 'New Co', ownerUid: uid, ownerEmail: 'n@gmail.com', plan: 'trial', status: 'active', createdAt: 'x', acceptedTermsAt: 'x', ...tenant });
  if (withUser) b.set(doc(db, `users/${uid}`), { tenantId, role: 'owner', name: 'N', email: 'n@gmail.com', joinedAt: 'x', ...user });
  if (withContact) b.set(doc(db, `tenants/${tenantId}/private/contact`), { phone: '900', recoveryEmail: 'backup@gmail.com' });
  return b.commit();
};

test('a new verified user can create their own company and become owner', async () => {
  const db = as('newco', 'n@gmail.com');
  await assertSucceeds(signupBatch(db, 'newco', 'newco-1'));
  await assertSucceeds(setDoc(doc(db, 'tenants/newco-1/config/settings'), { companyName: 'New Co' }));
});

test('sign-up CANNOT start on a paid plan, suspended, or owned by someone else', async () => {
  await assertFails(signupBatch(as('u1', 'a@gmail.com'), 'u1', 't1', { plan: 'premium' }));
  await assertFails(signupBatch(as('u2', 'b@gmail.com'), 'u2', 't2', { ownerUid: 'someoneelse' }));
});

test('sign-up CANNOT take over an existing company', async () => {
  await assertFails(signupBatch(as('u3', 'c@gmail.com'), 'u3', 'acme'));
});

test('existing members CANNOT create a second company', async () => {
  await assertFails(signupBatch(as('alice', 'alice@gmail.com'), 'alice', 'alice-2'));
});

test('unverified emails CANNOT sign up', async () => {
  await assertFails(signupBatch(asUnverified('u4', 'd@gmail.com'), 'u4', 't4'));
});

test('sign-up CANNOT create an orphan company (no owner link in the same batch)', async () => {
  await assertFails(signupBatch(as('u5', 'e@gmail.com'), 'u5', 't5', {}, {}, { withUser: false }));
});

test('sign-up CANNOT put extra fields on the company (e.g. contact details)', async () => {
  await assertFails(signupBatch(as('u6', 'f@gmail.com'), 'u6', 't6', { recoveryEmail: 'x@gmail.com' }));
});

// ============================================================
// OWNER'S PRIVATE CONTACT (backup email / phone)
// ============================================================
test('owner and admin can read the private contact; staff and others cannot', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tenants/acme/private/contact'), { phone: '900', recoveryEmail: 'b@gmail.com' });
  });
  await assertSucceeds(getDoc(doc(as('alice'), 'tenants/acme/private/contact')));
  await assertSucceeds(getDoc(doc(as('admin'), 'tenants/acme/private/contact')));
  await assertFails(getDoc(doc(as('sam'), 'tenants/acme/private/contact')));
  await assertFails(getDoc(doc(as('zara'), 'tenants/acme/private/contact')));
});

test('nobody can plant a contact record on an existing company', async () => {
  await assertFails(setDoc(doc(as('zara', 'zara@gmail.com'), 'tenants/acme/private/contact'), { phone: '1', recoveryEmail: 'evil@gmail.com' }));
  await assertFails(setDoc(doc(as('sam'), 'tenants/acme/private/contact'), { phone: '1', recoveryEmail: 'evil@gmail.com' }));
});

// ============================================================
// JOB LOG DATA
// ============================================================
test('members can read/write own Job Log data; other tenants cannot', async () => {
  await assertSucceeds(setDoc(doc(as('sam'), 'tenants/acme/financials/e1'), { values: { labour: 100 } }));
  await assertSucceeds(getDoc(doc(as('alice'), 'tenants/acme/financials/e1')));
  await assertFails(getDoc(doc(as('zara'), 'tenants/acme/financials/e1')));
  await assertFails(setDoc(doc(as('zara'), 'tenants/acme/financials/e1'), { values: { labour: 1 } }));
  await assertFails(setDoc(doc(as('fred'), 'tenants/frozen/financials/e1'), { values: { labour: 1 } }));
});

test('only the owner can change Job Log columns', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'tenants/acme/config/jobLog'), { columns: [] }));
  await assertFails(setDoc(doc(as('sam'), 'tenants/acme/config/jobLog'), { columns: [] }));
});
