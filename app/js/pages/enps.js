import { sortedUnique, avgBy, fmtInt, fmtDec, fmtPct } from "../data.js";
import { kpiCard, chartCard, barChart, lineChart, doughnutChart, filterSelect } from "../charts.js";

export const meta = { id: "enps", label: "Employee Satisfaction", subtitle: "eNPS and Employee Lifecycle Score across the exit and onboarding journey" };

const ENPS_ORDER = ["Detractor", "Passive", "Promoter"];
const STAGE_ORDER = ["Interview", "Recruiting", "Onboarding", "Probation"];

function enrich(db, rows) {
  return rows.map((r) => {
    const e = db.employeeIndex.get(r.employeeId);
    return { ...r, employeeName: e?.employeeName || r.employeeId, department: e?.department || "Unclassified" };
  });
}

function enpsOf(rows) {
  if (!rows.length) return 0;
  const promoters = rows.filter((r) => r.enpsCategory === "Promoter").length;
  const detractors = rows.filter((r) => r.enpsCategory === "Detractor").length;
  return ((promoters - detractors) / rows.length) * 100;
}

export function render({ db, contentEl, filtersEl }) {
  const surveys = enrich(db, db.exitSurveys);
  const stages = enrich(db, db.stageGateScores);

  const years = ["All", ...sortedUnique(surveys, (r) => r.surveyDate?.slice(0, 4)).sort()];
  const depts = ["All", ...sortedUnique(stages, (r) => r.department).sort()];
  let year = "All", dept = "All";

  filterSelect(filtersEl, { label: "Year", options: years, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    // Exit surveys scoped by survey year; stage-gate scores (a per-employee
    // lifecycle snapshot, not a dated event series) scoped by department
    // only — same convention as every other multi-table page in this app,
    // each table filtered on whichever dimension actually applies to it.
    const surveyRows = surveys.filter((r) =>
      (year === "All" || r.surveyDate?.startsWith(year)) && (dept === "All" || r.department === dept));
    const stageRows = stages.filter((r) => dept === "All" || r.department === dept);

    const enpsScore = enpsOf(surveyRows);
    const promoters = surveyRows.filter((r) => r.enpsCategory === "Promoter").length;
    const passives = surveyRows.filter((r) => r.enpsCategory === "Passive").length;
    const detractors = surveyRows.filter((r) => r.enpsCategory === "Detractor").length;
    // wouldRecommend may come back as a native boolean (if Excel stored the
    // TRUE/FALSE text as a real boolean cell) or as the literal string
    // "TRUE"/"FALSE" — normalize defensively rather than assume either.
    const wouldRecommendPct = surveyRows.length ? (surveyRows.filter((r) => r.wouldRecommend === true || String(r.wouldRecommend).toLowerCase() === "true").length / surveyRows.length) * 100 : 0;

    const lifecycleScore = avgBy(stageRows, (r) => Number(r.score));

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, {
      label: "eNPS Score", value: fmtDec(enpsScore, 0),
      note: `${fmtInt(promoters)} promoters, ${fmtInt(passives)} passives, ${fmtInt(detractors)} detractors`,
      deltaKind: enpsScore >= 0 ? "good" : enpsScore >= -30 ? "warn" : "bad",
    });
    kpiCard(kpiRow, { label: "Exit Surveys", value: fmtInt(surveyRows.length), note: "selected period" });
    kpiCard(kpiRow, { label: "Would Recommend", value: fmtPct(wouldRecommendPct), note: "of exit survey respondents" });
    kpiCard(kpiRow, { label: "Employee Lifecycle Score", value: fmtDec(lifecycleScore, 2), note: "avg across Interview/Recruiting/Onboarding/Probation, 0–10" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const enpsCounts = [detractors, passives, promoters];
    const c1 = chartCard(grid, { title: "eNPS Split", sub: "Detractor / Passive / Promoter", drilldown: { records: surveyRows, matchField: "enpsCategory", db } });
    doughnutChart(c1, { labels: ENPS_ORDER, data: enpsCounts });

    const yearOrder = sortedUnique(surveys, (r) => r.surveyDate?.slice(0, 4)).sort();
    const enpsByYear = yearOrder.map((y) => enpsOf(surveys.filter((r) => r.surveyDate?.startsWith(y) && (dept === "All" || r.department === dept))));
    const c2 = chartCard(grid, { title: "eNPS Trend", sub: "By exit survey year" });
    lineChart(c2, { labels: yearOrder, datasets: [{ label: "eNPS", data: enpsByYear.map((v) => Math.round(v * 10) / 10) }], showLegend: false });

    const deptOrder = sortedUnique(surveyRows, (r) => r.department).sort();
    const enpsByDept = deptOrder.map((d) => enpsOf(surveyRows.filter((r) => r.department === d)));
    const c3 = chartCard(grid, { title: "eNPS by Department", drilldown: { records: surveyRows, matchField: "department", db } });
    barChart(c3, { labels: deptOrder, datasets: [{ label: "eNPS", data: enpsByDept.map((v) => Math.round(v * 10) / 10) }], showLegend: false, horizontal: true });

    const stageAvg = STAGE_ORDER.map((s) => avgBy(stageRows.filter((r) => r.stage === s), (r) => Number(r.score)));
    const c4 = chartCard(grid, {
      title: "Employee Lifecycle Score by Stage", sub: "Avg score 0–10, Interview through Probation",
      drilldown: { records: stageRows, matchField: "stage", db },
    });
    barChart(c4, { labels: STAGE_ORDER, datasets: [{ label: "Avg Score", data: stageAvg.map((v) => Math.round(v * 100) / 100) }], showLegend: false });

    const hireYearOrder = sortedUnique(stageRows, (r) => r.scoreDate?.slice(0, 4)).sort();
    const lifecycleByYear = hireYearOrder.map((y) => avgBy(stageRows.filter((r) => r.scoreDate?.startsWith(y)), (r) => Number(r.score)));
    const c5 = chartCard(grid, { title: "Employee Lifecycle Score Trend", sub: "By hire year" });
    lineChart(c5, { labels: hireYearOrder, datasets: [{ label: "Lifecycle Score", data: lifecycleByYear.map((v) => Math.round(v * 100) / 100) }], showLegend: false });
  }

  draw();
}
