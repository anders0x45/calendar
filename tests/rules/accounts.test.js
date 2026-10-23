/**
 * The Phase F2 client write patterns (js/data/accounts.js) exercised
 * against the real rules: profile bootstrap, the atomic claim batch
 * (usernames + users + default calendar) and the race behavior that
 * keeps two accounts from claiming the same handle.
 */

import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  loadFirebaseRulesEnv,
  dbAs,
  withAdmin,
  serverTimestamp,
} from "./env.js";

/** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
let env;

before(async () => {
  env = await loadFirebaseRulesEnv("accounts");
});

after(async () => {
  await env.cleanup();
});

/** Private uid mirrors (no token.customClaims needed). */
const ALICE = { uid: "user_alice", email: "alice@mail.com" };
const BOB = { uid: "user_bob", email: "bob@mail.com" };

/**
 * The users/{uid} bootstrap write of ensureUserProfile().
 * @param {string} uid
 */
function profilePayload(uid) {
  const email = uid === ALICE.uid ? ALICE.email : BOB.email;
  return {
    displayName: email.split("@")[0],
    email,
    photoURL: null,
    username: null,
    createdAt: serverTimestamp(),
    settings: { weekStartsOn: 1, lastView: "month", activeCalendarId: null },
  };
}

/**
 * The completeOnboarding() batch: usernames/{name} + users/{uid} flip +
 * default calendar, all in one commit — exactly the client's shape:
 * partial users update, never a re-set of the existing profile doc.
 * @param {string} uid
 * @param {string} username
 * @param {string} calId
 */
async function runClaim(db, uid, username, calId) {
  const displayName = uid === ALICE.uid ? "alice" : "bob";
  const batch = db.batch();
  batch.set(db.collection("usernames").doc(username), {
    uid,
    displayName,
    photoURL: null,
    createdAt: serverTimestamp(),
  });
  batch.update(db.collection("users").doc(uid), {
    username,
    settings: { weekStartsOn: 1, lastView: "month", activeCalendarId: calId },
  });
  batch.set(db.collection("calendars").doc(calId), {
    name: "My calendar",
    ownerUid: uid,
    memberUids: [uid],
    members: {
      [uid]: {
        role: "owner",
        displayName,
        username,
        photoURL: null,
        joinedAt: serverTimestamp(),
      },
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
}

/** The bootstrap write as its own committed call (like the app flow). */
async function bootstrap(db, uid) {
  await db.collection("users").doc(uid).set(profilePayload(uid));
}

beforeEach(async () => {
  await env.clearFirestore();
});

test("bootstrap: a fresh profile with username null is accepted", async () => {
  await bootstrap(dbAs(env, ALICE.uid), ALICE.uid);
});

test("claim batch: profile + usernames + calendar in one commit", async () => {
  const alice = dbAs(env, ALICE.uid);
  await bootstrap(alice, ALICE.uid);

  await runClaim(alice, ALICE.uid, "alice_h", "cal_a1");
  const claimed = (await alice.collection("users").doc(ALICE.uid).get()).data();
  assert.equal(claimed.username, "alice_h");
  assert.equal(claimed.settings.activeCalendarId, "cal_a1");
  const cal = (await alice.collection("calendars").doc("cal_a1").get()).data();
  assert.equal(cal.members[ALICE.uid].role, "owner");
});

test("claim without an existing profile (skipping bootstrap) is denied", async () => {
  const bob = dbAs(env, BOB.uid);
  await assertFails(() =>
    runClaim(bob, BOB.uid, "bob_h", "cal_b1"));
});

test("a race for the same username: only the first claim wins", async () => {
  const alice = dbAs(env, ALICE.uid);
  const bob = dbAs(env, BOB.uid);
  await bootstrap(alice, ALICE.uid);
  await bootstrap(bob, BOB.uid);

  // First writer commits…
  await runClaim(alice, ALICE.uid, "same_name", "cal_a1");
  // …and the identical second claim is denied (username doc exists; the
  // users-update claim branch would fail getAfter anyway).
  await assertFails(() => runClaim(bob, BOB.uid, "same_name", "cal_b1"));

  const bobDoc = (await bob.collection("users").doc(BOB.uid).get()).data();
  assert.equal(bobDoc.username, null, "bob never claimed");
  let nobodyExists = true;
  await withAdmin(env, async (admin) => {
    const loser = await admin.collection("calendars").doc("cal_b1").get();
    nobodyExists = !loser.exists;
  });
  assert.ok(nobodyExists, "no phantom calendar for the loser");
});

/* Small local helper matching the other suites' idioms. */
async function assertFails(op) {
  let failed = false;
  try {
    await op();
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("Expected request to fail, but it succeeded.");
}
