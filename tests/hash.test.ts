import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/utils/hash";

describe("hash utilities", () => {
  it("should hash a password and verify it correctly", async () => {
    const password = "SecureP@ss123";
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const hash = await hashPassword("CorrectP@ss123");
    const isValid = await verifyPassword("WrongP@ss456", hash);
    expect(isValid).toBe(false); 
  });

  it("should produce different hashes for the same password (salted)", async () => {
    const password = "SameP@ss123";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);

    // Both should still verify correctly
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });
});
