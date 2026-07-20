import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashPasscode,
  signToken,
  verifyPasscode,
  verifyToken,
} from "./lib/auth.js";

describe("passcode hashing", () => {
  it("verifies a matching passcode and rejects a wrong one", async () => {
    const hash = await hashPasscode("123456");
    assert.equal(await verifyPasscode(hash, "123456"), true);
    assert.equal(await verifyPasscode(hash, "000000"), false);
    assert.ok(!hash.includes("123456"));
  });
});

describe("jwt", () => {
  it("round-trips a token", async () => {
    const token = await signToken({ sub: "user-1", username: "ricky" });
    const payload = await verifyToken(token);
    assert.deepEqual(payload, { sub: "user-1", username: "ricky" });
  });

  it("rejects garbage", async () => {
    assert.equal(await verifyToken("not.a.token"), null);
  });
});
