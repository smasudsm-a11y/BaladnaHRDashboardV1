export const meta = { id: "ctc-converter", label: "CTC Data Converter", subtitle: "Reshape Finance's monthly Actuals export into the format the CTC Actuals upload card expects" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_ABBR_TO_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function detectMonthYear(filename) {
  const m = filename.match(/([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  const abbr = m[1].slice(0, 3).toLowerCase();
  const monthIdx = MONTH_ABBR_TO_INDEX[abbr];
  if (monthIdx === undefined) return null;
  return { monthIdx, year: m[2] };
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Reshapes the wide GL-rows x Cost-Center-columns cross-tab (the shape
// Finance already exports every month, unchanged) into the long format the
// "13b — CTC Actuals" Data Refresh card expects. FS Category is hardcoded —
// at least one real monthly export has had this column glitched (duplicating
// the GL Name into it instead of "Employee Cost"), and every row in this
// extract is Employee Cost by definition anyway.
function reshapeWorkbook(workbook, period) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (!grid.length) throw new Error("The sheet is empty.");

  const header = grid[0];
  if (header.length < 5) throw new Error(`Expected at least 5 columns (GL Name, GL Code, FS Category, TOTAL, then cost centers) — found ${header.length}.`);
  const headerLower = header.map((h) => String(h || "").toLowerCase());
  if (!headerLower[1]?.includes("gl") || !headerLower[3]?.includes("total")) {
    throw new Error(`This file's header doesn't look like the expected shape (column B should be "GL CODE", column D should be "TOTAL") — got: ${header.slice(0, 4).join(" | ")}. Check you uploaded the right file, or that Finance's export template hasn't changed.`);
  }
  const costCenterHeaders = header.slice(4).map((h) => String(h || "").trim());

  const rows = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const glNameRaw = row[0];
    if (!glNameRaw || !String(glNameRaw).trim()) continue;
    const glName = String(glNameRaw).trim();
    let glCode = row[1] ? String(row[1]).trim() : "";
    if (!glCode) glCode = "CAMP";
    for (let c = 0; c < costCenterHeaders.length; c++) {
      const costCenter = costCenterHeaders[c];
      if (!costCenter) continue;
      const val = row[4 + c];
      if (val === null || val === undefined || val === "" || Number(val) === 0) continue;
      rows.push({
        Period: period, "GL Code": glCode, "GL Name": glName, "FS Category": "Employee Cost",
        "Cost Center": costCenter, Amount: Math.round(Number(val) * 100) / 100,
      });
    }
  }
  return rows;
}

export function render({ contentEl }) {
  contentEl.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>13b — CTC Actuals Converter</h3>
    <div class="card-sub">Upload Finance's monthly Actuals export as-is — no reformatting needed on their end. This tool reshapes it and gives you a file to review before it goes anywhere near the live dashboard.</div>
    <input type="file" accept=".xlsx,.xls" class="refresh-file-input">
    <div class="converter-body"></div>
  `;
  contentEl.appendChild(card);

  const fileInput = card.querySelector(".refresh-file-input");
  const body = card.querySelector(".converter-body");

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    body.innerHTML = `<div class="admin-loading">Reading ${file.name}…</div>`;
    try {
      const buffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: "array" });
      const detected = detectMonthYear(file.name);
      renderForm(workbook, detected);
    } catch (err) {
      body.innerHTML = `<div class="note-banner"><b>Couldn't read this file:</b> ${err.message}</div>`;
    }
  });

  function renderForm(workbook, detected) {
    const monthOptions = MONTH_NAMES.map((m, i) => `<option value="${i}" ${detected && detected.monthIdx === i ? "selected" : ""}>${m}</option>`).join("");
    const yearVal = detected ? detected.year : new Date().getFullYear();
    body.innerHTML = `
      ${detected ? "" : `<div class="note-banner"><b>Couldn't detect the month/year from the filename.</b> Set them manually below before converting.</div>`}
      <div class="card-actions" style="align-items:center;">
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;">
          <span style="color:var(--text-muted)">Month</span>
          <select class="conv-month">${monthOptions}</select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;">
          <span style="color:var(--text-muted)">Year</span>
          <input type="number" class="conv-year" value="${yearVal}" style="width:90px;">
        </label>
        <button class="modal-export-btn conv-convert-btn">Convert</button>
      </div>
      <div class="conv-result"></div>
    `;
    body.querySelector(".conv-convert-btn").addEventListener("click", () => {
      const monthIdx = Number(body.querySelector(".conv-month").value);
      const year = body.querySelector(".conv-year").value.trim();
      const period = `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
      const resultEl = body.querySelector(".conv-result");
      try {
        const rows = reshapeWorkbook(workbook, period);
        showResult(resultEl, rows, period);
      } catch (err) {
        resultEl.innerHTML = `<div class="note-banner"><b>Couldn't convert this file:</b> ${err.message}</div>`;
      }
    });
  }

  function showResult(resultEl, rows, period) {
    if (!rows.length) {
      resultEl.innerHTML = `<div class="note-banner"><b>No non-zero rows found.</b> Double-check the file and the selected month/year.</div>`;
      return;
    }
    const sample = rows.slice(0, 5);
    resultEl.innerHTML = `
      <div class="note-banner"><b>${rows.length} rows</b> for period <b>${period}</b>. Review the sample below, then download and check the file before uploading it to the "13b — CTC Actuals" card in Data Refresh.</div>
      <div class="data-table-wrap open">
        <table class="data-table">
          <thead><tr>${Object.keys(sample[0]).map((k) => `<th>${k}</th>`).join("")}</tr></thead>
          <tbody>${sample.map((r) => `<tr>${Object.values(r).map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="card-actions">
        <button class="modal-export-btn conv-download-btn">Download converted file</button>
      </div>
    `;
    resultEl.querySelector(".conv-download-btn").addEventListener("click", () => {
      const ws = XLSX.utils.json_to_sheet(rows, { header: ["Period", "GL Code", "GL Name", "FS Category", "Cost Center", "Amount"] });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "CTC Actuals Data");
      XLSX.writeFile(wb, `CTC_Actuals_${period}.xlsx`);
    });
  }
}
