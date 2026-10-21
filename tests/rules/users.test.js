/**
 * Rules tests for users/{uid} profiles and the one-time unique-username
 * claim in usernames/{name}.
 */
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

import {
  loadFirebaseRulesEnv,
  dbAs,
  dbUnauth,
  withAdmin,
  seedUser,
  defaultSettings,
  serverTimestamp,
} from "./env.js";

let env;

before(async () => {
  env = await loadFirebaseRulesEnv("users");
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
});

test("a fresh account claims a username atomically", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-alice", { displayName: "Alice", email: "a@x.dev" });
  });
  const alice = dbAs(env, "uid-alice");
  const batch = alice.batch();
  batch.set(alice.collection("usernames").doc("alice_a"), {
    uid: "uid-alice",
    displayName: "Alice",
    photoURL: null,
    createdAt: serverTimestamp(),
  });
  batch.update(alice.collection("users").doc("uid-alice"), { username: "alice_a" });
  await assertSucceeds(batch.commit());
});

test("a used username cannot be claimed", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-bob", {
      displayName: "Bob", email: "b@x.dev", username: "bob_name",
  });
  await seedUser(admin, "uid-carol", { displayName: "Carol", email: "c@x.dev" });
  });
  const carol = dbAs(env, "uid-carol");
  // Doc-id collisions make raw reclaims fail; rules backstop the update.
  await assertFails(
    carol.collection("usernames").doc("bob_name").set({
      uid: "uid-carol",
      displayName: "Carol",
      photoURL: null,
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(
    carol.collection("users").doc("uid-carol").update({ username: "bob_name" }),
  );
});

test("a username can never change or be claimed twice", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-bob", {
      displayName: "Bob", email: "b@x.dev", username: "bob_name",
  });
  });
  const bob = dbAs(env, "uid-bob");
  await assertFails(bob.collection("users").doc("uid-bob").update({
    username: "bob_v2",
  }));
});

test("claiming without registering usernames/{name} is denied", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-alice", { displayName: "Alice", email: "a@x.dev" });
  });
  const alice = dbAs(env, "uid-alice");
  // Lone users write: getAfter on usernames/alice_a still unset for alice.
  await assertFails(
    alice.collection("users").doc("uid-alice").update({ username: "alice_a" }),
  );
});

test("claiming for another uid is denied", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-alice", { displayName: "Alice", email: "a@x.dev" });
  });
  const alice = dbAs(env, "uid-alice");
  await assertFails(alice.collection("usernames").doc("stolen_handle").set({
    uid: "uid-bob",
    displayName: "Alice",
    photoURL: null,
    createdAt: serverTimestamp(),
  }));
});

test("malformed usernames are denied", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-alice", { displayName: "Alice", email: "a@x.dev" });
  });
  const alice = dbAs(env, "uid-alice");
  for (const bad of ["ab", "UPPER", "with-hyphen", "with space", "a".repeat(21), ""]) {
    await assertFails(alice.collection("users").doc("uid-alice").update({
      username: bad,
    }), `${JSON.stringify(bad)} must be denied`);
  }
});

test("usernames are lookups only: no list, no update, no delete", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-bob", {
      displayName: "Bob", email: "b@x.dev", username: "bob_name",
  });
  });
  const alice = dbAs(env, "uid-alice");
  await assertSucceeds(alice.collection("usernames").doc("bob_name").get());
  await assertFails(alice.collection("usernames")
    .orderBy("createdAt").get());
  await assertFails(alice.collection("usernames").doc("bob_name").update({
    displayName: "Hacked",
  }));
  await assertFails(alice.collection("usernames").doc("bob_name").delete());
});

test("profiles are readable and writable only by their owner", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-alice", { displayName: "Alice", email: "a@x.dev" });
    await seedUser(admin, "uid-bob", { displayName: "Bob", email: "b@x.dev" });
  });
  const alice = dbAs(env, "uid-alice");
  const bob = dbAs(env, "uid-bob");
  const unauth = dbUnauth(env);
  await assertSucceeds(alice.collection("users").doc("uid-alice").get());
  await assertFails(alice.collection("users").doc("uid-bob").get());
  await assertFails(unauth.collection("users").doc("uid-alice").get());
  await assertFails(unauth.collection("users").doc("uid-alice").set({}));
  await assertFails(bob.collection("users").doc("uid-alice").set({
    displayName: "Evil bob", email: "b@x.dev", photoURL: null,
    username: null, createdAt: serverTimestamp(),
    settings: defaultSettings(),
  }));
});

test("profile shape is validated: no extra keys, sane settings, immutable createdAt", async () => {
  await withAdmin(env, async (admin) => {
    await seedUser(admin, "uid-alice", { displayName: "Alice", email: "a@x.dev" });
  });
  const alice = dbAs(env, "uid-alice");
  const ref = alice.collection("users").doc("uid-alice");
  await assertSucceeds(ref.update({
    displayName: "Alice Aardvark",
    settings: { ...defaultSettings(), weekStartsOn: 0 },
  }));
  await assertFails(ref.update({ hackerField: 1 }));
  await assertFails(ref.update({
    settings: { ...defaultSettings(), lastView: "yearly" },
  }));
  await assertFails(ref.update({
    settings: { ...defaultSettings(), weekStartsOn: 2 },
  }));
  await assertFails(ref.update({ displayName: "" }));
  await assertFails(ref.update({
    displayName: "x".repeat(61),
  }));
  await assertFails(ref.update({
    email: "e".repeat(255) + "@x.dev",
  }));
  await assertFails(ref.update({ createdAt: serverTimestamp() }));
});
