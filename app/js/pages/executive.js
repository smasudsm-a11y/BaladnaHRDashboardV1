import { lastNMonths, monthEnd, monthLabel, isActiveAsOf, isCurrentlyEmployed, fmtInt, fmtPct, targetDelta, REFERENCE_TODAY, LEADERSHIP_LEVELS, legalEntityAllowed, employeeLegalEntityAllowed } from "../data.js";
import { kpiCard, chartCard, lineChart, barChart, doughnutChart, noteBanner, legalEntityFilter } from "../charts.js";

// dataStatus: "partial" -- headcount/hires/attrition are real (SAP), but
// Succession Coverage % needs `successors`, which has no source. Removed
// 2026-10-01 with the modules they came from: Employee Lifecycle Score
// (Employee Satisfaction), and Avg Absence Hours (synthetic absenteeism),
// Est. Annual Leave Liability (always 0 -- SAP has no leave balances) and
// the Leave Days Taken chart (filtered on "Approved" while SAP says
// "APPROVED", so it was empty) with Leave & Absence.
export const meta = { id: "exec", label: "Executive Insights", subtitle: "Leadership at-a-glance across the employee lifecycle", dataStatus: "partial" };

export function render({ db, contentEl, filtersEl }) {
  legalEntityFilter(filtersEl, { db, onChange: draw });

  function draw() {
    contentEl.innerHTML = "";
    const em = db.employeeMaster.filter((e) => legalEntityAllowed(db, e.legalEntity));
    const active = em.filter(isCurrentlyEmployed);
    const attrition = db.attrition.filter((a) => employeeLegalEntityAllowed(db, a.employeeId));
    // critical_positions/successors are NOT filtered by Legal Entity: the
    // table has no legalEntity column of its own (only businessUnit, the
    // now-retired Cluster concept), and resolving one via the incumbent
    // would need the `incumbents` table, which the `exec` section has no RLS
    // grant for (see data.js's SECTION_TABLES) -- a real gap, not an
    // oversight; would need a new migration to close. Succession Coverage %
    // below is always company-wide regardless of the filter selection.
    const criticalPositions = db.criticalPositions;
    const criticalPositionIds = new Set(criticalPositions.map((p) => p.positionId));
    const successors = db.successors.filter((s) => criticalPositionIds.has(s.positionId));
    const months = lastNMonths(12);

    // Headcount / FTE
    const fte = active.reduce((s, e) => s + (e.fullTimePartTime === "Part Time" ? 0.5 : 1), 0);

    // % Female Leaders
    const leaders = active.filter((e) => LEADERSHIP_LEVELS.includes(e.jobLevel));
    const femaleLeaders = leaders.filter((e) => e.gender === "Female");
    const femaleLeaderPct = leaders.length ? (femaleLeaders.length / leaders.length) * 100 : 0;

    // Hires last 30d vs prior 30d (relative to reference date, using synthetic data range)
    const refD = new Date(REFERENCE_TODAY);
    const d30 = new Date(refD); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(refD); d60.setDate(d60.getDate() - 60);
    const iso = (d) => d.toISOString().slice(0, 10);
    const hiresLast30 = em.filter((e) => e.hireDate >= iso(d30) && e.hireDate <= iso(refD)).length;
    const hiresPrior30 = em.filter((e) => e.hireDate >= iso(d60) && e.hireDate < iso(d30)).length;

    // Attrition rate TTM
    const ttmStart = monthEnd(months[0]);
    const termsTTM = attrition.filter((a) => a.terminationDate >= ttmStart && a.terminationDate <= REFERENCE_TODAY);
    const voluntary = termsTTM.filter((a) => a.voluntaryInvoluntary === "Voluntary").length;
    const involuntary = termsTTM.filter((a) => a.voluntaryInvoluntary === "Involuntary").length;
    const avgHeadcountTTM = (active.length + em.filter((e) => isActiveAsOf(e, ttmStart)).length) / 2;
    const attritionRate = avgHeadcountTTM ? (termsTTM.length / avgHeadcountTTM) * 100 : 0;

    // Succession Coverage % (Phase L rollup) — same definition as
    // succession.js's own KPI: named-successor positions / total critical
    // positions.
    const positionsWithSuccessor = new Set(successors.map((s) => s.positionId)).size;
    const successionCoveragePct = criticalPositions.length ? (positionsWithSuccessor / criticalPositions.length) * 100 : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);

    kpiCard(kpiRow, { label: "Active Headcount", value: fmtInt(active.length), note: `FTE ${fmtInt(fte)}` });
    kpiCard(kpiRow, { label: "% Female Leaders", value: fmtPct(femaleLeaderPct), note: `${femaleLeaders.length} of ${leaders.length} managers/execs` });
    kpiCard(kpiRow, {
      label: "Hires (last 30d vs prior 30d)",
      value: fmtInt(hiresLast30),
      delta: `${hiresLast30 >= hiresPrior30 ? "▲" : "▼"} vs ${fmtInt(hiresPrior30)} prior period`,
      deltaKind: hiresLast30 >= hiresPrior30 ? "good" : "warn",
    });
    kpiCard(kpiRow, {
      label: "Attrition Rate (TTM)",
      value: fmtPct(attritionRate),
      note: `${voluntary} voluntary · ${involuntary} involuntary`,
      ...targetDelta(db, "turnover_rate", attritionRate),
    });
    kpiCard(kpiRow, { label: "Succession Coverage", value: fmtPct(successionCoveragePct), note: `${positionsWithSuccessor} of ${criticalPositions.length} critical roles` });
    noteBanner(contentEl, `<b>Scope note:</b> Executive Insights summarizes headcount, hiring and attrition trends over the trailing 12 months (reference date ${REFERENCE_TODAY}).`);

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    // Headcount trend
    const headcountSeries = months.map((ym) => em.filter((e) => isActiveAsOf(e, monthEnd(ym))).length);
    const c1 = chartCard(grid, { title: "Headcount Trend", sub: "Active employees, month-end, trailing 12 months" });
    lineChart(c1, { labels: months.map(monthLabel), datasets: [{ label: "Headcount", data: headcountSeries }] });

    // Hires vs Exits
    const hiresSeries = months.map((ym) => em.filter((e) => e.hireDate && e.hireDate.slice(0, 7) === ym).length);
    const exitsSeries = months.map((ym) => attrition.filter((a) => a.terminationDate && a.terminationDate.slice(0, 7) === ym).length);
    const c2 = chartCard(grid, { title: "Hires vs. Exits", sub: "By month, trailing 12 months" });
    barChart(c2, { labels: months.map(monthLabel), datasets: [{ label: "Hires", data: hiresSeries }, { label: "Exits", data: exitsSeries }] });

    // Attrition rate trend (voluntary/involuntary stacked)
    const volSeries = months.map((ym) => attrition.filter((a) => a.terminationDate && a.terminationDate.slice(0, 7) === ym && a.voluntaryInvoluntary === "Voluntary").length);
    const involSeries = months.map((ym) => attrition.filter((a) => a.terminationDate && a.terminationDate.slice(0, 7) === ym && a.voluntaryInvoluntary === "Involuntary").length);
    const c3 = chartCard(grid, { title: "Terminations by Type", sub: "Voluntary vs. involuntary, by month" });
    barChart(c3, { labels: months.map(monthLabel), datasets: [{ label: "Voluntary", data: volSeries, stacked: true }, { label: "Involuntary", data: involSeries, stacked: true }], stacked: true });

    // Gender split
    const female = active.filter((e) => e.gender === "Female").length;
    const male = active.length - female;
    const c4 = chartCard(grid, { title: "Workforce by Gender", sub: "Active headcount", drilldown: { records: active, matchField: "gender", db } });
    doughnutChart(c4, { labels: ["Male", "Female"], data: [male, female] });

    const grid3 = document.createElement("div");
    grid3.className = "grid-2";
    contentEl.appendChild(grid3);

    // Legal Entity headcount -- deliberately ignores this page's own Legal
    // Entity filter (uses the full active population, not the filtered
    // `active`), same convention as every other "by X" breakdown chart on a
    // page with an X filter (e.g. compensation.js's Pay Gap Index by
    // Entity) -- otherwise unchecking an entity in the filter would just
    // remove its own bar instead of letting you compare across all of them.
    const allActive = db.employeeMaster.filter(isCurrentlyEmployed);
    const leCounts = new Map();
    for (const e of allActive) leCounts.set(e.legalEntity, (leCounts.get(e.legalEntity) || 0) + 1);
    const leLabels = Array.from(leCounts.keys());
    const c5 = chartCard(grid3, { title: "Headcount by Legal Entity", tableColumns: [{ key: "le", label: "Legal Entity" }, { key: "n", label: "Headcount", num: true }], tableRows: leLabels.map((l) => ({ le: l, n: leCounts.get(l) })), drilldown: { records: allActive, matchField: "legalEntity", db } });
    barChart(c5, { labels: leLabels, datasets: [{ label: "Headcount", data: leLabels.map((l) => leCounts.get(l)) }], showLegend: false });
    // Removed 2026-10-01 at the user's request (not relevant to Baladna):
    // the Phase L "HR Initiatives" tracker table, and the "Leave Days Taken
    // (TTM)" chart along with the Leave & Absence module. Their Supabase
    // tables still exist but nothing reads or loads them.
  }

  draw();
}
