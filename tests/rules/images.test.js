/**
 * Rules tests for calendars/{calId}/images/{eventId}: member visibility,
 * creator-only uploads, the 256KB blob cap, and deletion authority.
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
  seedEvent,
  imageBytes,
} from "./env.js";

const ALICE = {
  uid: "uid-alice", displayName: "Alice", username: "alice_x", role: "owner",
};
const BOB = {
  uid: "uid-bob", displayName: "Bob", username: "bob_name", role: "member",
};

let env;

before(async () => {
  env = await loadFirebaseRulesEnv("images");
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
  // bob's own event and alice's event, both pending an image.
  await withAdmin(env, async (admin) => {
    await seedEvent(admin, "cal1", "bob-e1", {
      createdBy: BOB.uid, imageStatus: "pending",
  });
  await seedEvent(admin, "cal1", "alice-e1", {
    createdBy: ALICE.uid, imageStatus: "pending",
  });
  });
});

test("uploads land for the event creator; within the size cap", async () => {
  const bob = dbAs(env, BOB.uid);
  const ref = bob.collection("calendars").doc("cal1")
    .collection("images").doc("bob-e1");
  await assertSucceeds(ref.set({
    bytes: imageBytes(1024),
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(ref.update({
    bytes: imageBytes(256 * 1024),
    updatedAt: serverTimestamp(),
  }));
});

test("oversized blobs are denied", async () => {
  const bob = dbAs(env, BOB.uid);
  await assertFails(bob.collection("calendars").doc("cal1")
    .collection("images").doc("bob-e1").set({
      bytes: imageBytes(256 * 1024 + 1),
      updatedAt: serverTimestamp(),
    }));
});

test("members cannot upload for someone else's event", async () => {
  const bob = dbAs(env, BOB.uid);
  await assertFails(bob.collection("calendars").doc("cal1")
    .collection("images").doc("alice-e1").set({
      bytes: imageBytes(1024),
      updatedAt: serverTimestamp(),
    }));
});

test("image shape is validated: closed key set, fresh stamps, non-empty blobs", async () => {
  const bob = dbAs(env, BOB.uid);
  const ref = bob.collection("calendars").doc("cal1")
    .collection("images").doc("bob-e1");
  await assertFails(ref.set({
    bytes: imageBytes(1024),
    updatedAt: serverTimestamp(),
    metadata: "sneaky",
  }));
  await assertFails(ref.set({
    bytes: imageBytes(0),
    updatedAt: serverTimestamp(),
  }));
  // Stale updatedAt (no request.time match).
  await assertFails(ref.set({
    bytes: imageBytes(1024),
    updatedAt: null,
  }));
});

test("images are lookups only: members get, nobody lists", async () => {
  const bob = dbAs(env, BOB.uid);
  const carol = dbAs(env, "uid-carol");
  const bobImages = bob.collection("calendars").doc("cal1").collection("images");
  await assertSucceeds(bobImages.doc("bob-e1").get());
  await assertFails(bobImages.get());
  await assertFails(carol.collection("calendars").doc("cal1")
    .collection("images").doc("bob-e1").get());
  await assertFails(dbUnauth(env).collection("calendars").doc("cal1")
    .collection("images").doc("bob-e1").get());
});

test("deletion follows event authority: creator or owner", async () => {
  const bob = dbAs(env, BOB.uid);
  const alice = dbAs(env, ALICE.uid);
  await assertFails(bob.collection("calendars").doc("cal1")
    .collection("images").doc("alice-e1").delete());
  // Creator deletes their own.
  await assertSucceeds(bob.collection("calendars").doc("cal1")
    .collection("images").doc("bob-e1").delete());
  // Owner deletes a member's.
  await assertSucceeds(alice.collection("calendars").doc("cal1")
    .collection("images").doc("alice-e1").delete());
});
