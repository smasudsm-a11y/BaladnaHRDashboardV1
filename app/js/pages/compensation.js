import { sortedUnique, sortGrades, avgBy, fmtInt, fmtDec, fmtPct, fmtMoney, salaryBandFor, bandComparablePay, toQarEquivalent, JOB_LEVEL_ORDER, isCurrentlyEmployed, legalEntityAllowed } from "../data.js";
import { kpiCard, chartCard, barChart, bin, filterSelect, legalEntityFilter } from "../charts.js";

export const meta = { id: "compensation", label: "Compensation & Pay Equity", subtitle: "Base pay, total rewards, and internal pay equity" };

// Fixed display order (not alphabetical) — always referenced directly as this
// array, never re-sorted, so the bucket names themselves stay plain/unprefixed.
const BUCKET_ORDER = ["Underpaid", "1st Quartile", "2nd Quartile", "3rd Quartile", "4th Quartile", "Overpaid"];
// grade_tier now uses the same real 9-tier banding as job_level (see
// data.js's JOB_LEVEL_ORDER) -- reused directly here since it's the exact
// same 9 values in the exact same order, not a different scheme.
const TIER_ORDER = JOB_LEVEL_ORDER;

function positioningBucket(rangePenetration) {
  if (rangePenetration === null) return null;
  if (rangePenetration < 0) return "Underpaid";
  if (rangePenetration < 25) return "1st Quartile";
  if (rangePenetration < 50) return "2nd Quartile";
  if (rangePenetration < 75) return "3rd Quartile";
  if (rangePenetration <= 100) return "4th Quartile";
  return "Overpaid";
}

// Gender Pay Gap Index, compa-ratio based (user's call, 2026-10-01; final
// of three versions the same day). History, so it isn't re-litigated:
// 1. Raw female avg / male avg basic read ~176 -- pure workforce mix (~55
//    women, nearly all Staff, vs ~1,577 Labor men on ~1,700 QAR basic).
// 2. Grade-matched basic read 106.8, but Baladna's pay ranges are keyed on
//    grade AND job family, and within a grade women sit in HR/Sales/Admin
//    while men sit in QA/QC/Production/Maintenance -- different ranges.
// 3. This version: each person's compa-ratio (total cash vs THEIR OWN
//    grade + job-family range midpoint -- see bandComparablePay), so the
//    comparison follows the pay policy exactly. Women's avg / men's avg,
//    computed within each workforce category (Staff vs Staff, Labor vs
//    Labor -- Labor sits lower in its ranges and is almost all men), then
//    weighted by women per category. A category needs MIN_PER_GENDER of
//    each gender to count.
// Verified against tenure: Staff women and men with the same tenure sit
// within ~0.02 of each other (<2 yrs 0.99 vs 1.01, 5+ yrs 0.92 vs 0.91).
// What remains is salary compression (new hires ~1.00, 5+ yrs ~0.91), and
// recent hires are disproportionately women.
const MIN_PER_GENDER = 3;
function compaGap(rows) {
  const groups = new Map();
  let totalWomen = 0;
  for (const r of rows) {
    if (r.gender === "Female") totalWomen += 1;
    if (r.compaRatio === null || (r.gender !== "Male" && r.gender !== "Female")) continue;
    const key = r.workforceCategory || "Unclassified";
    if (!groups.has(key)) groups.set(key, { Male: [], Female: [] });
    groups.get(key)[r.gender].push(r.compaRatio);
  }
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  let weighted = 0, women = 0, wSum = 0, mSum = 0;
  for (const g of groups.values()) {
    if (g.Female.length < MIN_PER_GENDER || g.Male.length < MIN_PER_GENDER) continue;
    weighted += (avg(g.Female) / avg(g.Male)) * g.Female.length;
    wSum += avg(g.Female) * g.Female.length;
    mSum += avg(g.Male) * g.Female.length;
    women += g.Female.length;
  }
  return women
    ? { index: (weighted / women) * 100, women, totalWomen, femaleCompa: wSum / women, maleCompa: mSum / women }
    : { index: null, women: 0, totalWomen };
}

function buildRecords(db) {
  const out = [];
  for (const [employeeId, sal] of db.latestBaseSalary) {
    const e = db.employeeIndex.get(employeeId);
    if (!e || !isCurrentlyEmployed(e)) continue;
    const tr = db.latestTotalRewards.get(employeeId);
    const struct = salaryBandFor(db, e, sal);
    // rangePenetration/compaRatio compare TOTAL cash (the figure the SAP
    // bands are defined on -- see bandComparablePay) against the employee's
    // own native-currency band, so no conversion there. baseSalary/totalCash/
    // totalRem on the record are QAR-equivalent instead, since every KPI/
    // chart below this point averages or sums them across employees who may
    // be on QAR or EGP.
    const bandPay = struct ? bandComparablePay(db, employeeId) : null;
    const rangePenetration = bandPay !== null ? ((bandPay - struct.salaryRangeMin) / (struct.salaryRangeMax - struct.salaryRangeMin)) * 100 : null;
    out.push({
      employeeId,
      grade: sal.grade,
      gradeTier: struct ? struct.gradeTier : null,
      baseSalary: toQarEquivalent(sal.baseSalary, sal.currency),
      totalCash: tr ? toQarEquivalent(tr.totalCashCompensation, sal.currency) : null,
      totalRem: tr ? toQarEquivalent(tr.totalRemuneration, sal.currency) : null,
      businessUnit: e.businessUnit,
      legalEntity: e.legalEntity,
      jobLevel: e.jobLevel,
      gender: e.gender,
      workforceCategory: e.workforceCategory,
      compaRatio: bandPay !== null ? bandPay / struct.salaryMidpoint : null,
      rangePenetration,
      positioning: positioningBucket(rangePenetration),
    });
  }
  return out;
}

export function render({ db, contentEl, filtersEl }) {
  const records = buildRecords(db);
  const levels = ["All", ...JOB_LEVEL_ORDER];
  let level = "All";

  legalEntityFilter(filtersEl, { db, onChange: draw });
  filterSelect(filtersEl, { label: "Org Level", options: levels, value: level, onChange: (v) => { level = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const rows = records.filter((r) => legalEntityAllowed(db, r.legalEntity) && (level === "All" || r.jobLevel === level));

    const avgCTC = avgBy(rows, (r) => r.totalCash || 0);
    const avgCompa = avgBy(rows.filter((r) => r.compaRatio !== null), (r) => r.compaRatio);
    const avgPenetration = avgBy(rows.filter((r) => r.rangePenetration !== null), (r) => r.rangePenetration);
    const gap = compaGap(rows);
    const totalCost = rows.reduce((s, r) => s + (r.totalRem || 0), 0);
    const outsideRange = rows.filter((r) => r.positioning === "Underpaid" || r.positioning === "Overpaid").length;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Avg Total Cash Compensation", value: fmtMoney(avgCTC), note: `${fmtInt(rows.length)} active employees` });
    kpiCard(kpiRow, { label: "Avg Compa-Ratio", value: fmtDec(avgCompa, 2), note: "total cash vs. own pay-scale midpoint (Expat / National; 1.00 = at mid)" });
    kpiCard(kpiRow, { label: "Avg Range Penetration", value: fmtPct(avgPenetration), note: "total cash within grade range" });
    kpiCard(kpiRow, {
      label: "Gender Pay Gap Index", value: gap.index === null ? "n/a" : fmtDec(gap.index, 1),
      note: gap.index === null
        ? `too few women and men with a pay range to compare (min ${MIN_PER_GENDER} each)`
        : `position in own pay range, 100 = parity · women ${fmtDec(gap.femaleCompa, 2)} vs men ${fmtDec(gap.maleCompa, 2)} compa-ratio · ${fmtInt(gap.women)} of ${fmtInt(gap.totalWomen)} women`,
      deltaKind: gap.index === null ? undefined : gap.index < 95 ? "bad" : gap.index < 100 ? "warn" : "good",
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
    // (selecting a single Legal Entity would otherwise collapse "by Legal
    // Entity" to one bar) — same convention as every other breakdown chart in the app.
    const levelFiltered = records.filter((r) => level === "All" || r.jobLevel === level);
    const leOrder = sortedUnique(records, (r) => r.legalEntity).sort();
    // Groups where no workforce category meets the minimum are left off the
    // chart (and named in the subtitle) rather than drawn as a misleading 0.
    const gapChart = (groupLabels, rowsFor) => {
      const shown = [], skipped = [];
      for (const label of groupLabels) {
        const g = compaGap(rowsFor(label));
        if (g.totalWomen === 0) continue; // no women at all -- nothing to compare, not worth naming
        if (g.index === null) skipped.push(label);
        else shown.push([`${label} (${g.women}F)`, label, Math.round(g.index * 10) / 10]);
      }
      return { shown, skipped };
    };
    const gapSub = (skipped) => `Women's vs men's position in their own pay range (compa-ratio, 100 = parity)${skipped.length ? ` · too few to compare: ${skipped.join(", ")}` : ""}`;

    const byLe = gapChart(leOrder, (l) => levelFiltered.filter((r) => r.legalEntity === l));
    const c3 = chartCard(grid, { title: "Pay Gap Index by Legal Entity", sub: gapSub(byLe.skipped), drilldown: { records: levelFiltered, matchFn: (r, label) => label.startsWith(`${r.legalEntity} (`), db } });
    barChart(c3, { labels: byLe.shown.map((s) => s[0]), datasets: [{ label: "Pay Gap Index", data: byLe.shown.map((s) => s[2]) }], showLegend: false });

    const leFiltered = records.filter((r) => legalEntityAllowed(db, r.legalEntity));
    const byLevel = gapChart(levels.slice(1), (l) => leFiltered.filter((r) => r.jobLevel === l));
    const c4 = chartCard(grid, { title: "Pay Gap Index by Organisation Level", sub: gapSub(byLevel.skipped), drilldown: { records: leFiltered, matchFn: (r, label) => label.startsWith(`${r.jobLevel} (`), db } });
    barChart(c4, { labels: byLevel.shown.map((s) => s[0]), datasets: [{ label: "Pay Gap Index", data: byLevel.shown.map((s) => s[2]) }], showLegend: false });

    const bucketCounts = BUCKET_ORDER.map((b) => rows.filter((r) => r.positioning === b).length);
    const c5 = chartCard(grid, { title: "Salary Positioning by Quartile", sub: "Where total monthly cash sits within its grade's range", drilldown: { records: rows, matchField: "positioning", db } });
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
