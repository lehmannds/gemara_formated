import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown } from "./dom-env.js";

describe("fuzzyMatchPath", () => {
  let fuzzyMatchPath;

  before(async () => {
    setup();
    ({ fuzzyMatchPath } = await import("../js/utils.js"));
  });

  after(() => {
    teardown();
  });

  it("returns positive score when all tokens appear in the path", () => {
    assert.ok(fuzzyMatchPath("hu 2", "hulin/2.1") > 0);
    assert.ok(fuzzyMatchPath("hu 2", "hulin/2.2") > 0);
  });

  it("returns 0 when a token is missing", () => {
    assert.equal(fuzzyMatchPath("hu 3", "hulin/2.1"), 0);
    assert.equal(fuzzyMatchPath("bava 2", "hulin/2.1"), 0);
  });

  it("is case-insensitive", () => {
    assert.ok(fuzzyMatchPath("HU", "hulin/2.1") > 0);
    assert.ok(fuzzyMatchPath("Hulin", "hulin/2.1") > 0);
  });

  it("returns positive score when query is empty", () => {
    assert.ok(fuzzyMatchPath("", "hulin/2.1") > 0);
    assert.ok(fuzzyMatchPath("  ", "anything") > 0);
  });

  it("treats dots and slashes as segment separators", () => {
    assert.ok(fuzzyMatchPath("2 1", "hulin/2.1") > 0);
    assert.ok(fuzzyMatchPath("hulin 2 1", "hulin/2.1") > 0);
  });

  it("handles single-token queries", () => {
    assert.ok(fuzzyMatchPath("hulin", "hulin/2.1") > 0);
    assert.ok(fuzzyMatchPath("sample", "sample") > 0);
    assert.equal(fuzzyMatchPath("xyz", "hulin/2.1"), 0);
  });

  it("matches partial substrings within path segments", () => {
    assert.ok(fuzzyMatchPath("ul", "hulin/2.1") > 0);
    assert.ok(fuzzyMatchPath("lin", "hulin/2.1") > 0);
  });

  describe("scoring", () => {
    it("exact segment match scores higher than prefix", () => {
      const exact = fuzzyMatchPath("9", "hulin/9.1");
      const prefix = fuzzyMatchPath("9", "hulin/91.1");
      assert.ok(exact > prefix, `exact (${exact}) should beat prefix (${prefix})`);
    });

    it("prefix match scores higher than substring", () => {
      const prefix = fuzzyMatchPath("9", "hulin/91.1");
      const substr = fuzzyMatchPath("9", "hulin/19.1");
      assert.ok(prefix > substr, `prefix (${prefix}) should beat substr (${substr})`);
    });

    it("'hu 9 1' scores hulin/9.1 higher than hulin/19.1", () => {
      const target = fuzzyMatchPath("hu 9 1", "hulin/9.1");
      const other = fuzzyMatchPath("hu 9 1", "hulin/19.1");
      assert.ok(target > 0, "hulin/9.1 should match");
      assert.ok(target > other, `9.1 (${target}) should score higher than 19.1 (${other})`);
    });

    it("'hu 9 1' scores hulin/9.1 higher than hulin/91.1", () => {
      const target = fuzzyMatchPath("hu 9 1", "hulin/9.1");
      const other = fuzzyMatchPath("hu 9 1", "hulin/91.1");
      assert.ok(target > other, `9.1 (${target}) should score higher than 91.1 (${other})`);
    });
  });
});
