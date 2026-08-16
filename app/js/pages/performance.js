import { sortedUnique, sortGrades, withEmployeeFields, countUnique, fmtInt, fmtDec, fmtPct } from "../data.js";
import { kpiCard, chartCard, barChart, filterSelect, noteBanner } from "../charts.js";

export const meta = { id: "performance", label: "Performance", subtitle: "Rating distribution, department trends, and high/low performers" };

const RATING_ORDER = ["Below Expectations", "Meets Some Expectations", "Meets Expectations", "Exceeds Expectations", "Exceptional"];
const RATING_SCORE = Object.fromEntries(RATING_ORDER.map((r, i) => [r, i + 1]));

// A forced-distribution policy curve (like a bell-curve calibration
// guideline), not per-employee data — hardcoded the same way SEVERITY_BANDS/
// RATING_ORDER are, since there's no live source for what a company's target
// rating shape "should" be. Matches the Power BI report's "Target
// Distribution" row; sums to 100.
const TARGET_DISTRIBUTION = { "Below Expectations": 5, "Meets Some Expectations": 15, "Meets Expectations": 60, "Exceeds Expectations": 15, "Exceptional": 5 };
// Same reasoning — a plausible round target for the post-calibration
// average score, not reconciled against anything real.
const POST_CALIBRATION_TARGET = 3.0;

export function render({ db, contentEl, filtersEl }) {
  const enriched = withEmployeeFields(db, db.performance, ["department", "jobGrade", "terminationDate"]);
  const realCycles = sortedUnique(enriched, (p) => p.performanceCycle).sort();
  const cycles = ["All", ...realCycles];
  const depts = ["All", ...sortedUnique(enriched, (p) => p.department)];
  // Defaults to the latest cycle, not "All" — "Appraisals"/"Completion %" compare
  // appraisal count against CURRENT active headcount, so spanning multiple cycles
  // (which include employees since terminated) would push completion over 100%,
  // the same reasoning CTC Report's pages default their Year filter away from "All".
  let cycle = realCycles[realCycles.length - 1] || "All", dept = "All";

  filterSelect(filtersEl, { label: "Performance Cycle", options: cycles, value: cycle, onChange: (v) => { cycle = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const rows = enriched.filter((p) => (cycle === "All" || p.performanceCycle === cycle) && (dept === "All" || p.department === dept));

    const high = rows.filter((p) => p.overallRating === "Exceeds Expectations" || p.overallRating === "Exceptional").length;
    const low = rows.filter((p) => p.overallRating === "Below Expectations").length;
    const avgGoal = rows.length ? rows.reduce((s, p) => s + p.goalScore, 0) / rows.length : 0;
    const avgComp = rows.length ? rows.reduce((s, p) => s + p.competencyScore, 0) / rows.length : 0;
    const promo = rows.filter((p) => p.promotionRecommendation === "Yes").length;
    // overallRating is always the post-calibration value (identical to calibrationRating
    // in every row) — managerRating is the pre-calibration input, so comparing the two
    // directly gives the calibration-shift view without needing a separate field.
    const adjusted = rows.filter((p) => p.managerRating !== p.overallRating).length;

    // "Completion %" is unique employees appraised ÷ active employees eligible in
    // scope — using unique employees rather than raw row count, since a row here
    // is one performance-cycle record and an employee can have several across
    // cycles/years (with "Performance Cycle" defaulted to "All"), which would
    // otherwise push this over 100%. There's no completion-status field on this
    // table (every row is already a finalized rating), so "completed" is measured
    // against the eligible workforce rather than a draft/in-progress count that
    // doesn't exist.
    const eligibleActive = db.employeeMaster.filter((e) => e.employmentStatus === "Active" && (dept === "All" || e.department === dept)).length;
    const appraisedEmployees = countUnique(rows, (p) => p.employeeId);
    const completionPct = eligibleActive ? (appraisedEmployees / eligibleActive) * 100 : 0;

    // "Deleted Appraisals" (Power BI concept: a cycle's record pulled from
    // the final calibrated set) — derived from a real signal already on
    // this page, not a new field: an appraisal whose employee has since
    // left the company, same early-termination-as-proxy reasoning as
    // Probation & PIP's outcome derivation.
    const deleted = rows.filter((p) => p.terminationDate);
    const completedAppraisals = rows.length - deleted.length;

    const preAvg = rows.length ? rows.reduce((s, p) => s + RATING_SCORE[p.managerRating], 0) / rows.length : 0;
    const postAvg = rows.length ? rows.reduce((s, p) => s + RATING_SCORE[p.overallRating], 0) / rows.length : 0;
    const calibrationDelta = postAvg - preAvg;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "High Performers", value: fmtPct(rows.length ? (high / rows.length) * 100 : 0), note: `${fmtInt(high)} Exceeds/Exceptional` });
    kpiCard(kpiRow, { label: "Low Performers", value: fmtPct(rows.length ? (low / rows.length) * 100 : 0), note: `${fmtInt(low)} Below Expectations` });
    kpiCard(kpiRow, { label: "Avg Goal Score", value: fmtDec(avgGoal, 2) });
    kpiCard(kpiRow, { label: "Avg Competency Score", value: fmtDec(avgComp, 2) });
    kpiCard(kpiRow, { label: "Promotion Recommendation Rate", value: fmtPct(rows.length ? (promo / rows.length) * 100 : 0), note: `${fmtInt(promo)} recommended` });
    kpiCard(kpiRow, { label: "Ratings Adjusted in Calibration", value: fmtPct(rows.length ? (adjusted / rows.length) * 100 : 0), note: `${fmtInt(adjusted)} changed from manager's initial rating` });
    kpiCard(kpiRow, { label: "Appraisals", value: fmtInt(rows.length), note: "selected cycle/department" });
    kpiCard(kpiRow, { label: "Completed Appraisals", value: fmtInt(completedAppraisals), note: `${fmtInt(deleted.length)} deleted, excluded` });
    kpiCard(kpiRow, { label: "Completion %", value: fmtPct(completionPct), note: `${fmtInt(appraisedEmployees)} of ${fmtInt(eligibleActive)} eligible employees appraised` });
    kpiCard(kpiRow, { label: "Deleted Appraisals", value: fmtInt(deleted.length), note: "employee left before cycle closed", deltaKind: deleted.length ? "bad" : "good" });
    kpiCard(kpiRow, { label: "Pre Overall Average", value: fmtDec(preAvg, 2), note: "manager's initial rating, 1–5 scale" });
    kpiCard(kpiRow, {
      label: "Post Overall Average", value: fmtDec(postAvg, 2),
      note: `${calibrationDelta >= 0 ? "▲" : "▼"} ${fmtDec(Math.abs(calibrationDelta), 2)} vs. pre · Target: ${fmtDec(POST_CALIBRATION_TARGET, 2)}`,
      deltaKind: postAvg >= POST_CALIBRATION_TARGET ? "good" : "bad",
    });

    noteBanner(contentEl, `<b>Data gap flagged in PRD (§8.9):</b> the 9-Box Performance × Potential grid requires a "Potential" rating input that is not currently captured alongside Overall Rating. This page shows the Rating Distribution and departmental breakdown that <i>are</i> supported by current data; the 9-box view is omitted pending that data-capture gap being closed with HRIS.`);

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const dist = RATING_ORDER.map((r) => rows.filter((p) => p.overallRating === r).length);
    const c1 = chartCard(grid, { title: "Rating Distribution", sub: "Bell curve across the 5-point scale", drilldown: { records: rows, matchField: "overallRating", db } });
    barChart(c1, { labels: RATING_ORDER, datasets: [{ label: "Employees", data: dist }], showLegend: false });

    const deptOrder = sortedUnique(enriched, (p) => p.department).sort();
    const avgRatingByDept = deptOrder.map((d) => {
      const dr = rows.filter((p) => p.department === d);
      return dr.length ? dr.reduce((s, p) => s + RATING_SCORE[p.overallRating], 0) / dr.length : 0;
    });
    const c2 = chartCard(grid, { title: "Average Rating by Department", sub: "1 = Below Expectations, 5 = Exceptional", drilldown: { records: rows, matchField: "department", db } });
    barChart(c2, { labels: deptOrder, datasets: [{ label: "Avg Rating", data: avgRatingByDept.map((v) => Math.round(v * 100) / 100) }], horizontal: true, showLegend: false });

    const c3 = chartCard(grid, {
      title: "Promotion Recommendations",
      drilldown: { records: rows, matchFn: (r, label) => (label === "Recommended") === (r.promotionRecommendation === "Yes"), db },
    });
    const promoNo = rows.length - promo;
    barChart(c3, { labels: ["Recommended", "Not Recommended"], datasets: [{ label: "Employees", data: [promo, promoNo] }], showLegend: false });

    const cycleOrder = sortedUnique(enriched, (p) => p.performanceCycle).sort();
    const c4 = chartCard(grid, {
      title: "Ratings by Cycle", sub: "Trend across performance cycles",
      drilldown: { records: enriched.filter((p) => dept === "All" || p.department === dept), matchField: "performanceCycle", db },
    });
    const highSeries = cycleOrder.map((cy) => {
      const cr = enriched.filter((p) => p.performanceCycle === cy && (dept === "All" || p.department === dept));
      return cr.length ? (cr.filter((p) => p.overallRating === "Exceeds Expectations" || p.overallRating === "Exceptional").length / cr.length) * 100 : 0;
    });
    barChart(c4, { labels: cycleOrder, datasets: [{ label: "% High Performers", data: highSeries.map((v) => Math.round(v * 10) / 10) }], showLegend: false });

    const preDist = RATING_ORDER.map((r) => rows.filter((p) => p.managerRating === r).length);
    const c5 = chartCard(grid, { title: "Pre vs. Post-Calibration Ratings", sub: "Manager's initial rating vs. final calibrated rating" });
    barChart(c5, { labels: RATING_ORDER, datasets: [{ label: "Manager Rating (Pre)", data: preDist }, { label: "Calibrated Rating (Post)", data: dist }] });

    // Matches the Power BI report's "Ratings Distribution" 3-row 100%
    // stacked visual (Pre-Calibration / Target Distribution / Post-Calibration,
    // each segmented across the 5 rating bands) — no drilldown, same as
    // every other pure-percentage summary chart in this app (e.g.
    // ctc-budget-actual.js's trend charts).
    const prePct = RATING_ORDER.map((_, i) => (rows.length ? (preDist[i] / rows.length) * 100 : 0));
    const postPct = RATING_ORDER.map((_, i) => (rows.length ? (dist[i] / rows.length) * 100 : 0));
    const c7 = chartCard(grid, { title: "Ratings Distribution — Pre / Target / Post", sub: "% of appraisals in each rating band" });
    barChart(c7, {
      labels: ["Pre-Calibration", "Target Distribution", "Post-Calibration"],
      datasets: RATING_ORDER.map((r, i) => ({
        label: r,
        data: [prePct[i], TARGET_DISTRIBUTION[r], postPct[i]].map((v) => Math.round(v * 10) / 10),
        stacked: true,
      })),
      horizontal: true,
      stacked: true,
    });

    const gradeOrder = sortGrades(sortedUnique(enriched, (p) => p.jobGrade));
    const avgPostByGrade = gradeOrder.map((g) => {
      const gr = rows.filter((p) => p.jobGrade === g);
      return gr.length ? gr.reduce((s, p) => s + RATING_SCORE[p.overallRating], 0) / gr.length : 0;
    });
    const c6 = chartCard(grid, {
      title: "Post-Calibration Average by Grade", sub: "1 = Below Expectations, 5 = Exceptional",
      drilldown: { records: rows, matchField: "jobGrade", db },
    });
    barChart(c6, { labels: gradeOrder, datasets: [{ label: "Avg Rating", data: avgPostByGrade.map((v) => Math.round(v * 100) / 100) }], showLegend: false });
  }

  draw();
}
