import { sortedUnique, fmtInt, fmtDec } from "../data.js";
import { kpiCard, chartCard, lineChart, barChart, filterSelect } from "../charts.js";

export const meta = { id: "attendance", label: "Attendance Violations", subtitle: "Excess-hours and Article 75 case trends across the operational workforce" };

const STANDARD_SHIFT_HOURS = 8;

function weekLabelOf(weekStart) {
  const d = new Date(weekStart);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function render({ db, contentEl, filtersEl }) {
  const years = sortedUnique(db.excessHours, (r) => r.violationDate?.slice(0, 4)).sort();
  const yearOptions = ["All", ...years];
  const divisions = ["All", ...sortedUnique(db.excessHours, (r) => r.division)];
  let year = "All", division = "All";

  filterSelect(filtersEl, { label: "Year", options: yearOptions, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Division", options: divisions, value: division, onChange: (v) => { division = v; draw(); } });

  const weeks = [...db.article75].sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));

  function draw() {
    contentEl.innerHTML = "";
    const rows = db.excessHours.filter((r) =>
      (year === "All" || r.violationDate?.startsWith(year)) && (division === "All" || r.division === division));

    const instanceCount = rows.length;
    const employeeCount = new Set(rows.map((r) => r.employeeId)).size;
    const totalExcessHours = rows.reduce((s, r) => s + Math.max(0, (r.totalHours || 0) - STANDARD_SHIFT_HOURS), 0);
    const avgHoursPerInstance = instanceCount ? rows.reduce((s, r) => s + (r.totalHours || 0), 0) / instanceCount : 0;

    const weeksInScope = year === "All" ? weeks : weeks.filter((w) => w.weekStart?.startsWith(year));
    const article75Cases = weeksInScope.reduce((s, w) => s + (w.caseCount || 0), 0);

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Excess Hours Instances", value: fmtInt(instanceCount), note: "selected period" });
    kpiCard(kpiRow, { label: "Employees Affected", value: fmtInt(employeeCount), note: "distinct employees, excess hours" });
    kpiCard(kpiRow, { label: "Total Excess Hours", value: fmtInt(totalExcessHours), note: `beyond an ${STANDARD_SHIFT_HOURS}-hour shift` });
    kpiCard(kpiRow, { label: "Avg Hours per Instance", value: fmtDec(avgHoursPerInstance, 1), note: "clock-in to clock-out span" });
    kpiCard(kpiRow, { label: "Article 75 Cases", value: fmtInt(article75Cases), note: "selected period" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    // Weekly trend: Excess Hours instances & employees (division filter applies, year does not — always the full trailing history)
    const divFiltered = db.excessHours.filter((r) => division === "All" || r.division === division);
    const weekLabels = weeks.map((w) => weekLabelOf(w.weekStart));
    const instancesByWeek = weeks.map((w) => divFiltered.filter((r) => r.violationDate >= w.weekStart && r.violationDate <= w.weekEnd).length);
    const employeesByWeek = weeks.map((w) => new Set(divFiltered.filter((r) => r.violationDate >= w.weekStart && r.violationDate <= w.weekEnd).map((r) => r.employeeId)).size);
    const c1 = chartCard(grid, { title: "Excess Hours Trend", sub: "Weekly, trailing history" });
    lineChart(c1, { labels: weekLabels, datasets: [{ label: "Employees", data: employeesByWeek }, { label: "Instances", data: instancesByWeek }] });

    // Division breakdown for the selected period
    const divInstances = new Map();
    const divEmployees = new Map();
    for (const r of rows) {
      divInstances.set(r.division, (divInstances.get(r.division) || 0) + 1);
      if (!divEmployees.has(r.division)) divEmployees.set(r.division, new Set());
      divEmployees.get(r.division).add(r.employeeId);
    }
    const divLabels = Array.from(divInstances.keys()).sort((a, b) => divInstances.get(b) - divInstances.get(a));
    const c2 = chartCard(grid, {
      title: "Excess Hours by Division", sub: "Employees affected vs. total instances",
      drilldown: { records: rows, matchField: "division", db },
    });
    barChart(c2, {
      labels: divLabels,
      datasets: [
        { label: "Employees", data: divLabels.map((d) => divEmployees.get(d).size) },
        { label: "Instances", data: divLabels.map((d) => divInstances.get(d)) },
      ],
    });

    // Department breakdown for the selected period
    const deptCounts = new Map();
    for (const r of rows) deptCounts.set(r.department, (deptCounts.get(r.department) || 0) + 1);
    const deptLabels = Array.from(deptCounts.keys()).sort((a, b) => deptCounts.get(b) - deptCounts.get(a));
    const c3 = chartCard(grid, { title: "Excess Hours by Department", drilldown: { records: rows, matchField: "department", db } });
    barChart(c3, { labels: deptLabels, datasets: [{ label: "Instances", data: deptLabels.map((d) => deptCounts.get(d)) }], horizontal: true, showLegend: false });

    // Article 75 weekly case trend — no per-case detail exists, so a data table instead of a drilldown
    const c4 = chartCard(grid, {
      title: "Article 75 Case Trend", sub: "Weekly count — no per-case detail is tracked upstream",
      tableColumns: [
        { key: "week", label: "Week" },
        { key: "cases", label: "Cases", num: true },
      ],
      tableRows: weeks.map((w) => ({ week: `${w.weekStart} – ${w.weekEnd}`, cases: w.caseCount })),
    });
    lineChart(c4, { labels: weekLabels, datasets: [{ label: "Cases", data: weeks.map((w) => w.caseCount) }], showLegend: false });
  }

  draw();
}
