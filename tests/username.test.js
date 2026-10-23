/**
 * Unit tests for the username pipeline: pattern validation, issue
 * labels and slug suggestions (pure logic, no DOM/storage).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isUsernameValid,
  usernameIssue,
  slugUsername,
  USERNAME_ISSUES,
} from "../js/lib/usernames.js";
import { RESERVED_USERNAMES } from "../js/config.js";

test("accepts claimable shapes", () => {
  assert.equal(isUsernameValid("leah"), true);
  assert.equal(isUsernameValid("a1_b2"), true);
  assert.equal(isUsernameValid("a".repeat(20)), true);
  assert.equal(isUsernameValid("_"), false);
});

test("rejects invalid shapes", () => {
  assert.equal(isUsernameValid("ab"), false); // too short
  assert.equal(isUsernameValid("a".repeat(21)), false); // too long
  assert.equal(isUsernameValid("Leah"), false); // uppercase
  assert.equal(isUsernameValid("leah bird"), false); // space
  assert.equal(isUsernameValid("leah.bird"), false); // dot
  assert.equal(isUsernameValid(""), false);
  assert.equal(isUsernameValid(null), false);
  assert.equal(isUsernameValid(42), false);
});

test("reserved words are never valid, and the config list is clean", () => {
  for (const reserved of RESERVED_USERNAMES) {
    assert.equal(isUsernameValid(reserved), false, `reserved: ${reserved}`);
  }
  assert.equal(usernameIssue(RESERVED_USERNAMES[0]), "reserved");
});

test("usernameIssue labels each failure", () => {
  assert.equal(usernameIssue(""), "empty");
  assert.equal(usernameIssue("ab"), "short");
  assert.equal(usernameIssue("a".repeat(21)), "long");
  assert.equal(usernameIssue("leah bird"), "characters");
  assert.equal(usernameIssue("main"), "reserved");
  assert.equal(usernameIssue("leah"), null);
});

test("every issue has a human label, empty issue maps to empty text", () => {
  for (const issue of ["short", "long", "characters", "reserved"]) {
    assert.equal(typeof USERNAME_ISSUES[issue], "string");
    assert.notEqual(USERNAME_ISSUES[issue].length, 0);
  }
  assert.equal(USERNAME_ISSUES.empty, "");
});

test("slugUsername produces claimable shapes from display names", () => {
  assert.equal(slugUsername("Leah Bird"), "leah_bird");
  assert.equal(slugUsername("Anne-Sophie"), "anne_sophie");
  assert.equal(slugUsername("  Ada  Lovelace  "), "ada_lovelace");
  assert.equal(slugUsername("Zoë Archer"), "zoe_archer");
  assert.equal(slugUsername("大S"), "user_1"); // unsluggable
});

test("slugUsername is idempotent", () => {
  const first = slugUsername("Leah Bird");
  assert.equal(slugUsername(first), first);
});

test("slugUsername avoids reserved words and short results", () => {
  // "me" is reserved, so the slug gains a suffix instead.
  assert.equal(slugUsername("Me"), "user_1");
  // Short slugs get their padding suffix and stay valid.
  const short = slugUsername("I2");
  assert.equal(isUsernameValid(short), true);
  assert.notEqual(short, "me");
});

test("slugUsername trims to 20 characters", () => {
  const slug = slugUsername("A".repeat(60));
  assert.equal(isUsernameValid(slug), true);
  assert.equal(slug.length, 20);
});
