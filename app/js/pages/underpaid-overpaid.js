import { sortedUnique, sumBy, fmtInt, fmtPct, fmtMoney } from "../data.js";
import { kpiCard, chartCard, barChart, filterSelect } from "../charts.js";

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

function severityBand(pct) {
  if (pct < 10) return "0–9%";
  if (pct < 20) return "10–19%";
  if (pct < 30) return "20–29%";
  if (pct < 40) return "30–39%";
  return "40%+";
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
  }

  draw();
}
