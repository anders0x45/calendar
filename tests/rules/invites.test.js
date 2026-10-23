/**
 * Rules tests for invites/{calId}__{inviteeUid}: owner-only creation,
 * invitee-only inbox reads, the accept flow (calendar + invite delete in
 * one batch), decline, and revoke.
 */
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { serverTimestamp } from "firebase/firestore";
import {
  loadFirebaseRulesEnv,
  dbAs,
  dbUnauth,
  withAdmin,
  seedCalendar,
  seedUser,
  seedInvite,
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
  env = await loadFirebaseRulesEnv("invites");
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
  await seedUser(admin, CAROL.uid, {
    displayName: CAROL.displayName, email: "c@x.dev", username: CAROL.username,
  });
  await seedCalendar(admin, "cal1", {
    name: "Home", ownerUid: ALICE.uid, members: [ALICE],
  });
  });
});

function invitePayload(overrides = {}) {
  return {
    calendarId: "cal1",
    calendarName: "Home",
    inviteeUid: CAROL.uid,
    inviteeUsername: CAROL.username,
    inviterName: ALICE.displayName,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

test("only the calendar owner composes invites", async () => {
  const alice = dbAs(env, ALICE.uid);
  const bob = dbAs(env, BOB.uid);
  await assertSucceeds(alice.collection("invites").doc(`cal1__${CAROL.uid}`)
    .set(invitePayload()));
  await assertFails(bob.collection("invites").doc(`cal1__${CAROL.uid}`)
    .set(invitePayload()));
});

test("the invite must name the current calendar and a real username", async () => {
  const alice = dbAs(env, ALICE.uid);
  await assertFails(alice.collection("invites").doc(`cal1__${CAROL.uid}`)
    .set(invitePayload({ calendarName: "Renamed while composing" })));
  await assertFails(alice.collection("invites").doc(`cal1__${CAROL.uid}`)
    .set(invitePayload({ inviteeUsername: "ghost_handle" })));
  await assertFails(alice.collection("invites").doc(`cal1__${ALICE.uid}`)
    .set(invitePayload({ inviteeUid: ALICE.uid, inviteeUsername: ALICE.username })));
});

test("invites are readable only by their invitee; nobody lists others", async () => {
  await withAdmin(env, async (admin) => {
    await seedInvite(admin, "cal1", {
      inviteeUid: CAROL.uid,
      inviteeUsername: CAROL.username,
      inviterName: ALICE.displayName,
      calendarName: "Home",
  });
  });
  const carol = dbAs(env, CAROL.uid);
  const bob = dbAs(env, BOB.uid);

  await assertSucceeds(carol.collection("invites").doc(`cal1__${CAROL.uid}`).get());
  await assertSucceeds(carol.collection("invites")
    .where("inviteeUid", "==", CAROL.uid).get());
  await assertFails(bob.collection("invites").doc(`cal1__${CAROL.uid}`).get());
  await assertFails(bob.collection("invites")
    .where("inviteeUid", "==", CAROL.uid).get());
  await assertFails(dbUnauth(env).collection("invites")
    .where("inviteeUid", "==", CAROL.uid).get());
});

test("accepting adds exactly the invitee as a member, joined with the invite delete", async () => {
  // The invitee cannot read the calendar they do not belong to yet (only
  // the invite, which carries the snapshot this test needs).
  let data;
  await withAdmin(env, async (admin) => {
    await seedInvite(admin, "cal1", {
      inviteeUid: CAROL.uid,
      inviteeUsername: CAROL.username,
      inviterName: ALICE.displayName,
      calendarName: "Home",
    });
    data = (await admin.collection("calendars").doc("cal1").get()).data();
  });
  const carol = dbAs(env, CAROL.uid);
  const calRef = carol.collection("calendars").doc("cal1");
  const inviteRef = carol.collection("invites").doc(`cal1__${CAROL.uid}`);

  // Without touching the invite: denied (accept branch needs the ticket).
  await assertFails(calRef.update({
    ...data,
    memberUids: [...data.memberUids, CAROL.uid],
    members: {
      ...data.members,
      [CAROL.uid]: {
        role: "member",
        displayName: CAROL.displayName,
        username: CAROL.username,
        photoURL: null,
        joinedAt: serverTimestamp(),
      },
    },
    updatedAt: serverTimestamp(),
  }));

  // Full accept batch: calendar update + invite delete.
  const batch = carol.batch();
  batch.update(calRef, {
    memberUids: [...data.memberUids, CAROL.uid],
    members: {
      ...data.members,
      [CAROL.uid]: {
        role: "member",
        displayName: CAROL.displayName,
        username: CAROL.username,
        photoURL: null,
        joinedAt: serverTimestamp(),
      },
    },
    updatedAt: serverTimestamp(),
  });
  batch.delete(inviteRef);
  await assertSucceeds(batch.commit());
});

test("the invitee entry that accepts must match their real profile", async () => {
  let data;
  await withAdmin(env, async (admin) => {
    await seedInvite(admin, "cal1", {
      inviteeUid: CAROL.uid,
      inviteeUsername: CAROL.username,
      inviterName: ALICE.displayName,
      calendarName: "Home",
    });
    data = (await admin.collection("calendars").doc("cal1").get()).data();
  });
  const carol = dbAs(env, CAROL.uid);
  const calRef = carol.collection("calendars").doc("cal1");
  const batch = carol.batch();
  batch.update(calRef, {
    memberUids: [...data.memberUids, CAROL.uid],
    members: {
      ...data.members,
      [CAROL.uid]: {
        role: "member",
        displayName: CAROL.displayName,
        username: "someone_else",
        photoURL: null,
        joinedAt: serverTimestamp(),
      },
    },
    updatedAt: serverTimestamp(),
  });
  batch.delete(carol.collection("invites").doc(`cal1__${CAROL.uid}`));
  await assertFails(batch.commit());
});

test("accepting while dragging a second phantom member is denied", async () => {
  let data;
  await withAdmin(env, async (admin) => {
    await seedInvite(admin, "cal1", {
      inviteeUid: CAROL.uid,
      inviteeUsername: CAROL.username,
      inviterName: ALICE.displayName,
      calendarName: "Home",
    });
    data = (await admin.collection("calendars").doc("cal1").get()).data();
  });
  const carol = dbAs(env, CAROL.uid);
  const calRef = carol.collection("calendars").doc("cal1");
  const batch = carol.batch();
  batch.update(calRef, {
    memberUids: [...data.memberUids, CAROL.uid, BOB.uid],
    members: {
      ...data.members,
      [CAROL.uid]: {
        role: "member",
        displayName: CAROL.displayName,
        username: CAROL.username,
        photoURL: null,
        joinedAt: serverTimestamp(),
      },
    },
    updatedAt: serverTimestamp(),
  });
  batch.delete(carol.collection("invites").doc(`cal1__${CAROL.uid}`));
  await assertFails(batch.commit());
});

test("declining deletes the invite; nobody else can remove it", async () => {
  await withAdmin(env, async (admin) => {
    await seedInvite(admin, "cal1", {
      inviteeUid: CAROL.uid,
      inviteeUsername: CAROL.username,
      inviterName: ALICE.displayName,
      calendarName: "Home",
  });
  });
  const carol = dbAs(env, CAROL.uid);
  const inviteRef = carol.collection("invites").doc(`cal1__${CAROL.uid}`);
  await assertFails(dbAs(env, BOB.uid).collection("invites")
    .doc(`cal1__${CAROL.uid}`).delete());
  await assertSucceeds(inviteRef.delete());
});

test("revoke deletes the invite; the invite survives unrelated writes", async () => {
  await withAdmin(env, async (admin) => {
    await seedInvite(admin, "cal1", {
      inviteeUid: CAROL.uid,
      inviteeUsername: CAROL.username,
      inviterName: ALICE.displayName,
      calendarName: "Home",
  });
  });
  const alice = dbAs(env, ALICE.uid);
  const inviteRef = alice.collection("invites").doc(`cal1__${CAROL.uid}`);
  // Invites are immutable tickets.
  await assertFails(inviteRef.update({ inviterName: "Scammer" }));
  await assertSucceeds(inviteRef.delete());
});
