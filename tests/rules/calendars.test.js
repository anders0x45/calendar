/**
 * Rules tests for calendars/{calId}: creation, visibility, owner
 * management, leaving, and deletion. Invite-gated joining lives in
 * invites.test.js.
 */
import { before, after, beforeEach, test } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  loadFirebaseRulesEnv,
  dbAs,
  dbUnauth,
  withAdmin,
  seedCalendar,
  seedUser,
  serverTimestamp,
} from "./env.js";

const ALICE = {
  uid: "uid-alice", displayName: "Alice", username: "alice_x", role: "owner",
};
const BOB = {
  uid: "uid-bob", displayName: "Bob", username: "bob_name", role: "member",
};
const CAROL = {
  uid: "uid-carol", displayName: "Carol", username: "carol_q", role: "member",
};

let env;

before(async () => {
  env = await loadFirebaseRulesEnv("calendars");
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
});

function memberEntry(m, joinedAt = serverTimestamp()) {
  return {
    role: m.role,
    displayName: m.displayName,
    username: m.username,
    photoURL: null,
    joinedAt,
  };
}

function freshCalendar(insert, { ownerUid, name, memberUids, members }) {
  return insert.set({
    name,
    ownerUid,
    memberUids,
    members,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

test("creating a calendar is allowed with self as sole owner-member", async () => {
  const alice = dbAs(env, ALICE.uid);
  await assertSucceeds(freshCalendar(
    alice.collection("calendars").doc("cal-new"),
    {
      ownerUid: ALICE.uid,
      name: "Home",
      memberUids: [ALICE.uid],
      members: { [ALICE.uid]: memberEntry(ALICE) },
    },
  ));
});

test("calendar creation shape is validated", async () => {
  const alice = dbAs(env, ALICE.uid);
  const ref = alice.collection("calendars").doc("cal-fake");

  await assertFails(freshCalendar(ref, {
    ownerUid: "uid-else",
    name: "Sneaky",
    memberUids: [ALICE.uid],
    members: { [ALICE.uid]: memberEntry(ALICE) },
  }));
  await assertFails(freshCalendar(ref, {
    ownerUid: ALICE.uid,
    name: "",
    memberUids: [ALICE.uid],
    members: { [ALICE.uid]: memberEntry(ALICE) },
  }));
  await assertFails(freshCalendar(ref, {
    ownerUid: ALICE.uid,
    name: "x".repeat(61),
    memberUids: [ALICE.uid],
    members: { [ALICE.uid]: memberEntry(ALICE) },
  }));
  await assertFails(freshCalendar(ref, {
    ownerUid: ALICE.uid,
    name: "Home",
    memberUids: ["uid-else"],
    members: { [ALICE.uid]: memberEntry(ALICE) },
  }));
  await assertFails(freshCalendar(ref, {
    ownerUid: ALICE.uid,
    name: "Home",
    memberUids: [ALICE.uid],
    members: { [ALICE.uid]: { ...memberEntry(ALICE), hacker: 1 } },
  }));
});

test("calendars are readable only by members", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, ALICE.uid, { displayName: ALICE.displayName, email: "a@x.dev", username: ALICE.username });
    await seedUser(admin, BOB.uid, { displayName: BOB.displayName, email: "b@x.dev", username: BOB.username });
    await seedCalendar(admin, "cal1", {
      name: "Home", ownerUid: ALICE.uid, members: [ALICE, BOB],
  });
  });
  const alice = dbAs(env, ALICE.uid);
  const bob = dbAs(env, BOB.uid);
  const unauth = dbUnauth(env);
  await assertSucceeds(alice.collection("calendars").doc("cal1").get());
  await assertSucceeds(bob.collection("calendars").doc("cal1").get());
  await assertFails(alice.collection("calendars").doc("cal-nope").get());
  await assertFails(alice.collection("calendars")
    .where("memberUids", "array-contains", "uid-else").get());
  await assertFails(unauth.collection("calendars").doc("cal1").get());
  await assertFails(unauth.collection("calendars")
    .where("memberUids", "array-contains", ALICE.uid).get());
});

test("owner manages membership; members cannot reshape the calendar", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, ALICE.uid, { displayName: ALICE.displayName, email: "a@x.dev", username: ALICE.username });
    await seedUser(admin, BOB.uid, { displayName: BOB.displayName, email: "b@x.dev", username: BOB.username });
    await seedUser(admin, CAROL.uid, { displayName: CAROL.displayName, email: "c@x.dev", username: CAROL.username });
    await seedCalendar(admin, "cal1", {
      name: "Home", ownerUid: ALICE.uid, members: [ALICE, BOB, CAROL],
  });
  });
  const alice = dbAs(env, ALICE.uid);
  const bob = dbAs(env, BOB.uid);
  const calRef = alice.collection("calendars").doc("cal1");
  const data = (await calRef.get()).data();

  // Rename: owner yes...
  await assertSucceeds(calRef.update({
    ...data, name: "Home base", updatedAt: serverTimestamp(),
  }));
  // ...member no.
  await assertFails(bob.collection("calendars").doc("cal1").update({
    ...data, name: "not mine", updatedAt: serverTimestamp(),
  }));
  // Owner kicks Bob: yes, uid counts and member entries stay in sync.
  await assertSucceeds(calRef.update({
    ...data,
    memberUids: [ALICE.uid, CAROL.uid],
    members: {
      [ALICE.uid]: data.members[ALICE.uid],
      [CAROL.uid]: data.members[CAROL.uid],
    },
    updatedAt: serverTimestamp(),
  }));
  // Owner shrinks the calendar to nobody: no.
  await assertFails(calRef.update({
    ...data,
    memberUids: [],
    members: {},
    updatedAt: serverTimestamp(),
  }));
});

test("owner identity and creation stamps are immutable", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, ALICE.uid, { displayName: ALICE.displayName, email: "a@x.dev", username: ALICE.username });
    await seedUser(admin, BOB.uid, { displayName: BOB.displayName, email: "b@x.dev", username: BOB.username });
    await seedCalendar(admin, "cal1", {
      name: "Home", ownerUid: ALICE.uid, members: [ALICE, BOB],
  });
  });
  const alice = dbAs(env, ALICE.uid);
  const calRef = alice.collection("calendars").doc("cal1");
  const data = (await calRef.get()).data();

  await assertFails(calRef.update({
    ...data, ownerUid: BOB.uid, updatedAt: serverTimestamp(),
  }));
  await assertFails(calRef.update({
    ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(calRef.update({
    ...data, updatedAt: serverTimestamp(), mystery: 1,
  }));
});

test("members can leave; the owner cannot", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, ALICE.uid, { displayName: ALICE.displayName, email: "a@x.dev", username: ALICE.username });
    await seedUser(admin, BOB.uid, { displayName: BOB.displayName, email: "b@x.dev", username: BOB.username });
    await seedUser(admin, CAROL.uid, { displayName: CAROL.displayName, email: "c@x.dev", username: CAROL.username });
    await seedCalendar(admin, "cal1", {
      name: "Home", ownerUid: ALICE.uid, members: [ALICE, BOB, CAROL],
  });
  });
  const bob = dbAs(env, BOB.uid);
  const calRef = bob.collection("calendars").doc("cal1");
  const data = (await calRef.get()).data();

  // Correct leave.
  await assertSucceeds(calRef.update({
    ...data,
    memberUids: [ALICE.uid, CAROL.uid],
    members: {
      [ALICE.uid]: data.members[ALICE.uid],
      [CAROL.uid]: data.members[CAROL.uid],
    },
    updatedAt: serverTimestamp(),
  }));

  // Leaving while keeping your own members entry in place: no (uid counts
  // and entry keys must stay in sync). NB: rules cannot verify the exact
  // CONTENT of other members' entries during a leave — an accepted app
  // limitation, since entries only carry sharing-display data.
  await withAdmin(env, (admin) =>
    seedCalendar(admin, "cal2", {
      name: "Office", ownerUid: ALICE.uid, members: [ALICE, BOB, CAROL],
    }));
  const cal2 = bob.collection("calendars").doc("cal2");
  const d2 = (await cal2.get()).data();
  await assertFails(cal2.update({
    ...d2,
    memberUids: [ALICE.uid, CAROL.uid],
    members: d2.members,
    updatedAt: serverTimestamp(),
  }));

  // The owner cannot abandon their own calendar.
  await withAdmin(env, (admin) =>
    seedCalendar(admin, "cal3", {
      name: "Mine", ownerUid: BOB.uid, members: [ALICE, BOB],
    }));
  const ownerRef = dbAs(env, BOB.uid).collection("calendars").doc("cal3");
  const d3 = (await ownerRef.get()).data();
  await assertFails(ownerRef.update({
    ...d3,
    memberUids: [ALICE.uid],
    members: { [ALICE.uid]: d3.members[ALICE.uid] },
    updatedAt: serverTimestamp(),
  }));
});

test("only the owner deletes the calendar", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, ALICE.uid, { displayName: ALICE.displayName, email: "a@x.dev", username: ALICE.username });
    await seedUser(admin, BOB.uid, { displayName: BOB.displayName, email: "b@x.dev", username: BOB.username });
    await seedCalendar(admin, "cal1", {
      name: "Home", ownerUid: ALICE.uid, members: [ALICE, BOB],
  });
  });
  const bob = dbAs(env, BOB.uid);
  await assertFails(bob.collection("calendars").doc("cal1").delete());
  await assertSucceeds(
    dbAs(env, ALICE.uid).collection("calendars").doc("cal1").delete(),
  );
});
