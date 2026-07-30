import { emp } from "./data.js";

const PRIORITY_FIELDS = [
  "employeeId", "employeeName", "employeeNumber", "candidateId",
  "department", "businessUnit", "division", "positionTitle", "vacancyPosition",
  "jobGrade", "grade", "jobLevel", "managementLevel", "gender", "candidateGender", "nationality", "candidateNationality",
  "hireDate", "terminationDate", "joiningDate", "employmentStatus", "employeeType",
  "leaveType", "leaveDays", "leaveStatus", "leaveBalance",
  "absenceType", "absenceHours", "paidUnpaid",
  "terminationReason", "voluntaryInvoluntary", "tenure",
  "overallRating", "performanceCycle", "promotionRecommendation",
  "trainingCategory", "courseName", "trainingHours", "trainingCost", "completionStatus",
  "sourceOfHire", "requisitionId", "recruitmentCost",
  "baseSalary", "totalCash", "totalRem", "compaRatio", "rangePenetration",
  "location", "manager", "hiringManager",
];

export function humanizeKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function defaultColumns(records) {
  if (!records || !records.length) return [];
  const keys = Object.keys(records[0]);
  const picked = PRIORITY_FIELDS.filter((f) => keys.includes(f));
  const finalKeys = (picked.length ? picked : keys).slice(0, 8);
  return finalKeys.map((k) => ({ key: k, label: humanizeKey(k) }));
}

function cellText(row, col) {
  const v = row[col.key];
  if (col.fmt) return col.fmt(v);
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

export function exportRowsToExcel(records, columns, filename) {
  if (typeof XLSX === "undefined") {
    alert("Excel export library did not load. Check your connection and reload the page.");
    return;
  }
  const cols = columns && columns.length ? columns : defaultColumns(records);
  const data = records.map((r) => {
    const o = {};
    for (const c of cols) o[c.label] = cellText(r, c);
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const name = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, name);
}

// ---- Modal ----

let modalRoot = null;

function ensureModal() {
  if (modalRoot) return modalRoot;
  modalRoot = document.createElement("div");
  modalRoot.className = "modal-overlay";
  modalRoot.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div>
          <h2 class="modal-title"></h2>
          <div class="modal-sub"></div>
        </div>
        <button class="modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;
  modalRoot.addEventListener("click", (e) => { if (e.target === modalRoot) closeModal(); });
  modalRoot.querySelector(".modal-close").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  document.body.appendChild(modalRoot);
  return modalRoot;
}

export function closeModal() {
  if (modalRoot) modalRoot.classList.remove("open");
}

function openModal(titleHtml, subHtml, bodyEl) {
  const root = ensureModal();
  root.querySelector(".modal-title").innerHTML = titleHtml;
  root.querySelector(".modal-sub").innerHTML = subHtml || "";
  const body = root.querySelector(".modal-body");
  body.innerHTML = "";
  body.appendChild(bodyEl);
  root.classList.add("open");
}

export function openDrilldownModal({ title, records, columns, db, filenamePrefix }) {
  const cols = columns && columns.length ? columns : defaultColumns(records);
  const body = document.createElement("div");

  const toolbar = document.createElement("div");
  toolbar.className = "modal-toolbar";
  const exportBtn = document.createElement("button");
  exportBtn.className = "modal-export-btn";
  exportBtn.textContent = "Export this list to Excel";
  exportBtn.addEventListener("click", () => exportRowsToExcel(records, cols, filenamePrefix || title));
  toolbar.appendChild(exportBtn);
  body.appendChild(toolbar);

  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "modal-empty";
    empty.textContent = "No individual records match this selection.";
    body.appendChild(empty);
  } else {
    const table = document.createElement("table");
    table.className = "data-table modal-table";
    table.innerHTML = `<thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>`;
    const tbody = document.createElement("tbody");
    records.forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.className = "modal-row";
      tr.innerHTML = cols.map((c) => `<td>${cellText(r, c)}</td>`).join("");
      tr.addEventListener("click", () => openPersonDetail(r, db, { records, columns: cols, title, filenamePrefix }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const wrap = document.createElement("div");
    wrap.className = "modal-table-wrap";
    wrap.appendChild(table);
    body.appendChild(wrap);
  }

  openModal(title, `${records.length} record${records.length === 1 ? "" : "s"} — click a row for full details`, body);
}

export function openPersonDetail(record, db, back) {
  const e = record.employeeId ? emp(db, record.employeeId) : null;
  const merged = e ? { ...record, ...e, ...record } : record;

  const body = document.createElement("div");

  if (back) {
    const backBtn = document.createElement("button");
    backBtn.className = "modal-back-btn";
    backBtn.textContent = "← Back to list";
    backBtn.addEventListener("click", () => openDrilldownModal(back));
    body.appendChild(backBtn);
  }

  const grid = document.createElement("div");
  grid.className = "detail-grid";
  const skip = new Set(["employeeId"]);
  const entries = Object.entries(merged).filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== "");
  for (const [k, v] of entries) {
    const item = document.createElement("div");
    item.className = "detail-item";
    item.innerHTML = `<div class="detail-label">${humanizeKey(k)}</div><div class="detail-value">${v}</div>`;
    grid.appendChild(item);
  }
  body.appendChild(grid);

  const name = merged.employeeName || merged.candidateId || record.employeeId || "Record Detail";
  const idLine = record.employeeId ? `Employee ID: ${record.employeeId}` : "";
  openModal(name, idLine, body);
}

// ---- PPTX export ----

function humanizeCardTitle(el) {
  const h = el.querySelector("h3");
  return h ? h.textContent.trim() : "Untitled";
}

export function exportPageToPPTX({ pageTitle, pageSubtitle, contentEl, filenamePrefix }) {
  if (typeof PptxGenJS === "undefined") {
    alert("PowerPoint export library did not load. Check your connection and reload the page.");
    return;
  }
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";

  const brandPurple = "611F6B";

  // Title slide with KPI summary
  const titleSlide = pptx.addSlide();
  titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.4, fill: { color: brandPurple } });
  titleSlide.addText("Baladna HR Analytics", { x: 0.5, y: 0.15, w: 8, h: 0.4, fontSize: 14, color: "FFFFFF", bold: true });
  titleSlide.addText(pageTitle, { x: 0.5, y: 0.5, w: 10, h: 0.7, fontSize: 26, color: "FFFFFF", bold: true });
  if (pageSubtitle) {
    titleSlide.addText(pageSubtitle, { x: 0.5, y: 1.6, w: 12, h: 0.4, fontSize: 13, color: "52514E", italic: true });
  }

  const kpiCards = Array.from(contentEl.querySelectorAll(".kpi-card"));
  if (kpiCards.length) {
    const rows = [[
      { text: "Metric", options: { bold: true, fill: { color: "F4ECF6" } } },
      { text: "Value", options: { bold: true, fill: { color: "F4ECF6" } } },
      { text: "Detail", options: { bold: true, fill: { color: "F4ECF6" } } },
    ]];
    kpiCards.forEach((card) => {
      const label = card.querySelector(".kpi-label")?.textContent.trim() || "";
      const value = card.querySelector(".kpi-value")?.textContent.trim() || "";
      const note = card.querySelector(".kpi-note")?.textContent.trim() || card.querySelector(".kpi-delta")?.textContent.trim() || "";
      rows.push([{ text: label }, { text: value, options: { bold: true } }, { text: note, options: { fontSize: 10, color: "898781" } }]);
    });
    titleSlide.addTable(rows, { x: 0.5, y: 2.2, w: 12.3, colW: [4.5, 2.5, 5.3], fontSize: 12, border: { type: "solid", color: "E3DBE4", pt: 0.5 }, autoPage: false });
  }

  // One slide per chart / table card
  const cards = Array.from(contentEl.querySelectorAll(".card"));
  cards.forEach((card) => {
    const slide = pptx.addSlide();
    const title = humanizeCardTitle(card);
    slide.addText(title, { x: 0.4, y: 0.25, w: 12.5, h: 0.5, fontSize: 20, bold: true, color: "0B0B0B" });
    const sub = card.querySelector(".card-sub")?.textContent.trim();
    if (sub) slide.addText(sub, { x: 0.4, y: 0.75, w: 12.5, h: 0.35, fontSize: 12, color: "898781", italic: true });

    const canvas = card.querySelector("canvas");
    const table = card.querySelector("table.data-table");

    if (canvas) {
      try {
        const dataUrl = canvas.toDataURL("image/png", 1.0);
        slide.addImage({ data: dataUrl, x: 1.5, y: 1.3, w: 10.3, h: 5.6, sizing: { type: "contain", w: 10.3, h: 5.6 } });
      } catch (err) {
        slide.addText("Chart image unavailable.", { x: 0.5, y: 2, w: 10, h: 1, fontSize: 14, color: "898781" });
      }
    } else if (table) {
      const rows = Array.from(table.querySelectorAll("tr")).slice(0, 20).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) => ({
          text: cell.textContent.trim(),
          options: cell.tagName === "TH" ? { bold: true, fill: { color: "F4ECF6" } } : {},
        }))
      );
      slide.addTable(rows, { x: 0.5, y: 1.3, w: 12.3, fontSize: 12, border: { type: "solid", color: "E3DBE4", pt: 0.5 }, autoPage: false });
    }
  });

  pptx.writeFile({ fileName: `${filenamePrefix || pageTitle}.pptx` });
}
