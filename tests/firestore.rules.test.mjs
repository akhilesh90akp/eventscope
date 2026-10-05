/**
 * Firestore security rules tests — multi-tenant isolation.
 *
 * Runs against the local Firestore emulator:
 *   npm run test:rules
 * (which wraps: firebase emulators:exec --only firestore "node --test tests/")
 *
 * Also runs automatically on GitHub (.github/workflows/test-rules.yml).
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
    for (const t of ['acme', 'zen', 'frozen']) {
      await setDoc(doc(db, `tenants/${t}/events/e1`), { clientName: `${t} client` });
      await setDoc(doc(db, `tenants/${t}/config/settings`), { companyName: t });
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
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
