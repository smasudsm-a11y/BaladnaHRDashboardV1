import { sortedUnique, withEmployeeFields, fmtInt, fmtDec, fmtPct } from "../data.js";
import { kpiCard, chartCard, barChart, filterSelect, noteBanner } from "../charts.js";

export const meta = { id: "performance", label: "Performance", subtitle: "Rating distribution, department trends, and high/low performers" };

const RATING_ORDER = ["Below Expectations", "Meets Some Expectations", "Meets Expectations", "Exceeds Expectations", "Exceptional"];
const RATING_SCORE = Object.fromEntries(RATING_ORDER.map((r, i) => [r, i + 1]));

export function render({ db, contentEl, filtersEl }) {
  const enriched = withEmployeeFields(db, db.performance, ["department"]);
  const cycles = ["All", ...sortedUnique(enriched, (p) => p.performanceCycle).sort()];
  const depts = ["All", ...sortedUnique(enriched, (p) => p.department)];
  let cycle = "All", dept = "All";

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

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "High Performers", value: fmtPct(rows.length ? (high / rows.length) * 100 : 0), note: `${fmtInt(high)} Exceeds/Exceptional` });
    kpiCard(kpiRow, { label: "Low Performers", value: fmtPct(rows.length ? (low / rows.length) * 100 : 0), note: `${fmtInt(low)} Below Expectations` });
    kpiCard(kpiRow, { label: "Avg Goal Score", value: fmtDec(avgGoal, 2) });
    kpiCard(kpiRow, { label: "Avg Competency Score", value: fmtDec(avgComp, 2) });
    kpiCard(kpiRow, { label: "Promotion Recommendation Rate", value: fmtPct(rows.length ? (promo / rows.length) * 100 : 0), note: `${fmtInt(promo)} recommended` });

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
  }

  draw();
}
