import test from "node:test";
import assert from "node:assert/strict";
import { seal, unseal, type Session } from "../src/lib/session-codec";

const secret = "unit-test-secret-not-a-production-key-1234567890";
const session: Session = { token: "gho_a-token-that-must-stay-secret", user: { id: 42, login: "octocat" }, exp: Date.now() + 60000 };
test("an encrypted session roundtrips", () => assert.deepEqual(unseal(seal(session, secret), secret), session));
test("cookies do not expose the GitHub token in plaintext or base64 plaintext", () => {
  const value = seal(session, secret);
  assert.equal(value.includes(session.token), false);
  assert.equal(Buffer.from(value, "base64url").toString().includes(session.token), false);
});
test("identical sessions get fresh nonces", () => assert.notEqual(seal(session, secret), seal(session, secret)));
test("a tampered authentication tag is rejected", () => {
  const data = Buffer.from(seal(session, secret), "base64url"); data[15] ^= 0xff;
  assert.equal(unseal(data.toString("base64url"), secret), null);
});
test("tampered ciphertext is rejected", () => {
  const data = Buffer.from(seal(session, secret), "base64url"); data[data.length - 1] ^= 0xff;
  assert.equal(unseal(data.toString("base64url"), secret), null);
});
test("expired sessions cannot authorize requests", () => assert.equal(unseal(seal({ ...session, exp: Date.now() - 1 }, secret), secret), null));
test("rotating the secret invalidates previous sessions", () => assert.equal(unseal(seal(session, secret), "another-very-long-and-different-test-secret"), null));
test("malformed cookies fail closed", () => {
  for (const value of ["", "garbage", "../../etc/passwd", "A".repeat(100)]) assert.equal(unseal(value, secret), null);
});
test("short encryption keys are refused", () => assert.throws(() => seal(session, "short"), /32 characters/));
