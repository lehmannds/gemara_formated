/**
 * Data table UI: builds a semantic <table> and updates body rows.
 * Supports optional column sorting and filtering.
 *
 * Public API: {@link createTable}
 */

/**
 * @typedef {{ key: string, label: string }} TableColumn
 */

/**
 * @typedef {'asc' | 'desc' | 'none'} SortDirection
 */

/**
 * @typedef {{ key: string, direction: SortDirection }} SortState
 */

/**
 * @param {HTMLElement} container
 * @param {{
 *   columns: TableColumn[],
 *   caption?: string,
 *   sort?: boolean | { compare?: (a: unknown, b: unknown, key: string) => number }
 * }} options
 * @returns {{
 *   root: HTMLTableElement,
 *   setRows: (rows: Record<string, unknown>[]) => void,
 *   destroy: () => void,
 *   setSort?: (key: string, direction?: SortDirection) => void,
 *   getSort?: () => SortState
 * }}
 */
export function createTable(container, options) {
  const { columns, caption, sort: sortOpt } = options;
  if (!columns?.length) {
    throw new Error("createTable: columns must be a non-empty array");
  }

  const sortEnabled = Boolean(sortOpt);
  const customCompare =
    sortOpt && typeof sortOpt === "object" ? sortOpt.compare : undefined;

  /** @type {Array<() => void>} */
  const cleanups = [];

  const table = document.createElement("table");
  table.className = "data-table";

  if (caption) {
    const cap = document.createElement("caption");
    cap.className = "data-table__caption";
    cap.textContent = caption;
    table.appendChild(cap);
  }

  const thead = document.createElement("thead");
  thead.className = "data-table__thead";
  const headRow = document.createElement("tr");
  headRow.className = "data-table__tr";

  /** @type {Map<string, HTMLElement>} */
  const thMap = new Map();

  for (const col of columns) {
    const th = document.createElement("th");
    th.className = "data-table__th";
    th.scope = "col";

    if (sortEnabled) {
      th.setAttribute("aria-sort", "none");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "data-table__sort-btn";
      btn.textContent = col.label;
      const handler = () => handleSortClick(col.key);
      btn.addEventListener("click", handler);
      cleanups.push(() => btn.removeEventListener("click", handler));
      th.appendChild(btn);
    } else {
      th.textContent = col.label;
    }

    thMap.set(col.key, th);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  tbody.className = "data-table__tbody";

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);

  /** @type {Record<string, unknown>[]} */
  let sourceRows = [];
  /** @type {SortState} */
  let currentSort = { key: "", direction: "none" };

  /**
   * Default comparator: numeric-aware, locale string fallback.
   */
  function defaultCompare(a, b, key) {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return -1;
    if (vb == null) return 1;
    const na = Number(va);
    const nb = Number(vb);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(va).localeCompare(String(vb));
  }

  function renderRows(rows) {
    tbody.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.className = "data-table__tr";
      for (const col of columns) {
        const td = document.createElement("td");
        td.className = "data-table__td";
        const v = row[col.key];
        td.textContent = v == null ? "" : String(v);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function applySortAndRender() {
    if (currentSort.direction === "none" || !currentSort.key) {
      renderRows(sourceRows);
      return;
    }
    const cmp = customCompare || defaultCompare;
    const dir = currentSort.direction === "asc" ? 1 : -1;
    const sorted = [...sourceRows].sort(
      (a, b) => dir * cmp(a, b, currentSort.key)
    );
    renderRows(sorted);
  }

  function updateThAria() {
    for (const [key, th] of thMap) {
      if (key === currentSort.key) {
        th.setAttribute("aria-sort", currentSort.direction === "none" ? "none" : currentSort.direction === "asc" ? "ascending" : "descending");
        th.classList.toggle("data-table__th--asc", currentSort.direction === "asc");
        th.classList.toggle("data-table__th--desc", currentSort.direction === "desc");
      } else {
        th.setAttribute("aria-sort", "none");
        th.classList.remove("data-table__th--asc", "data-table__th--desc");
      }
    }
  }

  /** Cycle: none → asc → desc → none */
  function nextDirection(current) {
    if (current === "none") return "asc";
    if (current === "asc") return "desc";
    return "none";
  }

  function handleSortClick(key) {
    if (currentSort.key === key) {
      currentSort = { key, direction: nextDirection(currentSort.direction) };
    } else {
      currentSort = { key, direction: "asc" };
    }
    updateThAria();
    applySortAndRender();
  }

  /**
   * @param {Record<string, unknown>[]} rows
   */
  function setRows(rows) {
    sourceRows = rows;
    if (sortEnabled) {
      currentSort = { key: "", direction: "none" };
      updateThAria();
    }
    renderRows(sourceRows);
  }

  /**
   * @param {string} key
   * @param {SortDirection} [direction='asc']
   */
  function setSort(key, direction = "asc") {
    if (!columns.some((c) => c.key === key)) {
      throw new Error(`setSort: unknown column key "${key}"`);
    }
    currentSort = { key, direction };
    updateThAria();
    applySortAndRender();
  }

  function getSort() {
    return { ...currentSort };
  }

  function destroy() {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
    table.remove();
  }

  const api = { root: table, setRows, destroy };
  if (sortEnabled) {
    api.setSort = setSort;
    api.getSort = getSort;
  }
  return api;
}
