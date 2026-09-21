import { lastNMonths, monthEnd, monthLabel, isActiveAsOf, isCurrentlyEmployed, fmtInt, fmtPct, fmtDec, fmtMoney, targetDelta, REFERENCE_TODAY, toQarEquivalent, LEADERSHIP_LEVELS, sortedUnique } from "../data.js";
import { kpiCard, chartCard, lineChart, barChart, doughnutChart, tableCard, noteBanner, filterSelect } from "../charts.js";

// dataStatus: "partial" -- this page rolls up attrition/leave/base_salary
// (real, from the SAP batch) alongside absenteeism (no source),
// Succession Coverage % (needs `successors`, no source), and Employee
// Lifecycle Score (needs `stage_gate_scores`, synthetic by design).
export const meta = { id: "exec", label: "Executive Insights", subtitle: "Leadership at-a-glance across the employee lifecycle", dataStatus: "partial" };

export function render({ db, contentEl, filtersEl }) {
  const entities = ["All", ...sortedUnique(db.employeeMaster, (e) => e.businessUnit)];
  let entity = "All";
  // Labeled "Entity" -- businessUnit now holds the real SAP Cluster value
  // ("Baladna Qatar"/"Baladna Egypt"), not an internal org grouping like it
  // did before the SAP migration (that's `division` now). This page never
  // had a filter row before; added specifically so headcount/attrition/etc.
  // here aren't silently a Qatar+Egypt blend with no way to isolate one.
  filterSelect(filtersEl, { label: "Entity", options: entities, value: entity, onChange: (v) => { entity = v; draw(); } });

  function inEntity(e) { return entity === "All" || e.businessUnit === entity; }
  function empInEntity(employeeId) {
    const e = db.employeeIndex.get(employeeId);
    return e ? inEntity(e) : false;
  }

  function draw() {
    contentEl.innerHTML = "";
    const em = db.employeeMaster.filter(inEntity);
    const active = em.filter(isCurrentlyEmployed);
    const attrition = db.attrition.filter((a) => empInEntity(a.employeeId));
    const absenteeism = db.absenteeism.filter((a) => empInEntity(a.employeeId));
    const leave = db.leave.filter((l) => empInEntity(l.employeeId));
    const criticalPositions = db.criticalPositions.filter(inEntity);
    const criticalPositionIds = new Set(criticalPositions.map((p) => p.positionId));
    const successors = db.successors.filter((s) => criticalPositionIds.has(s.positionId));
    const stageGateScores = db.stageGateScores.filter((r) => empInEntity(r.employeeId));
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

    // Absence rate proxy
    const absTTM = absenteeism.filter((a) => a.absenceDate >= ttmStart);
    const avgAbsenceHours = active.length ? (absTTM.reduce((s, a) => s + a.absenceHours, 0) / active.length) : 0;

    // Annual leave liability approx: latest Annual balance per employee * (latest base salary / 30)
    const annualLeaveRows = leave.filter((l) => {
      const e = db.employeeIndex.get(l.employeeId);
      return l.leaveType === "Annual" && e && isCurrentlyEmployed(e);
    });
    const latestAnnual = new Map();
    for (const row of annualLeaveRows) {
      const prev = latestAnnual.get(row.employeeId);
      if (!prev || row.leaveStartDate > prev.leaveStartDate) latestAnnual.set(row.employeeId, row);
    }
    let leaveLiability = 0;
    for (const [empId, row] of latestAnnual) {
      const sal = db.latestBaseSalary.get(empId);
      if (sal) leaveLiability += toQarEquivalent((row.leaveBalance || 0) * (sal.baseSalary / 30), sal.currency);
    }

    // Succession Coverage % (Phase L rollup) — same definition as
    // succession.js's own KPI: named-successor positions / total critical
    // positions.
    const positionsWithSuccessor = new Set(successors.map((s) => s.positionId)).size;
    const successionCoveragePct = criticalPositions.length ? (positionsWithSuccessor / criticalPositions.length) * 100 : 0;

    // Employee Lifecycle Score (Phase L rollup) — same avg-across-4-stages
    // definition as enps.js's own KPI.
    const lifecycleScore = stageGateScores.length ? stageGateScores.reduce((s, r) => s + (r.score || 0), 0) / stageGateScores.length : 0;

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
    kpiCard(kpiRow, { label: "Avg Absence Hours / Employee (TTM)", value: fmtInt(avgAbsenceHours), note: `${fmtInt(absTTM.length)} logged absence events` });
    kpiCard(kpiRow, { label: "Est. Annual Leave Liability", value: fmtMoney(leaveLiability), note: "Unused Annual balance × est. daily rate" });
    kpiCard(kpiRow, { label: "Succession Coverage", value: fmtPct(successionCoveragePct), note: `${positionsWithSuccessor} of ${criticalPositions.length} critical roles` });
    kpiCard(kpiRow, { label: "Employee Lifecycle Score", value: fmtDec(lifecycleScore, 1), note: "avg across Interview → Probation stages" });

    noteBanner(contentEl, `<b>Scope note:</b> this covers the 10 Phase-1 data-backed modules from the PRD. Executive Insights below summarizes headcount, hiring, attrition, and leave/absence trends over the trailing 12 months (reference date ${REFERENCE_TODAY}).`);

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

    // Entity headcount -- deliberately ignores this page's own Entity filter
    // (uses the full active population, not the filtered `active`), same
    // convention as every other "by X" breakdown chart on a page with an X
    // filter (e.g. compensation.js's Pay Gap Index by Entity) -- otherwise
    // selecting one entity in the filter would collapse this to one bar.
    const allActive = db.employeeMaster.filter(isCurrentlyEmployed);
    const buCounts = new Map();
    for (const e of allActive) buCounts.set(e.businessUnit, (buCounts.get(e.businessUnit) || 0) + 1);
    const buLabels = Array.from(buCounts.keys());
    const c5 = chartCard(grid3, { title: "Headcount by Entity", tableColumns: [{ key: "bu", label: "Entity" }, { key: "n", label: "Headcount", num: true }], tableRows: buLabels.map((b) => ({ bu: b, n: buCounts.get(b) })), drilldown: { records: allActive, matchField: "businessUnit", db } });
    barChart(c5, { labels: buLabels, datasets: [{ label: "Headcount", data: buLabels.map((b) => buCounts.get(b)) }], showLegend: false });

    // Leave taken TTM by type
    const leaveTTM = leave.filter((l) => l.leaveStatus === "Approved" && l.leaveStartDate >= ttmStart);
    const leaveByType = new Map();
    for (const l of leaveTTM) leaveByType.set(l.leaveType, (leaveByType.get(l.leaveType) || 0) + l.leaveDays);
    const ltLabels = Array.from(leaveByType.keys());
    const c6 = chartCard(grid3, { title: "Leave Days Taken (TTM)", sub: "Approved leave, by type", drilldown: { records: leaveTTM, matchField: "leaveType", db } });
    barChart(c6, { labels: ltLabels, datasets: [{ label: "Days", data: ltLabels.map((t) => Math.round(leaveByType.get(t))) }], showLegend: false });

    // Initiatives tracker (Phase L rollup) — the one genuinely new table this
    // phase adds, no dependencies on any other module.
    const initiatives = db.initiatives.slice().sort((a, b) => a.id - b.id);
    const completedCount = initiatives.filter((i) => i.status === "Completed").length;
    const inProgressCount = initiatives.filter((i) => i.status === "In Progress").length;
    const overdueCount = initiatives.filter((i) => i.status === "Overdue").length;
    tableCard(contentEl, {
      title: "HR Initiatives",
      sub: `${completedCount} completed · ${inProgressCount} in progress · ${overdueCount} overdue`,
      columns: [{ key: "name", label: "Initiative" }, { key: "status", label: "Status" }],
      rows: initiatives,
    });
  }

  draw();
}
