import { sortedUnique, sortGrades, isActiveAsOf, fmtInt, fmtPct } from "../data.js";
import { kpiCard, chartCard, lineChart, barChart, doughnutChart, filterSelect } from "../charts.js";

export const meta = { id: "attrition", label: "Attrition & Retention", subtitle: "Voluntary and involuntary turnover, and termination profile" };

function headcountAt(db, dateStr) {
  return db.employeeMaster.filter((e) => isActiveAsOf(e, dateStr)).length;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function render({ db, contentEl, filtersEl }) {
  const years = sortedUnique(db.attrition, (a) => a.terminationDate?.slice(0, 4)).sort();
  const yearOptions = ["All", ...years];
  const depts = ["All", ...sortedUnique(db.attrition, (a) => a.department)];
  let year = "All", month = "All", dept = "All";

  filterSelect(filtersEl, { label: "Year", options: yearOptions, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const rows = db.attrition.filter((a) =>
      (year === "All" || a.terminationDate?.startsWith(year)) &&
      (month === "All" || Number(a.terminationDate?.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)) &&
      (dept === "All" || a.department === dept));

    const voluntary = rows.filter((a) => a.voluntaryInvoluntary === "Voluntary").length;
    const involuntary = rows.filter((a) => a.voluntaryInvoluntary === "Involuntary").length;

    // Rates are computed per-year (terminations in that year ÷ average headcount that year) and
    // annualized-averaged across the selected range — never a multi-year termination count divided
    // by a single headcount snapshot, which would overstate the rate by roughly the number of years.
    const yearsInScope = year === "All" ? years : [year];
    const perYear = yearsInScope.map((y) => {
      const yr = rows.filter((a) => a.terminationDate?.startsWith(y));
      const hc = (headcountAt(db, `${y}-01-01`) + headcountAt(db, `${y}-12-31`)) / 2 || 1;
      return {
        rate: (yr.length / hc) * 100,
        voluntaryRate: (yr.filter((a) => a.voluntaryInvoluntary === "Voluntary").length / hc) * 100,
        involuntaryRate: (yr.filter((a) => a.voluntaryInvoluntary === "Involuntary").length / hc) * 100,
      };
    });
    const avg = (arr, key) => (arr.length ? arr.reduce((s, x) => s + x[key], 0) / arr.length : 0);
    const overallRate = avg(perYear, "rate");
    const voluntaryRate = avg(perYear, "voluntaryRate");
    const involuntaryRate = avg(perYear, "involuntaryRate");
    const firstYear = rows.filter((a) => a.tenure < 1).length;
    const firstYearPct = rows.length ? (firstYear / rows.length) * 100 : 0;

    // High Performer Retention %: of everyone ever rated Exceeds/Exceptional
    // (current department, not the department at time of rating — a current-state
    // snapshot like Workforce Tenure Distribution below), what share are still
    // active rather than terminated. Needs db.performance, which this section
    // wasn't previously granted read access to — see data.js's SECTION_TABLES
    // and 16_phase_d_access.sql.
    const highPerformerIds = new Set(
      db.performance
        .filter((p) => p.overallRating === "Exceeds Expectations" || p.overallRating === "Exceptional")
        .map((p) => p.employeeId)
        .filter((id) => dept === "All" || db.employeeIndex.get(id)?.department === dept)
    );
    const highPerformersTotal = highPerformerIds.size;
    const highPerformersTerminated = Array.from(highPerformerIds).filter((id) => db.employeeIndex.get(id)?.employmentStatus === "Terminated").length;
    const highPerformerRetention = highPerformersTotal ? ((highPerformersTotal - highPerformersTerminated) / highPerformersTotal) * 100 : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Overall Attrition Rate", value: fmtPct(overallRate), note: `${fmtInt(rows.length)} terminations` });
    kpiCard(kpiRow, { label: "Voluntary Attrition Rate", value: fmtPct(voluntaryRate), note: `${voluntary} voluntary exits` });
    kpiCard(kpiRow, { label: "Involuntary Attrition Rate", value: fmtPct(involuntaryRate), note: `${involuntary} involuntary exits` });
    kpiCard(kpiRow, { label: "First-Year Attrition", value: fmtPct(firstYearPct), note: `${firstYear} left within 12 months of hire` });
    kpiCard(kpiRow, { label: "Retention Rate", value: fmtPct(100 - overallRate), note: "100% − overall attrition rate" });
    kpiCard(kpiRow, { label: "High Performer Retention %", value: fmtPct(highPerformerRetention), note: `${highPerformersTotal - highPerformersTerminated} of ${highPerformersTotal} high performers retained` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    // Year + Department apply here (Month does not — a by-year trend can't be
    // sub-divided by month within the same chart).
    const yearlyRate = yearsInScope.map((y) => {
      const yr = db.attrition.filter((a) => a.terminationDate?.startsWith(y) && (dept === "All" || a.department === dept));
      const hc = (headcountAt(db, `${y}-01-01`) + headcountAt(db, `${y}-12-31`)) / 2 || 1;
      return (yr.length / hc) * 100;
    });
    const c1 = chartCard(grid, {
      title: "Attrition Rate Trend", sub: "Terminations ÷ average headcount, by year",
      drilldown: { records: db.attrition.filter((a) => (year === "All" || a.terminationDate?.startsWith(year)) && (dept === "All" || a.department === dept)), matchFn: (r, label) => r.terminationDate?.startsWith(label), db },
    });
    lineChart(c1, { labels: yearsInScope, datasets: [{ label: "Attrition Rate %", data: yearlyRate.map((v) => Math.round(v * 10) / 10) }], showLegend: false });

    const deptCounts = new Map();
    for (const a of rows) deptCounts.set(a.department, (deptCounts.get(a.department) || 0) + 1);
    const deptLabels = Array.from(deptCounts.keys()).sort((a, b) => deptCounts.get(b) - deptCounts.get(a));
    const c2 = chartCard(grid, { title: "Attrition by Department", drilldown: { records: rows, matchField: "department", db } });
    barChart(c2, { labels: deptLabels, datasets: [{ label: "Terminations", data: deptLabels.map((d) => deptCounts.get(d)) }], horizontal: true, showLegend: false });

    const gradeCounts = new Map();
    for (const a of rows) gradeCounts.set(a.grade, (gradeCounts.get(a.grade) || 0) + 1);
    const gradeLabels = sortGrades(Array.from(gradeCounts.keys()));
    const c3 = chartCard(grid, { title: "Attrition by Grade", drilldown: { records: rows, matchField: "grade", db } });
    barChart(c3, { labels: gradeLabels, datasets: [{ label: "Terminations", data: gradeLabels.map((g) => gradeCounts.get(g)) }], showLegend: false });

    const reasonCounts = new Map();
    for (const a of rows) reasonCounts.set(a.terminationReason, (reasonCounts.get(a.terminationReason) || 0) + 1);
    const reasonLabels = Array.from(reasonCounts.keys()).sort((a, b) => reasonCounts.get(b) - reasonCounts.get(a));
    const c4 = chartCard(grid, { title: "Termination Profile", sub: "By reason", drilldown: { records: rows, matchField: "terminationReason", db } });
    barChart(c4, { labels: reasonLabels, datasets: [{ label: "Terminations", data: reasonLabels.map((r) => reasonCounts.get(r)) }], horizontal: true, showLegend: false });

    const tenureBands = ["<1 yr", "1–3 yrs", "3–5 yrs", "5+ yrs"];
    const tenureCounts = [0, 0, 0, 0];
    for (const a of rows) {
      if (a.tenure < 1) tenureCounts[0]++;
      else if (a.tenure < 3) tenureCounts[1]++;
      else if (a.tenure < 5) tenureCounts[2]++;
      else tenureCounts[3]++;
    }
    const grid3 = document.createElement("div");
    grid3.className = "grid-2";
    contentEl.appendChild(grid3);
    const tenureBandOf = (t) => (t < 1 ? "<1 yr" : t < 3 ? "1–3 yrs" : t < 5 ? "3–5 yrs" : "5+ yrs");
    const c5 = chartCard(grid3, { title: "Terminations by Tenure Band", drilldown: { records: rows, matchFn: (r, label) => tenureBandOf(r.tenure) === label, db } });
    barChart(c5, { labels: tenureBands, datasets: [{ label: "Terminations", data: tenureCounts }], showLegend: false });

    const genderCounts = { Male: 0, Female: 0 };
    for (const a of rows) genderCounts[a.gender] = (genderCounts[a.gender] || 0) + 1;
    const c6 = chartCard(grid3, { title: "Terminations by Gender", drilldown: { records: rows, matchField: "gender", db } });
    barChart(c6, { labels: ["Male", "Female"], datasets: [{ label: "Terminations", data: [genderCounts.Male, genderCounts.Female] }], showLegend: false });

    const grid4 = document.createElement("div");
    grid4.className = "grid-2";
    contentEl.appendChild(grid4);

    const c7 = chartCard(grid4, { title: "Terminations by Separation Type", drilldown: { records: rows, matchField: "voluntaryInvoluntary", db } });
    doughnutChart(c7, { labels: ["Voluntary", "Involuntary"], data: [voluntary, involuntary] });

    // Current-state snapshot of the active workforce, not a termination trend —
    // Department applies (same dimension as the rest of this page), Year/Month
    // don't (there's no date to filter; this is "who's here today," not "who left when").
    const activeForTenure = db.employeeMaster.filter((e) => e.employmentStatus === "Active" && (dept === "All" || e.department === dept));
    const tenureBands2 = ["0–1 yr", "1–2 yrs", "2–5 yrs", "5–8 yrs", "8+ yrs"];
    const tenureBandOf2 = (t) => (t < 1 ? "0–1 yr" : t < 2 ? "1–2 yrs" : t < 5 ? "2–5 yrs" : t < 8 ? "5–8 yrs" : "8+ yrs");
    const tenureCounts2 = tenureBands2.map((b) => activeForTenure.filter((e) => tenureBandOf2(e.lengthOfService || 0) === b).length);
    const c8 = chartCard(grid4, {
      title: "Workforce Tenure Distribution", sub: "Active employees, by years of service",
      drilldown: { records: activeForTenure, matchFn: (r, label) => tenureBandOf2(r.lengthOfService || 0) === label, db },
    });
    barChart(c8, { labels: tenureBands2, datasets: [{ label: "Employees", data: tenureCounts2 }], showLegend: false });
  }

  draw();
}
