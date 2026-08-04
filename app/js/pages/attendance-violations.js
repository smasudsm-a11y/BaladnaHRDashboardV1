import { sortedUnique, fmtInt, fmtDec } from "../data.js";
import { kpiCard, chartCard, lineChart, barChart, filterSelect } from "../charts.js";

export const meta = { id: "attendance", label: "Attendance Violations", subtitle: "Excess-hours and Article 75 case trends across the operational workforce" };

const STANDARD_SHIFT_HOURS = 8;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function weekLabelOf(weekStart) {
  const d = new Date(weekStart);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
function monthKeyOf(dateStr) { return dateStr?.slice(0, 7); } // "YYYY-MM"
function yearKeyOf(dateStr) { return dateStr?.slice(0, 4); } // "YYYY"
function monthLabelOf(monthKey) {
  const [y, m] = monthKey.split("-");
  return `${MONTH_NAMES[Number(m) - 1].slice(0, 3)} ${y}`;
}
function monthIndexOfDate(dateStr) { return Number(dateStr?.slice(5, 7)) - 1; }

// Rolls the weekly excess-hours rows + weekly Article 75 case counts up to the
// requested granularity. Monthly/Yearly buckets assign each week's case count
// to the calendar period its weekStart falls in — the source report only ever
// tracks Article 75 at week grain, so this is the closest a month/year total
// can get without per-case detail.
function buildTrend(excessRows, weeksInScope, granularity) {
  if (granularity === "Weekly") {
    const labels = weeksInScope.map((w) => weekLabelOf(w.weekStart));
    const instances = weeksInScope.map((w) => excessRows.filter((r) => r.violationDate >= w.weekStart && r.violationDate <= w.weekEnd).length);
    const employees = weeksInScope.map((w) => new Set(excessRows.filter((r) => r.violationDate >= w.weekStart && r.violationDate <= w.weekEnd).map((r) => r.employeeId)).size);
    const cases = weeksInScope.map((w) => w.caseCount || 0);
    return { labels, instances, employees, cases };
  }

  const keyOf = granularity === "Yearly" ? yearKeyOf : monthKeyOf;
  const labelOf = granularity === "Yearly" ? (k) => k : monthLabelOf;

  const keySet = new Set();
  weeksInScope.forEach((w) => keySet.add(keyOf(w.weekStart)));
  excessRows.forEach((r) => keySet.add(keyOf(r.violationDate)));
  const orderedKeys = Array.from(keySet).sort();

  const caseByKey = new Map(orderedKeys.map((k) => [k, 0]));
  weeksInScope.forEach((w) => { const k = keyOf(w.weekStart); caseByKey.set(k, caseByKey.get(k) + (w.caseCount || 0)); });

  const instancesByKey = new Map(orderedKeys.map((k) => [k, 0]));
  const employeesByKey = new Map(orderedKeys.map((k) => [k, new Set()]));
  excessRows.forEach((r) => {
    const k = keyOf(r.violationDate);
    instancesByKey.set(k, instancesByKey.get(k) + 1);
    employeesByKey.get(k).add(r.employeeId);
  });

  return {
    labels: orderedKeys.map(labelOf),
    instances: orderedKeys.map((k) => instancesByKey.get(k)),
    employees: orderedKeys.map((k) => employeesByKey.get(k).size),
    cases: orderedKeys.map((k) => caseByKey.get(k)),
  };
}

function renderTrendChart(canvas, granularity, labels, datasets, opts = {}) {
  if (granularity === "Yearly") barChart(canvas, { labels, datasets, ...opts });
  else lineChart(canvas, { labels, datasets, ...opts });
}

export function render({ db, contentEl, filtersEl }) {
  const years = sortedUnique(db.excessHours, (r) => r.violationDate?.slice(0, 4)).sort();
  const yearOptions = ["All", ...years];
  const monthOptions = ["All", ...MONTH_NAMES];
  const divisions = ["All", ...sortedUnique(db.excessHours, (r) => r.division)];
  const granularityOptions = ["Weekly", "Monthly", "Yearly"];
  let year = "All", month = "All", division = "All", granularity = "Monthly";

  filterSelect(filtersEl, { label: "Year", options: yearOptions, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Month", options: monthOptions, value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Division", options: divisions, value: division, onChange: (v) => { division = v; draw(); } });
  filterSelect(filtersEl, { label: "Trend View", options: granularityOptions, value: granularity, onChange: (v) => { granularity = v; draw(); } });

  const weeks = [...db.article75].sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));

  function draw() {
    contentEl.innerHTML = "";
    const rows = db.excessHours.filter((r) =>
      (year === "All" || r.violationDate?.startsWith(year)) &&
      (month === "All" || monthIndexOfDate(r.violationDate) === MONTH_NAMES.indexOf(month)) &&
      (division === "All" || r.division === division));

    const instanceCount = rows.length;
    const employeeCount = new Set(rows.map((r) => r.employeeId)).size;
    const totalExcessHours = rows.reduce((s, r) => s + Math.max(0, (r.totalHours || 0) - STANDARD_SHIFT_HOURS), 0);
    const avgHoursPerInstance = instanceCount ? rows.reduce((s, r) => s + (r.totalHours || 0), 0) / instanceCount : 0;

    const weeksInPeriod = weeks.filter((w) =>
      (year === "All" || w.weekStart?.startsWith(year)) &&
      (month === "All" || monthIndexOfDate(w.weekStart) === MONTH_NAMES.indexOf(month)));
    const article75Cases = weeksInPeriod.reduce((s, w) => s + (w.caseCount || 0), 0);

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

    // Trend charts: Year + Division scope them, same as the snapshot views above —
    // Month does not, since a trend chart restricted to one month is a single point.
    const divFiltered = db.excessHours.filter((r) =>
      (year === "All" || r.violationDate?.startsWith(year)) && (division === "All" || r.division === division));
    const weeksForTrend = weeks.filter((w) => year === "All" || w.weekStart?.startsWith(year));
    const trend = buildTrend(divFiltered, weeksForTrend, granularity);
    const periodNote = year === "All" ? "trailing history" : year;

    const c1 = chartCard(grid, { title: "Excess Hours Trend", sub: `${granularity}, ${periodNote}` });
    renderTrendChart(c1, granularity, trend.labels, [
      { label: "Employees", data: trend.employees },
      { label: "Instances", data: trend.instances },
    ]);

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

    // Article 75 case trend — no per-case detail exists, so a data table instead of a drilldown
    const periodKey = granularity === "Weekly" ? "week" : granularity === "Yearly" ? "year" : "month";
    const periodLabel = granularity === "Weekly" ? "Week" : granularity === "Yearly" ? "Year" : "Month";
    const c4 = chartCard(grid, {
      title: "Article 75 Case Trend", sub: `${granularity} count — no per-case detail is tracked upstream`,
      tableColumns: [{ key: periodKey, label: periodLabel }, { key: "cases", label: "Cases", num: true }],
      tableRows: trend.labels.map((label, i) => ({ [periodKey]: label, cases: trend.cases[i] })),
    });
    renderTrendChart(c4, granularity, trend.labels, [{ label: "Cases", data: trend.cases }], { showLegend: false });
  }

  draw();
}
