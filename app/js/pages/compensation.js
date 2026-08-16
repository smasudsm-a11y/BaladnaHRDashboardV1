import { sortedUnique, sortGrades, avgBy, fmtInt, fmtDec, fmtPct, fmtMoney } from "../data.js";
import { kpiCard, chartCard, barChart, bin, filterSelect } from "../charts.js";

export const meta = { id: "compensation", label: "Compensation & Pay Equity", subtitle: "Base pay, total rewards, and internal pay equity" };

// Fixed display order (not alphabetical) — always referenced directly as this
// array, never re-sorted, so the bucket names themselves stay plain/unprefixed.
const BUCKET_ORDER = ["Underpaid", "1st Quartile", "2nd Quartile", "3rd Quartile", "4th Quartile", "Overpaid"];
const TIER_ORDER = ["Junior", "Mid", "Senior", "Executive"];

function positioningBucket(rangePenetration) {
  if (rangePenetration === null) return null;
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
    const tr = db.latestTotalRewards.get(employeeId);
    const struct = db.salaryStructureIndex.get(sal.grade);
    const rangePenetration = struct ? ((sal.baseSalary - struct.salaryRangeMin) / (struct.salaryRangeMax - struct.salaryRangeMin)) * 100 : null;
    out.push({
      employeeId,
      grade: sal.grade,
      gradeTier: struct ? struct.gradeTier : null,
      baseSalary: sal.baseSalary,
      totalCash: tr ? tr.totalCashCompensation : null,
      totalRem: tr ? tr.totalRemuneration : null,
      businessUnit: e.businessUnit,
      jobLevel: e.jobLevel,
      gender: e.gender,
      workforceCategory: e.workforceCategory,
      compaRatio: struct ? sal.baseSalary / struct.salaryMidpoint : null,
      rangePenetration,
      positioning: positioningBucket(rangePenetration),
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

    const avgCTC = avgBy(rows, (r) => r.totalCash || 0);
    const avgCompa = avgBy(rows.filter((r) => r.compaRatio !== null), (r) => r.compaRatio);
    const avgPenetration = avgBy(rows.filter((r) => r.rangePenetration !== null), (r) => r.rangePenetration);
    const male = rows.filter((r) => r.gender === "Male");
    const female = rows.filter((r) => r.gender === "Female");
    const avgMale = avgBy(male, (r) => r.baseSalary);
    const avgFemale = avgBy(female, (r) => r.baseSalary);
    const payGapIndex = avgMale ? (avgFemale / avgMale) * 100 : 0;
    const totalCost = rows.reduce((s, r) => s + (r.totalRem || 0), 0);
    const outsideRange = rows.filter((r) => r.positioning === "Underpaid" || r.positioning === "Overpaid").length;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Avg Total Cash Compensation", value: fmtMoney(avgCTC), note: `${fmtInt(rows.length)} active employees` });
    kpiCard(kpiRow, { label: "Avg Compa-Ratio", value: fmtDec(avgCompa, 2), note: "1.00 = at grade midpoint" });
    kpiCard(kpiRow, { label: "Avg Range Penetration", value: fmtPct(avgPenetration) });
    kpiCard(kpiRow, {
      label: "Gender Pay Gap Index", value: fmtDec(payGapIndex, 1),
      note: `Female avg ${fmtMoney(avgFemale)} vs Male avg ${fmtMoney(avgMale)}`,
      deltaKind: payGapIndex < 95 ? "bad" : payGapIndex < 100 ? "warn" : "good",
    });
    kpiCard(kpiRow, { label: "Monthly Compensation Cost", value: fmtMoney(totalCost), note: "sum of total remuneration" });
    kpiCard(kpiRow, { label: "Outside Salary Range", value: fmtPct(rows.length ? (outsideRange / rows.length) * 100 : 0), note: `${fmtInt(outsideRange)} underpaid or overpaid` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const gradeOrder = sortGrades(sortedUnique(rows, (r) => r.grade));
    const ctcByGrade = gradeOrder.map((g) => avgBy(rows.filter((r) => r.grade === g), (r) => r.totalCash || 0));
    const c1 = chartCard(grid, { title: "CTC by Grade", sub: "Average total cash compensation", drilldown: { records: rows, matchField: "grade", db } });
    barChart(c1, { labels: gradeOrder, datasets: [{ label: "Avg CTC", data: ctcByGrade.map((v) => Math.round(v)) }], showLegend: false });

    const salaries = rows.map((r) => r.baseSalary);
    const { labels: binLabels, counts } = bin(salaries, 5000);
    const c2 = chartCard(grid, { title: "Salary Distribution", sub: "Base salary histogram (QAR, 5k bins)" });
    barChart(c2, { labels: binLabels, datasets: [{ label: "Employees", data: counts }], showLegend: false });

    // Each breakdown chart respects the OTHER filter but not its own dimension
    // (selecting a single Business Unit would otherwise collapse "by Business
    // Unit" to one bar) — same convention as every other breakdown chart in the app.
    const levelFiltered = records.filter((r) => level === "All" || r.jobLevel === level);
    const buOrder = sortedUnique(records, (r) => r.businessUnit).sort();
    const gapByBu = buOrder.map((b) => {
      const m = avgBy(levelFiltered.filter((r) => r.businessUnit === b && r.gender === "Male"), (r) => r.baseSalary);
      const f = avgBy(levelFiltered.filter((r) => r.businessUnit === b && r.gender === "Female"), (r) => r.baseSalary);
      return m ? (f / m) * 100 : 0;
    });
    const c3 = chartCard(grid, { title: "Pay Gap Index by Business Unit", sub: "Female avg base salary as % of male avg (100 = parity)", drilldown: { records: levelFiltered, matchField: "businessUnit", db } });
    barChart(c3, { labels: buOrder, datasets: [{ label: "Pay Gap Index", data: gapByBu.map((v) => Math.round(v * 10) / 10) }], showLegend: false });

    const buFiltered = records.filter((r) => bu === "All" || r.businessUnit === bu);
    const gapByLevel = levels.slice(1).map((l) => {
      const m = avgBy(buFiltered.filter((r) => r.jobLevel === l && r.gender === "Male"), (r) => r.baseSalary);
      const f = avgBy(buFiltered.filter((r) => r.jobLevel === l && r.gender === "Female"), (r) => r.baseSalary);
      return m ? (f / m) * 100 : 0;
    });
    const c4 = chartCard(grid, { title: "Pay Gap Index by Organisation Level", drilldown: { records: buFiltered, matchField: "jobLevel", db } });
    barChart(c4, { labels: levels.slice(1), datasets: [{ label: "Pay Gap Index", data: gapByLevel.map((v) => Math.round(v * 10) / 10) }], showLegend: false });

    const bucketCounts = BUCKET_ORDER.map((b) => rows.filter((r) => r.positioning === b).length);
    const c5 = chartCard(grid, { title: "Salary Positioning by Quartile", sub: "Where base salary sits within its grade's range", drilldown: { records: rows, matchField: "positioning", db } });
    barChart(c5, { labels: BUCKET_ORDER, datasets: [{ label: "Employees", data: bucketCounts }], showLegend: false });

    // Grade tier (Junior/Mid/Senior/Executive, from salary_structure.grade_tier
    // — see 17_phase_f.sql) split Staff vs. Labor (workforce_category).
    const tierRows = rows.filter((r) => r.gradeTier);
    const staffByTier = TIER_ORDER.map((t) => avgBy(tierRows.filter((r) => r.gradeTier === t && r.workforceCategory === "Staff" && r.rangePenetration !== null), (r) => r.rangePenetration));
    const laborByTier = TIER_ORDER.map((t) => avgBy(tierRows.filter((r) => r.gradeTier === t && r.workforceCategory === "Labor" && r.rangePenetration !== null), (r) => r.rangePenetration));
    const c6 = chartCard(grid, {
      title: "Salary Positioning by Grade Tier", sub: "Avg range penetration %, Staff vs. Labor",
      drilldown: { records: tierRows, matchField: "gradeTier", db },
    });
    barChart(c6, { labels: TIER_ORDER, datasets: [
      { label: "Staff", data: staffByTier.map((v) => Math.round(v * 10) / 10) },
      { label: "Labor", data: laborByTier.map((v) => Math.round(v * 10) / 10) },
    ] });
  }

  draw();
}
