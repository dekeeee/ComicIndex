import { describe, expect, it } from "vitest";
import { charLength, validateNickname, validateReviewInput } from "@/lib/validation";

const WORK_ID = "123e4567-e89b-12d3-a456-426614174000";
const base = { workId: WORK_ID, nickname: "", body: "あ".repeat(20), rating: 4, hasSpoiler: false };

describe("charLength", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(charLength("😀😀")).toBe(2);
    expect(charLength("あいう")).toBe(3);
  });
});

describe("validateReviewInput", () => {
  it("accepts the minimum body", () => expect(validateReviewInput(base).ok).toBe(true));
  it("rejects 19 characters", () => {
    const r = validateReviewInput({ ...base, body: "あ".repeat(19) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBeDefined();
  });
  it("accepts 2000 characters", () => expect(validateReviewInput({ ...base, body: "あ".repeat(2000) }).ok).toBe(true));
  it("rejects 2001 characters", () => expect(validateReviewInput({ ...base, body: "あ".repeat(2001) }).ok).toBe(false));
  it("rejects rating 0 and 6 and non-integers", () => {
    expect(validateReviewInput({ ...base, rating: 0 }).ok).toBe(false);
    expect(validateReviewInput({ ...base, rating: 6 }).ok).toBe(false);
    expect(validateReviewInput({ ...base, rating: 3.5 }).ok).toBe(false);
  });
  it("rejects a malformed work id", () => expect(validateReviewInput({ ...base, workId: "nope" }).ok).toBe(false));
  it("rejects a 21-char nickname but accepts 20", () => {
    expect(validateReviewInput({ ...base, nickname: "a".repeat(21) }).ok).toBe(false);
    expect(validateReviewInput({ ...base, nickname: "a".repeat(20) }).ok).toBe(true);
  });
  it("trims whitespace before measuring", () => {
    expect(validateReviewInput({ ...base, body: "   " + "あ".repeat(19) + "   " }).ok).toBe(false);
  });
});

describe("validateNickname", () => {
  it("accepts undefined", () => expect(validateNickname(undefined).ok).toBe(true));
});
