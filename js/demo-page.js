import { createTable } from "./table.js";
import { createPopup } from "./popup.js";

const host = document.getElementById("table-host");
const btn = document.getElementById("open-sample");

if (host) {
  const table = createTable(host, {
    caption: "Tractates",
    columns: [
      { key: "tractate", label: "Tractate" },
      { key: "folio", label: "Folio" },
      { key: "pages", label: "Pages" },
    ],
    sort: true,
  });
  table.setRows([
    { tractate: "Berakhot", folio: "2a", pages: 64 },
    { tractate: "Shabbat", folio: "2b", pages: 157 },
    { tractate: "Eruvin", folio: "2a", pages: 105 },
    { tractate: "Pesachim", folio: "2a", pages: 121 },
    { tractate: "Yoma", folio: "2a", pages: 88 },
    { tractate: "Sukkah", folio: "2a", pages: 56 },
    { tractate: "Beitzah", folio: "2a", pages: 40 },
    { tractate: "Megillah", folio: "2a", pages: 32 },
  ]);
}

if (btn) {
  const popup = createPopup();
  btn.addEventListener("click", () => {
    popup.open({
      title: "Example",
      content:
        "This popup uses createPopup() from js/popup.js. Escape or the backdrop closes it.",
    });
  });
}
