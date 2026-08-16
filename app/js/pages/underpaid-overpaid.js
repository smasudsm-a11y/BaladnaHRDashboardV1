import { sortedUnique, sumBy, fmtInt, fmtPct, fmtMoney } from "../data.js";
import { kpiCard, chartCard, barChart, doughnutChart, filterSelect } from "../charts.js";

// Shares Compensation's access grant (meta.section) rather than needing its
// own Manage Access checkbox — same mechanism as nhp.js sharing training's,
// and for the same reason data.js needs no new SECTION_TABLES entry: any
// user granted "compensation" always has the compensation page id in
// allowedIds too, so that page's own SECTION_TABLES entry already fetches
// base_salary/employee_master/salary_structure for this page to reuse.
export const meta = {
  id: "underpaid-overpaid", section: "compensation", sectionLabel: "Compensation & Pay Equity",
  label: "Underpaid & Overpaid Analysis",
  subtitle: "How far outside grade range base salaries sit, and by how much",
};

const SEVERITY_BANDS = ["0–9%", "10–19%", "20–29%", "30–39%", "40%+"];
// Matches the Power BI report's "Count/% By Quartiles" chart exactly — same
// 6-bucket definition as compensation.js's own BUCKET_ORDER/positioningBucket
// (duplicated here rather than imported, same as every other page-local
// helper in this app; the two must be kept in sync if the bucketing ever changes).
const QUARTILE_BUCKETS = ["Underpaid", "1st Quartile", "2nd Quartile", "3rd Quartile", "4th Quartile", "Overpaid"];
// The Power BI report's "Employees by Category" donut / "Salary Positioning
// by Group/Cluster/Company" stacked bar both use this simpler 3-way split —
// Within collapses all 4 quartile buckets into one category.
const CATEGORY_ORDER = ["Within", "Underpaid", "Overpaid"];

function severityBand(pct) {
  if (pct < 10) return "0–9%";
  if (pct < 20) return "10–19%";
  if (pct < 30) return "20–29%";
  if (pct < 40) return "30–39%";
  return "40%+";
}

function positioningBucket(rangePenetration) {
  if (rangePenetration < 0) return "Underpaid";
  if (rangePenetration < 25) return "1st Quartile";
  if (rangePenetration < 50) return "2nd Quartile";
  if (rangePenetration < 75) return "3rd Quartile";
  if (rangePenetration <= 100) return "4th Quartile";
  return "Overpaid";
}

function buildRecords(db) {
  const out = [];
  for (const [employeeId, sal] of db.latestBaseSalary) {
    const e = db.employeeIndex.get(employeeId);
    if (!e || e.employmentStatus !== "Active") continue;
    const struct = db.salaryStructureIndex.get(sal.grade);
    if (!struct) continue;
    const { salaryRangeMin: min, salaryRangeMax: max } = struct;
    const underpaidAmount = sal.baseSalary < min ? min - sal.baseSalary : 0;
    const overpaidAmount = sal.baseSalary > max ? sal.baseSalary - max : 0;
    const rangePenetration = ((sal.baseSalary - min) / (max - min)) * 100;
    out.push({
      employeeId,
      employeeName: e.employeeName,
      grade: sal.grade,
      baseSalary: sal.baseSalary,
      businessUnit: e.businessUnit,
      jobLevel: e.jobLevel,
      isUnderpaid: underpaidAmount > 0,
      isOverpaid: overpaidAmount > 0,
      underpaidAmount,
      overpaidAmount,
      underpaidSeverity: underpaidAmount > 0 ? severityBand((underpaidAmount / min) * 100) : null,
      overpaidSeverity: overpaidAmount > 0 ? severityBand((overpaidAmount / max) * 100) : null,
      positioning: positioningBucket(rangePenetration),
      category: underpaidAmount > 0 ? "Underpaid" : overpaidAmount > 0 ? "Overpaid" : "Within",
    });
  }
  return out;
}

export function render({ db, contentEl, filtersEl }) {
  const records = buildRecords(db);
  const bus = ["All", ...sortedUnique(records, (r) => r.businessUnit)];
  const levels = ["All", "Staff", "Supervisory", "Managerial", "Executive"];
  let bu = "All", level = "All";

  filterSelect(filtersEl, { label: "Business Unit", options: bus, value: bu, onChange: (v) => { bu = v; draw(); } });
  filterSelect(filtersEl, { label: "Org Level", options: levels, value: level, onChange: (v) => { level = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const rows = records.filter((r) => (bu === "All" || r.businessUnit === bu) && (level === "All" || r.jobLevel === level));
    const underpaid = rows.filter((r) => r.isUnderpaid);
    const overpaid = rows.filter((r) => r.isOverpaid);
    const underpaidTotal = sumBy(underpaid, (r) => r.underpaidAmount);
    const overpaidTotal = sumBy(overpaid, (r) => r.overpaidAmount);

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Employees Evaluated", value: fmtInt(rows.length) });
    kpiCard(kpiRow, { label: "Underpaid Employees", value: fmtInt(underpaid.length), note: `${fmtPct(rows.length ? (underpaid.length / rows.length) * 100 : 0)} of evaluated` });
    kpiCard(kpiRow, { label: "Difference from Min Salary", value: fmtMoney(underpaidTotal), note: "total shortfall vs. grade minimum" });
    kpiCard(kpiRow, { label: "Overpaid Employees", value: fmtInt(overpaid.length), note: `${fmtPct(rows.length ? (overpaid.length / rows.length) * 100 : 0)} of evaluated` });
    kpiCard(kpiRow, { label: "Difference from Max Salary", value: fmtMoney(overpaidTotal), note: "total excess vs. grade maximum" });

    // Overview section — matches the Power BI report's "Count/% By
    // Quartiles" and "Employees by Category" visuals, which sit above the
    // Underpaid/Overpaid KPI split there. Both respect both filters, same
    // as the KPI row above.
    const overviewGrid = document.createElement("div");
    overviewGrid.className = "grid-2";
    contentEl.appendChild(overviewGrid);

    const quartileCounts = QUARTILE_BUCKETS.map((b) => rows.filter((r) => r.positioning === b).length);
    const cQuartiles = chartCard(overviewGrid, {
      title: "Count / % By Quartiles", sub: "Full population — where base salary sits within its grade's range",
      drilldown: { records: rows, matchField: "positioning", db },
    });
    barChart(cQuartiles, { labels: QUARTILE_BUCKETS, datasets: [{ label: "Employees", data: quartileCounts }], showLegend: false });

    const categoryCounts = CATEGORY_ORDER.map((c) => rows.filter((r) => r.category === c).length);
    const cCategory = chartCard(overviewGrid, {
      title: "Employees by Category", sub: "Within range vs. underpaid vs. overpaid",
      drilldown: { records: rows, matchField: "category", db },
    });
    doughnutChart(cCategory, { labels: CATEGORY_ORDER, data: categoryCounts });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const underpaidCounts = SEVERITY_BANDS.map((b) => underpaid.filter((r) => r.underpaidSeverity === b).length);
    const c1 = chartCard(grid, {
      title: "Underpaid Employees by Severity", sub: "% below grade minimum",
      drilldown: { records: underpaid, matchField: "underpaidSeverity", db },
    });
    barChart(c1, { labels: SEVERITY_BANDS, datasets: [{ label: "Employees", data: underpaidCounts }], showLegend: false });

    const underpaidAmounts = SEVERITY_BANDS.map((b) => sumBy(underpaid.filter((r) => r.underpaidSeverity === b), (r) => r.underpaidAmount));
    const c2 = chartCard(grid, {
      title: "Underpaid $ Shortfall by Severity", sub: "Sum of difference from grade minimum",
      drilldown: { records: underpaid, matchField: "underpaidSeverity", db },
    });
    barChart(c2, { labels: SEVERITY_BANDS, datasets: [{ label: "Shortfall (QAR)", data: underpaidAmounts.map(Math.round) }], showLegend: false });

    const overpaidCounts = SEVERITY_BANDS.map((b) => overpaid.filter((r) => r.overpaidSeverity === b).length);
    const c3 = chartCard(grid, {
      title: "Overpaid Employees by Severity", sub: "% above grade maximum",
      drilldown: { records: overpaid, matchField: "overpaidSeverity", db },
    });
    barChart(c3, { labels: SEVERITY_BANDS, datasets: [{ label: "Employees", data: overpaidCounts }], showLegend: false });

    const overpaidAmounts = SEVERITY_BANDS.map((b) => sumBy(overpaid.filter((r) => r.overpaidSeverity === b), (r) => r.overpaidAmount));
    const c4 = chartCard(grid, {
      title: "Overpaid $ Excess by Severity", sub: "Sum of difference from grade maximum",
      drilldown: { records: overpaid, matchField: "overpaidSeverity", db },
    });
    barChart(c4, { labels: SEVERITY_BANDS, datasets: [{ label: "Excess (QAR)", data: overpaidAmounts.map(Math.round) }], showLegend: false });

    // "By Business Unit" section — this app is Baladna-only (single
    // company, no Group/Cluster concept), so Business Unit stands in for
    // the Power BI report's "by Group/Cluster/Company" breakdowns, same
    // substitution this app makes everywhere its schema has no literal
    // Group-wide equivalent. Respects the Org Level filter but not the
    // page's own Business Unit filter — same convention as compensation.js's
    // "by Business Unit" charts (selecting a single BU would otherwise
    // collapse this to one bar).
    const buGrid = document.createElement("div");
    buGrid.className = "grid-2";
    contentEl.appendChild(buGrid);

    const levelFiltered = records.filter((r) => level === "All" || r.jobLevel === level);
    const buOrder = sortedUnique(records, (r) => r.businessUnit).sort();

    const positioningByBu = CATEGORY_ORDER.map((c) => buOrder.map((b) => {
      const inBu = levelFiltered.filter((r) => r.businessUnit === b);
      return inBu.length ? (inBu.filter((r) => r.category === c).length / inBu.length) * 100 : 0;
    }));
    const cPositioningBu = chartCard(buGrid, {
      title: "Salary Positioning by Business Unit", sub: "% within range vs. underpaid vs. overpaid",
      drilldown: { records: levelFiltered, matchField: "businessUnit", db },
    });
    barChart(cPositioningBu, {
      labels: buOrder,
      datasets: CATEGORY_ORDER.map((c, i) => ({ label: c, data: positioningByBu[i].map((v) => Math.round(v * 10) / 10), stacked: true })),
      stacked: true,
    });

    const underpaidByBu = buOrder.map((b) => levelFiltered.filter((r) => r.businessUnit === b && r.isUnderpaid).length);
    const cUnderpaidBu = chartCard(buGrid, {
      title: "Underpaid Employees by Business Unit",
      drilldown: { records: levelFiltered.filter((r) => r.isUnderpaid), matchField: "businessUnit", db },
    });
    barChart(cUnderpaidBu, { labels: buOrder, datasets: [{ label: "Underpaid", data: underpaidByBu }], showLegend: false });

    const overpaidByBu = buOrder.map((b) => levelFiltered.filter((r) => r.businessUnit === b && r.isOverpaid).length);
    const cOverpaidBu = chartCard(buGrid, {
      title: "Overpaid Employees by Business Unit",
      drilldown: { records: levelFiltered.filter((r) => r.isOverpaid), matchField: "businessUnit", db },
    });
    barChart(cOverpaidBu, { labels: buOrder, datasets: [{ label: "Overpaid", data: overpaidByBu }], showLegend: false });
  }

  draw();
}
