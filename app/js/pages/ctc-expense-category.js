import { sortedUnique, fmtMoney, fmtPct, fmtInt } from "../data.js";
import { kpiCard, chartCard, barChart, filterSelect, buildTable } from "../charts.js";

export const meta = {
  id: "ctc-expense-category", section: "ctc", sectionLabel: "CTC Report",
  label: "CTC by Expense Category",
  subtitle: "Cost-to-company by GL expense line, budget vs. actual",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function enrich(db, row) {
  const cc = db.costCenterIndex.get(row.costCenter);
  return { ...row, division: cc?.division || "Unclassified", department: cc?.department || "Unclassified" };
}

function sumAmount(rows) {
  return rows.reduce((s, r) => s + (r.amount || 0), 0);
}

export function render({ db, contentEl, filtersEl }) {
  const actuals = db.ctcActuals.map((r) => enrich(db, r));
  const budget = db.ctcBudget.map((r) => enrich(db, r));

  const years = sortedUnique(actuals.concat(budget), (r) => r.period?.slice(0, 4)).sort();
  const divisions = sortedUnique(db.costCenters, (c) => c.division).sort();
  const departments = sortedUnique(db.costCenters, (c) => c.department).sort();

  // Budget only exists for 2026 — default to it rather than "All", or the
  // Budget/Actual comparison mixes a 2026-only total against 2024-2026.
  const budgetYears = sortedUnique(budget, (r) => r.period?.slice(0, 4)).sort();
  let year = budgetYears[budgetYears.length - 1] || "All";
  let month = "All", division = "All", department = "All";

  filterSelect(filtersEl, { label: "Year", options: ["All", ...years], value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Division", options: ["All", ...divisions], value: division, onChange: (v) => { division = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: ["All", ...departments], value: department, onChange: (v) => { department = v; draw(); } });

  function matchesFilters(r) {
    return (year === "All" || r.period?.startsWith(year)) &&
      (month === "All" || Number(r.period?.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)) &&
      (division === "All" || r.division === division) &&
      (department === "All" || r.department === department);
  }

  function draw() {
    contentEl.innerHTML = "";

    const rowsActual = actuals.filter(matchesFilters);
    const rowsBudget = budget.filter(matchesFilters);
    const actualCTC = sumAmount(rowsActual);
    const budgetCTC = sumAmount(rowsBudget);
    const diff = budgetCTC - actualCTC;
    const diffPct = budgetCTC ? (diff / budgetCTC) * 100 : 0;

    const byGLActual = new Map();
    for (const r of rowsActual) byGLActual.set(r.glName, (byGLActual.get(r.glName) || 0) + r.amount);
    const topGL = Array.from(byGLActual.entries()).sort((a, b) => b[1] - a[1])[0];

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Budget CTC", value: fmtMoney(budgetCTC), note: "selected period" });
    kpiCard(kpiRow, { label: "Actual CTC", value: fmtMoney(actualCTC), note: "selected period" });
    kpiCard(kpiRow, {
      label: "CTC Diff", value: fmtMoney(diff), note: `${fmtPct(diffPct)} of budget`,
      deltaKind: diff < 0 ? "bad" : diff > 0 ? "good" : null,
    });
    kpiCard(kpiRow, { label: "Expense Categories", value: fmtInt(byGLActual.size), note: "distinct GL lines, actual" });
    kpiCard(kpiRow, { label: "Largest Category", value: topGL ? fmtMoney(topGL[1]) : "—", note: topGL ? topGL[0] : "selected period" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const byGLBudget = new Map();
    for (const r of rowsBudget) byGLBudget.set(r.glName, (byGLBudget.get(r.glName) || 0) + r.amount);
    const glOrder = Array.from(new Set([...byGLActual.keys(), ...byGLBudget.keys()])).sort((a, b) => (byGLActual.get(b) || 0) - (byGLActual.get(a) || 0));

    const c1 = chartCard(grid, {
      title: "CTC by Expense Category", sub: "Budget vs. actual, selected period",
      drilldown: { records: rowsActual.concat(rowsBudget), matchField: "glName", db },
    });
    barChart(c1, {
      labels: glOrder, horizontal: true,
      datasets: [
        { label: "Budget CTC", data: glOrder.map((g) => Math.round(byGLBudget.get(g) || 0)) },
        { label: "Actual CTC", data: glOrder.map((g) => Math.round(byGLActual.get(g) || 0)) },
      ],
    });

    const columns = [
      { key: "glName", label: "Expense Category (GL)" },
      { key: "budgetCTC", label: "Budget CTC", num: true, fmt: (v) => fmtMoney(v) },
      { key: "actualCTC", label: "Actual CTC", num: true, fmt: (v) => fmtMoney(v) },
      { key: "diff", label: "Diff", num: true, fmt: (v) => fmtMoney(v) },
      { key: "diffPct", label: "Diff %", num: true, fmt: (v) => fmtPct(v) },
    ];
    const tableRows = glOrder.map((g) => {
      const b = byGLBudget.get(g) || 0, a = byGLActual.get(g) || 0;
      return { glName: g, budgetCTC: b, actualCTC: a, diff: b - a, diffPct: b ? ((b - a) / b) * 100 : 0 };
    });
    const tableWrap = document.createElement("div");
    tableWrap.className = "card";
    tableWrap.innerHTML = `<h3>Expense Category Detail</h3><div class="card-sub">All GL lines, selected period</div>`;
    tableWrap.appendChild(buildTable(columns, tableRows));
    contentEl.appendChild(tableWrap);
  }

  draw();
}
