/**
 * Rules tests for calendars/{calId}/events/{eventId}: member visibility,
 * owner-vs-creator write authority, immutable stamps, and the full event
 * validation matrix (shapes, recurrence bounds, image-status pairing).
 */
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { where, serverTimestamp } from "firebase/firestore";
import {
  loadFirebaseRulesEnv,
  dbAs,
  dbUnauth,
  withAdmin,
  seedCalendar,
  seedUser,
  seedEvent,
  userWriteEvent,
} from "./env.js";

const ALICE = {
  uid: "uid-alice", displayName: "Alice", username: "alice_x", role: "owner",
};
const BOB = {
  uid: "uid-bob", displayName: "Bob", username: "bob_name", role: "member",
};

let env;

before(async () => {
  env = await loadFirebaseRulesEnv("events");
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await withAdmin(env, async (admin) => {
    await seedUser(admin, ALICE.uid, {
      displayName: ALICE.displayName, email: "a@x.dev", username: ALICE.username,
  });
  await seedUser(admin, BOB.uid, {
    displayName: BOB.displayName, email: "b@x.dev", username: BOB.username,
  });
  await seedCalendar(admin, "cal1", {
    name: "Home", ownerUid: ALICE.uid, members: [ALICE, BOB],
  });
  });
});

async function seedAndSetDefaults(eventId, overrides = {}) {
  await withAdmin(env, async (admin) => {
    return seedEvent(admin, "cal1", eventId, { createdBy: ALICE.uid, ...overrides });
  });
}

test("members read events; non-members cannot", async () => {
  await seedAndSetDefaults("e1");
  await seedAndSetDefaults("r1", {
    recurrence: { freq: "weekly", interval: 1 },
  });
  const alice = dbAs(env, ALICE.uid);
  const bob = dbAs(env, BOB.uid);
  const carol = dbAs(env, "uid-carol");
  const unauth = dbUnauth(env);
  const eventsRef = alice.collection("calendars").doc("cal1").collection("events");

  await assertSucceeds(eventsRef.doc("e1").get());
  await assertSucceeds(bob.collection("calendars").doc("cal1")
    .collection("events").doc("r1").get());

  // Live listener shapes used by the app.
  await assertSucceeds(eventsRef.where("isRecurring", "==", false).get());
  await assertSucceeds(eventsRef.where("isRecurring", "==", true).get());

  await assertFails(carol.collection("calendars").doc("cal1")
    .collection("events").doc("e1").get());
  await assertFails(carol.collection("calendars").doc("cal1")
    .collection("events").where("isRecurring", "==", true).get());
  await assertFails(unauth.collection("calendars").doc("cal1")
    .collection("events").doc("e1").get());
});

test("the app's event listeners: windowed non-recurring query with date range", async () => {
  await seedAndSetDefaults("e1", { date: "2026-01-05" });
  await seedAndSetDefaults("e2", { date: "2026-02-20" });
  const bob = dbAs(env, BOB.uid);
  const eventsRef = bob.collection("calendars").doc("cal1").collection("events");
  const snap = await eventsRef
    .where("isRecurring", "==", false)
    .where("date", ">=", "2026-01-01")
    .where("date", "<=", "2026-01-31")
    .get();
  assert.deepEqual(snap.docs.map((d) => d.id), ["e1"]);
});

test("members create events; creator stamp is forced", async () => {
  const bob = dbAs(env, BOB.uid);
  const eventsRef = bob.collection("calendars").doc("cal1").collection("events");
  await assertSucceeds(eventsRef.doc("e-new").set(
    userWriteEvent(BOB.uid),
  ));
  await assertFails(eventsRef.doc("e-spoof").set(
    userWriteEvent("uid-carol"),
  ));
});

test("update authority: creator or owner only", async () => {
  await seedAndSetDefaults("bob-e1", { createdBy: BOB.uid });
  const alice = dbAs(env, ALICE.uid);
  const bob = dbAs(env, BOB.uid);
  const carol = dbAs(env, "uid-carol");

  // Alice is not a member, so she cannot even attempt the write.
  const bobEvents = bob.collection("calendars").doc("cal1").collection("events");
  await assertSucceeds(bobEvents.doc("bob-e1").update({
    title: "Bob edits his own",
    updatedAt: serverTimestamp(),
  }));
  await assertFails(carol.collection("calendars").doc("cal1")
    .collection("events").doc("bob-e1").get());
  void carol;

  // Owner may edit a member's event.
  await assertSucceeds(alice.collection("calendars").doc("cal1")
    .collection("events").doc("bob-e1").update({
      title: "Owner touch-up", updatedAt: serverTimestamp(),
    }));
});

test("only the creator or the owner deletes; others cannot", async () => {
  await seedAndSetDefaults("alice-e1", { createdBy: ALICE.uid });
  const bob = dbAs(env, BOB.uid);
  const alice = dbAs(env, ALICE.uid);
  const bobEvents = bob.collection("calendars").doc("cal1").collection("events");

  // Member cannot delete someone else's event.
  await assertFails(bobEvents.doc("alice-e1").delete());
  // Owner deletes anything.
  await assertSucceeds(alice.collection("calendars").doc("cal1")
    .collection("events").doc("alice-e1").delete());
});

test("createdAt is immutable and updatedAt must advance", async () => {
  await seedAndSetDefaults("e1", { createdBy: BOB.uid });
  const bob = dbAs(env, BOB.uid);
  const bobEvents = bob.collection("calendars").doc("cal1").collection("events");
  await assertSucceeds(bobEvents.doc("e1").update({
    title: "ok", updatedAt: serverTimestamp(),
  }));
  await assertFails(bobEvents.doc("e1").update({ title: "stale time" }));
  await assertFails(bobEvents.doc("e1").update({
    title: "created forged", createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
});

function invalidEventCase(name, overrides) {
  test(`invalid events are denied: ${name}`, async () => {
    const bob = dbAs(env, BOB.uid);
    const eventsRef = bob.collection("calendars").doc("cal1")
      .collection("events");
    await assertFails(eventsRef.doc("e-bad").set(
      userWriteEvent(BOB.uid, overrides),
    ));
  });
}

invalidEventCase("empty title", { title: "" });
invalidEventCase("overlong title", { title: "x".repeat(81) });
invalidEventCase("unknown color", { color: "magenta" });
invalidEventCase("bad date shape", { date: "2026-13-40" });
invalidEventCase("bad time shape", { time: "25:00" });
validEventCase("with http link", { locationLink: "http://watch.party/x" });
invalidEventCase("non-http scheme link", { locationLink: "javascript:alert(1)" });
invalidEventCase("empty link", { locationLink: "" });
invalidEventCase("extra key", { hacker: true });
invalidEventCase("bad imageStatus", { imageStatus: "loading" });
invalidEventCase("bad timezone shape", { timezone: "not a tz!" });
invalidEventCase("isRecurring mismatch: yes/null", {
  isRecurring: true,
  recurrence: null,
});
invalidEventCase("isRecurring mismatch: no/recurrence", {
  isRecurring: false,
  recurrence: { freq: "daily", interval: 1 },
});
invalidEventCase("bad recurrence freq", {
  recurrence: { freq: "minutely", interval: 1 },
});
invalidEventCase("recurrence interval above 365", {
  recurrence: { freq: "daily", interval: 366 },
});
invalidEventCase("recurrence interval zero", {
  recurrence: { freq: "daily", interval: 0 },
});
invalidEventCase("bad recurrence until", {
  recurrence: { freq: "daily", interval: 1, until: "01-01-2027" },
});
invalidEventCase("bad recurrence exceptions", {
  recurrence: { freq: "daily", interval: 1, exceptions: ["nope"] },
});
invalidEventCase("recurrence with extra key", {
  recurrence: { freq: "daily", interval: 1, lucky: 7 },
});
invalidEventCase("ready image without a request stamp", {
  imageStatus: "ready",
  imageUpdatedAt: serverTimestamp(),
});
invalidEventCase("stamped request but no-pending status", {
  imageRequestedAt: serverTimestamp(),
});

function validEventCase(name, overrides) {
  test(`valid events are accepted: ${name}`, async () => {
    const bob = dbAs(env, BOB.uid);
    const eventsRef = bob.collection("calendars").doc("cal1")
      .collection("events");
    await assertSucceeds(eventsRef.doc(`e-ok-${name.replace(/\W+/g, "-")}`)
      .set(userWriteEvent(BOB.uid, overrides)));
  });
}

validEventCase("everything-null", {});
validEventCase("timed event", { time: "09:30", timezone: "Asia/Manila" });
validEventCase("with link", { locationLink: "https://watch.party/x" });
validEventCase("recurring 365", {
  isRecurring: true,
  recurrence: {
    freq: "yearly", interval: 365,
    until: "2100-12-31", exceptions: ["2027-01-01"],
  },
});
validEventCase("pending art", {
  imageStatus: "pending", imageRequestedAt: serverTimestamp(),
});
validEventCase("ready art", {
  imageStatus: "ready", imageRequestedAt: serverTimestamp(),
  imageUpdatedAt: serverTimestamp(),
});
