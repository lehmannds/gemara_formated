import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown } from "./dom-env.js";

describe("createTable", () => {
  let createTable;
  let container;

  before(async () => {
    setup();
    ({ createTable } = await import("../js/table.js"));
  });

  after(() => {
    teardown();
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  describe("creation", () => {
    it("throws when columns is empty", () => {
      assert.throws(
        () => createTable(container, { columns: [] }),
        /columns must be a non-empty array/
      );
    });

    it("appends a table with correct structure", () => {
      const { root } = createTable(container, {
        columns: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
      });

      assert.equal(root.tagName, "TABLE");
      assert.equal(root.className, "data-table");
      assert.ok(root.querySelector("thead"));
      assert.ok(root.querySelector("tbody"));
      const ths = root.querySelectorAll("th");
      assert.equal(ths.length, 2);
      assert.equal(ths[0].textContent, "A");
      assert.equal(ths[1].textContent, "B");
    });

    it("renders an optional caption", () => {
      const { root } = createTable(container, {
        columns: [{ key: "x", label: "X" }],
        caption: "My Table",
      });

      const cap = root.querySelector("caption");
      assert.ok(cap);
      assert.equal(cap.textContent, "My Table");
    });
  });

  describe("setRows", () => {
    it("renders row data as text cells", () => {
      const { root, setRows } = createTable(container, {
        columns: [
          { key: "name", label: "Name" },
          { key: "age", label: "Age" },
        ],
      });

      setRows([
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]);

      const rows = root.querySelectorAll("tbody tr");
      assert.equal(rows.length, 2);
      assert.equal(rows[0].children[0].textContent, "Alice");
      assert.equal(rows[0].children[1].textContent, "30");
      assert.equal(rows[1].children[0].textContent, "Bob");
    });

    it("renders empty string for null/undefined values", () => {
      const { root, setRows } = createTable(container, {
        columns: [{ key: "v", label: "V" }],
      });

      setRows([{ v: null }, {}]);

      const cells = root.querySelectorAll("tbody td");
      assert.equal(cells[0].textContent, "");
      assert.equal(cells[1].textContent, "");
    });

    it("replaces previous rows on subsequent calls", () => {
      const { root, setRows } = createTable(container, {
        columns: [{ key: "x", label: "X" }],
      });

      setRows([{ x: 1 }, { x: 2 }]);
      assert.equal(root.querySelectorAll("tbody tr").length, 2);

      setRows([{ x: 3 }]);
      assert.equal(root.querySelectorAll("tbody tr").length, 1);
      assert.equal(root.querySelector("tbody td").textContent, "3");
    });
  });

  describe("sorting", () => {
    it("headers contain buttons when sort is enabled", () => {
      const { root } = createTable(container, {
        columns: [{ key: "a", label: "A" }],
        sort: true,
      });

      const btn = root.querySelector("th button.data-table__sort-btn");
      assert.ok(btn);
      assert.equal(btn.textContent, "A");
    });

    it("clicking a header sorts ascending then descending then unsorted", () => {
      const { root, setRows } = createTable(container, {
        columns: [{ key: "n", label: "N" }],
        sort: true,
      });

      setRows([{ n: "banana" }, { n: "apple" }, { n: "cherry" }]);
      const btn = root.querySelector("th button");

      btn.click();
      let cells = root.querySelectorAll("tbody td");
      assert.equal(cells[0].textContent, "apple");
      assert.equal(cells[1].textContent, "banana");
      assert.equal(cells[2].textContent, "cherry");

      btn.click();
      cells = root.querySelectorAll("tbody td");
      assert.equal(cells[0].textContent, "cherry");
      assert.equal(cells[1].textContent, "banana");
      assert.equal(cells[2].textContent, "apple");

      btn.click();
      cells = root.querySelectorAll("tbody td");
      assert.equal(cells[0].textContent, "banana");
      assert.equal(cells[1].textContent, "apple");
      assert.equal(cells[2].textContent, "cherry");
    });

    it("sorts numbers numerically", () => {
      const { root, setRows } = createTable(container, {
        columns: [{ key: "v", label: "V" }],
        sort: true,
      });

      setRows([{ v: 10 }, { v: 2 }, { v: 100 }]);
      root.querySelector("th button").click();

      const cells = root.querySelectorAll("tbody td");
      assert.equal(cells[0].textContent, "2");
      assert.equal(cells[1].textContent, "10");
      assert.equal(cells[2].textContent, "100");
    });

    it("setSort and getSort work programmatically", () => {
      const { root, setRows, setSort, getSort } = createTable(container, {
        columns: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
        sort: true,
      });

      setRows([
        { a: "z", b: 1 },
        { a: "a", b: 3 },
        { a: "m", b: 2 },
      ]);

      setSort("a", "asc");
      assert.deepEqual(getSort(), { key: "a", direction: "asc" });
      const cells = root.querySelectorAll("tbody tr td:first-child");
      assert.equal(cells[0].textContent, "a");
      assert.equal(cells[1].textContent, "m");
      assert.equal(cells[2].textContent, "z");
    });

    it("setSort throws for unknown column key", () => {
      const { setRows, setSort } = createTable(container, {
        columns: [{ key: "a", label: "A" }],
        sort: true,
      });
      setRows([{ a: 1 }]);

      assert.throws(() => setSort("nonexistent"), /unknown column key/);
    });

    it("updates aria-sort attributes", () => {
      const { root, setRows, setSort } = createTable(container, {
        columns: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
        sort: true,
      });

      setRows([{ a: 1, b: 2 }]);
      const ths = root.querySelectorAll("th");

      assert.equal(ths[0].getAttribute("aria-sort"), "none");
      assert.equal(ths[1].getAttribute("aria-sort"), "none");

      setSort("a", "asc");
      assert.equal(ths[0].getAttribute("aria-sort"), "ascending");
      assert.equal(ths[1].getAttribute("aria-sort"), "none");

      setSort("b", "desc");
      assert.equal(ths[0].getAttribute("aria-sort"), "none");
      assert.equal(ths[1].getAttribute("aria-sort"), "descending");
    });

    it("setRows resets sort state", () => {
      const { setRows, getSort, setSort } = createTable(container, {
        columns: [{ key: "a", label: "A" }],
        sort: true,
      });

      setRows([{ a: 2 }, { a: 1 }]);
      setSort("a", "asc");
      assert.equal(getSort().direction, "asc");

      setRows([{ a: 5 }, { a: 3 }]);
      assert.equal(getSort().direction, "none");
    });

    it("accepts a custom compare function", () => {
      const { root, setRows, setSort } = createTable(container, {
        columns: [{ key: "w", label: "W" }],
        sort: { compare: (a, b, key) => String(a[key]).length - String(b[key]).length },
      });

      setRows([{ w: "long word" }, { w: "hi" }, { w: "mid" }]);
      setSort("w", "asc");

      const cells = root.querySelectorAll("tbody td");
      assert.equal(cells[0].textContent, "hi");
      assert.equal(cells[1].textContent, "mid");
      assert.equal(cells[2].textContent, "long word");
    });
  });

  describe("destroy", () => {
    it("removes the table from the DOM", () => {
      const { root, destroy } = createTable(container, {
        columns: [{ key: "a", label: "A" }],
      });

      assert.ok(container.contains(root));
      destroy();
      assert.ok(!container.contains(root));
    });
  });
});
