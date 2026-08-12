import { sortedUnique, fmtMoney, fmtPct } from "../data.js";
import { kpiCard, chartCard, barChart, filterSelect, buildTable } from "../charts.js";

export const meta = {
  id: "ctc-variance-explorer", section: "ctc", sectionLabel: "CTC Report",
  label: "CTC Variance Explorer",
  subtitle: "Drill from expense category into department and cost center to see what's driving a variance",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function enrich(db, row) {
  const cc = db.costCenterIndex.get(row.costCenter);
  return { ...row, division: cc?.division || "Unclassified", department: cc?.department || "Unclassified" };
}

function sumAmount(rows) {
  return rows.reduce((s, r) => s + (r.amount || 0), 0);
}

// One level of the drill: groups rows by keyFn, computes Budget/Actual/Diff
// per group, sorted by |Diff| descending (biggest variance drivers first).
function levelRows(actualRows, budgetRows, keyFn, labelKey) {
  const keys = new Set([...actualRows.map(keyFn), ...budgetRows.map(keyFn)]);
  const rows = Array.from(keys).map((key) => {
    const a = sumAmount(actualRows.filter((r) => keyFn(r) === key));
    const b = sumAmount(budgetRows.filter((r) => keyFn(r) === key));
    return { [labelKey]: key, budgetCTC: b, actualCTC: a, diff: b - a, diffPct: b ? ((b - a) / b) * 100 : 0 };
  });
  rows.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return rows;
}

export function render({ db, contentEl, filtersEl }) {
  const actuals = db.ctcActuals.map((r) => enrich(db, r));
  const budget = db.ctcBudget.map((r) => enrich(db, r));

  const years = sortedUnique(actuals.concat(budget), (r) => r.period?.slice(0, 4)).sort();
  const divisions = sortedUnique(db.costCenters, (c) => c.division).sort();
  const departments = sortedUnique(db.costCenters, (c) => c.department).sort();

  // Budget only exists for 2026 — default to it rather than "All", or every
  // variance shown would really just be "2026-only budget minus 2024-2026 actual".
  const budgetYears = sortedUnique(budget, (r) => r.period?.slice(0, 4)).sort();
  let year = budgetYears[budgetYears.length - 1] || "All";
  let month = "All", division = "All", department = "All";
  let drillGL = null, drillDept = null;

  filterSelect(filtersEl, { label: "Year", options: ["All", ...years], value: year, onChange: (v) => { year = v; resetDrill(); draw(); } });
  filterSelect(filtersEl, { label: "Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; resetDrill(); draw(); } });
  filterSelect(filtersEl, { label: "Division", options: ["All", ...divisions], value: division, onChange: (v) => { division = v; resetDrill(); draw(); } });
  filterSelect(filtersEl, { label: "Department", options: ["All", ...departments], value: department, onChange: (v) => { department = v; resetDrill(); draw(); } });

  function resetDrill() { drillGL = null; drillDept = null; }

  function matchesFilters(r) {
    return (year === "All" || r.period?.startsWith(year)) &&
      (month === "All" || Number(r.period?.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)) &&
      (division === "All" || r.division === division) &&
      (department === "All" || r.department === department);
  }

  const columns = (labelKey, labelText) => [
    { key: labelKey, label: labelText },
    { key: "budgetCTC", label: "Budget CTC", num: true, fmt: (v) => fmtMoney(v) },
    { key: "actualCTC", label: "Actual CTC", num: true, fmt: (v) => fmtMoney(v) },
    { key: "diff", label: "Diff", num: true, fmt: (v) => fmtMoney(v) },
    { key: "diffPct", label: "Diff %", num: true, fmt: (v) => fmtPct(v) },
  ];

  function draw() {
    contentEl.innerHTML = "";

    const scopedActuals = actuals.filter(matchesFilters);
    const scopedBudget = budget.filter(matchesFilters);

    const totalActual = sumAmount(scopedActuals);
    const totalBudget = sumAmount(scopedBudget);
    const totalDiff = totalBudget - totalActual;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Budget CTC", value: fmtMoney(totalBudget), note: "selected period" });
    kpiCard(kpiRow, { label: "Actual CTC", value: fmtMoney(totalActual), note: "selected period" });
    kpiCard(kpiRow, {
      label: "CTC Diff", value: fmtMoney(totalDiff), note: totalDiff < 0 ? "over budget" : totalDiff > 0 ? "under budget" : "on budget",
      deltaKind: totalDiff < 0 ? "bad" : totalDiff > 0 ? "good" : null,
    });

    // Breadcrumb
    const crumb = document.createElement("div");
    crumb.className = "card-sub";
    crumb.style.marginBottom = "12px";
    const crumbParts = [{ label: "All Expense Categories", onClick: () => { resetDrill(); draw(); } }];
    if (drillGL) crumbParts.push({ label: drillGL, onClick: () => { drillDept = null; draw(); } });
    if (drillDept) crumbParts.push({ label: drillDept, onClick: () => draw() });
    crumb.innerHTML = crumbParts.map((p, i) => `<a href="#" data-crumb="${i}" style="color:var(--brand-primary);text-decoration:none;">${p.label}</a>`).join(" &rsaquo; ");
    contentEl.appendChild(crumb);
    crumbParts.forEach((p, i) => {
      crumb.querySelector(`[data-crumb="${i}"]`).addEventListener("click", (e) => { e.preventDefault(); p.onClick(); });
    });

    let rows, labelKey, labelText, onRowClick, chartTitle;
    if (!drillGL) {
      rows = levelRows(scopedActuals, scopedBudget, (r) => r.glName, "glName");
      labelKey = "glName"; labelText = "Expense Category (GL)"; chartTitle = "Variance by Expense Category";
      onRowClick = (key) => { drillGL = key; draw(); };
    } else if (!drillDept) {
      const glActuals = scopedActuals.filter((r) => r.glName === drillGL);
      const glBudget = scopedBudget.filter((r) => r.glName === drillGL);
      rows = levelRows(glActuals, glBudget, (r) => r.department, "department");
      labelKey = "department"; labelText = "Department"; chartTitle = `Variance by Department — ${drillGL}`;
      onRowClick = (key) => { drillDept = key; draw(); };
    } else {
      const leafActuals = scopedActuals.filter((r) => r.glName === drillGL && r.department === drillDept);
      const leafBudget = scopedBudget.filter((r) => r.glName === drillGL && r.department === drillDept);
      rows = levelRows(leafActuals, leafBudget, (r) => r.costCenter, "costCenter");
      labelKey = "costCenter"; labelText = "Cost Center"; chartTitle = `Variance by Cost Center — ${drillGL} / ${drillDept}`;
      onRowClick = null;
    }

    const top12 = rows.slice(0, 12);
    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);
    const c1 = chartCard(grid, { title: chartTitle, sub: onRowClick ? "Click a row below to drill in — biggest variances first" : "Leaf level — biggest variances first" });
    barChart(c1, {
      labels: top12.map((r) => r[labelKey]), horizontal: true, showLegend: true,
      datasets: [
        { label: "Budget CTC", data: top12.map((r) => Math.round(r.budgetCTC)) },
        { label: "Actual CTC", data: top12.map((r) => Math.round(r.actualCTC)) },
      ],
    });

    const tableWrap = document.createElement("div");
    tableWrap.className = "card";
    tableWrap.innerHTML = `<h3>${labelText} Detail</h3><div class="card-sub">${onRowClick ? "Click a row to drill in" : "Leaf level"}</div>`;
    const table = buildTable(columns(labelKey, labelText), rows);
    if (onRowClick) {
      Array.from(table.querySelectorAll("tbody tr")).forEach((tr, i) => {
        tr.style.cursor = "pointer";
        tr.addEventListener("click", () => onRowClick(rows[i][labelKey]));
      });
    }
    tableWrap.appendChild(table);
    contentEl.appendChild(tableWrap);
  }

  draw();
}
