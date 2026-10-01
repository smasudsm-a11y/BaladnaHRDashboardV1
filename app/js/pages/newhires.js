import { sortedUnique, monthLabel, daysBetween, fmtInt, fmtPct, REFERENCE_TODAY, salaryStructureLookup, bandComparablePay, JOB_LEVEL_ORDER, LEADERSHIP_LEVELS, legalEntityAllowed, isCurrentlyEmployed } from "../data.js";
import { kpiCard, chartCard, barChart, doughnutChart, filterSelect, tableCard, legalEntityFilter, sectionTitle } from "../charts.js";

export const meta = { id: "newhires", label: "New Hires & Onboarding", subtitle: "Who joined, how many stayed, and who is still on probation" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The SAP employee extract only contains people who left from 2022-01-02
// onward -- anyone hired earlier who left before 2022 isn't in it at all. So
// for pre-2022 hire years both the starter count (missing the early leavers)
// and retention (a false ~100%) are wrong. Hire years before this aren't
// offered. Verified 2026-10-01: hire years 2012-2020 all showed 100% 12-month
// retention; 2022 onward reads a plausible 79-88%.
const TRUSTED_FROM_YEAR = 2022;

function monthsBetween(a, b) {
  return daysBetween(a, b) / 30.44;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function render({ db, contentEl, filtersEl }) {
  const refYear = Number(REFERENCE_TODAY.slice(0, 4));
  const years = sortedUnique(db.employeeMaster, (e) => e.hireDate?.slice(0, 4)).filter((y) => Number(y) >= TRUSTED_FROM_YEAR).sort();
  // Default to the last complete year: the current year is partial, and
  // 12-month retention needs hires at least a year old.
  let year = years.includes(String(refYear - 1)) ? String(refYear - 1) : years[years.length - 1];
  let month = "All", dept = "All";
  const depts = ["All", ...sortedUnique(db.employeeMaster, (e) => e.department)];

  legalEntityFilter(filtersEl, { db, onChange: draw });
  filterSelect(filtersEl, { label: "Hire Year", options: years, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Hire Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });

  // Retention at a milestone, among starters hired at least that long ago.
  function retention(rows, milestone) {
    const pool = rows.filter((e) => monthsBetween(e.hireDate, REFERENCE_TODAY) >= milestone);
    if (!pool.length) return null;
    const stillIn = pool.filter((e) => !e.terminationDate || monthsBetween(e.hireDate, e.terminationDate) >= milestone).length;
    return { pct: (stillIn / pool.length) * 100, n: pool.length };
  }

  function draw() {
    contentEl.innerHTML = "";
    const inScope = (e) => e.hireDate && legalEntityAllowed(db, e.legalEntity) && (dept === "All" || e.department === dept);
    const yearStarters = db.employeeMaster.filter((e) => inScope(e) && e.hireDate.startsWith(year));
    const starters = yearStarters.filter((e) => month === "All" || Number(e.hireDate.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month));
    const isPartial = Number(year) >= refYear;

    const female = starters.filter((e) => e.gender === "Female").length;
    const male = starters.filter((e) => e.gender === "Male").length;
    const r6 = retention(starters, 6);
    const r12 = retention(starters, 12);

    // Left during probation: terminated before their confirmation date
    // (probation end -- hire + 180 days for almost everyone). Only starters
    // whose probation has finished, or who already left, count; someone
    // still mid-probation hasn't had the chance to pass or fail it yet.
    const probationDone = starters.filter((e) => e.confirmationDate && (e.terminationDate || e.confirmationDate <= REFERENCE_TODAY));
    const leftInProbation = probationDone.filter((e) => e.terminationDate && e.terminationDate < e.confirmationDate);

    // Pay vs. grade midpoint, on total cash (see bandComparablePay). SAP pay
    // is a current snapshot, so for recent hires this approximates pay at hire.
    const withBand = starters
      .map((e) => {
        const sal = db.latestBaseSalary.get(e.employeeId);
        const struct = sal ? salaryStructureLookup(db, sal.grade, e.jobFamily, sal.currency) : null;
        const pay = struct ? bandComparablePay(db, e.employeeId) : null;
        return pay !== null ? pay > struct.salaryMidpoint : null;
      })
      .filter((v) => v !== null);
    const aboveMid = withBand.filter(Boolean).length;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    const period = `${month === "All" ? "" : `${month} `}${year}${isPartial ? " (year to date)" : ""}`;
    kpiCard(kpiRow, { label: "New Starters", value: fmtInt(starters.length), note: period });
    kpiCard(kpiRow, { label: "% Female New Starters", value: starters.length ? fmtPct((female / starters.length) * 100) : "—", note: `${fmtInt(female)} women` });
    kpiCard(kpiRow, { label: "Retention @ 6mo", value: r6 ? fmtPct(r6.pct) : "n/a", note: r6 ? `of ${fmtInt(r6.n)} hired 6+ months ago` : "none hired 6+ months ago yet" });
    kpiCard(kpiRow, { label: "Retention @ 12mo", value: r12 ? fmtPct(r12.pct) : "n/a", note: r12 ? `of ${fmtInt(r12.n)} hired 12+ months ago` : "none hired 12+ months ago yet" });
    kpiCard(kpiRow, {
      label: "Left During Probation", value: probationDone.length ? fmtPct((leftInProbation.length / probationDone.length) * 100) : "n/a",
      note: probationDone.length ? `${fmtInt(leftInProbation.length)} of ${fmtInt(probationDone.length)} who reached probation end` : "no probations completed yet",
      deltaKind: !probationDone.length ? undefined : leftInProbation.length / probationDone.length > 0.15 ? "bad" : leftInProbation.length / probationDone.length > 0.08 ? "warn" : "good",
    });
    kpiCard(kpiRow, { label: "Paid Above Grade Midpoint", value: withBand.length ? fmtPct((aboveMid / withBand.length) * 100) : "n/a", note: withBand.length ? `${fmtInt(aboveMid)} of ${fmtInt(withBand.length)} (current total cash)` : "no salary-band data" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    // The selected year's 12 months, zero-filled, ignoring the Month filter
    // (a trend narrowed to one month would be a single bar).
    const yms = MONTH_NAMES.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const c1 = chartCard(grid, { title: "New Starters by Month", sub: year, drilldown: { records: yearStarters.map((e) => ({ ...e, hireMonth: monthLabel(e.hireDate.slice(0, 7)) })), matchField: "hireMonth", db } });
    barChart(c1, { labels: yms.map(monthLabel), datasets: [{ label: "New Starters", data: yms.map((ym) => yearStarters.filter((e) => e.hireDate.startsWith(ym)).length) }], showLegend: false });

    // Every trusted year, ignoring the Year filter (it's the year axis).
    const allTrusted = db.employeeMaster.filter((e) => inScope(e) && Number(e.hireDate.slice(0, 4)) >= TRUSTED_FROM_YEAR);
    const retentionLine = years.map((y) => { const r = retention(allTrusted.filter((e) => e.hireDate.startsWith(y)), 12); return `${y} ${r ? `${r.pct.toFixed(0)}%` : "n/a"}`; }).join(" · ");
    const c2 = chartCard(grid, { title: "New Starters by Year", sub: `Since ${TRUSTED_FROM_YEAR}, when SAP exit history starts · 12-mo retention: ${retentionLine}`, drilldown: { records: allTrusted.map((e) => ({ ...e, hireYear: e.hireDate.slice(0, 4) })), matchField: "hireYear", db } });
    barChart(c2, { labels: years, datasets: [{ label: "New Starters", data: years.map((y) => allTrusted.filter((e) => e.hireDate.startsWith(y)).length) }], showLegend: false });

    // All departments regardless of the Department filter (the grouping dimension).
    const deptScope = db.employeeMaster.filter((e) => e.hireDate && legalEntityAllowed(db, e.legalEntity) && e.hireDate.startsWith(year) &&
      (month === "All" || Number(e.hireDate.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)));
    const deptCounts = sortedUnique(deptScope, (e) => e.department).map((d) => [d, deptScope.filter((e) => e.department === d).length]).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const c3 = chartCard(grid, { title: "New Starters by Department", sub: `${period} · top ${deptCounts.length}`, drilldown: { records: deptScope, matchField: "department", db } });
    barChart(c3, { labels: deptCounts.map((d) => d[0]), datasets: [{ label: "New Starters", data: deptCounts.map((d) => d[1]) }], showLegend: false, horizontal: true });

    const levels = JOB_LEVEL_ORDER.filter((l) => starters.some((e) => e.jobLevel === l));
    const c4 = chartCard(grid, { title: "New Starters by Job Level", sub: period, drilldown: { records: starters, matchField: "jobLevel", db } });
    barChart(c4, { labels: levels, datasets: [{ label: "New Starters", data: levels.map((l) => starters.filter((e) => e.jobLevel === l).length) }], showLegend: false });

    const c5 = chartCard(grid, { title: "New Starters by Gender", sub: period, drilldown: { records: starters, matchField: "gender", db } });
    doughnutChart(c5, { labels: ["Male", "Female"], data: [male, female] });

    const managers = starters.filter((e) => LEADERSHIP_LEVELS.includes(e.jobLevel));
    const others = starters.filter((e) => !LEADERSHIP_LEVELS.includes(e.jobLevel));
    const fmt = (r) => (r ? `${r.pct.toFixed(0)}% (n=${r.n})` : "n/a");
    tableCard(grid, {
      title: "Retention by Role Type", sub: `${period} · manager vs. individual contributor`,
      columns: [{ key: "band", label: "Milestone" }, { key: "mgr", label: "Manager/Supervisor" }, { key: "nonmgr", label: "Individual Contributor" }],
      rows: [
        { band: "Still employed at 6 months", mgr: fmt(retention(managers, 6)), nonmgr: fmt(retention(others, 6)) },
        { band: "Still employed at 12 months", mgr: fmt(retention(managers, 12)), nonmgr: fmt(retention(others, 12)) },
      ],
      collapsed: false, showCount: false,
    });

    drawProbation();
  }

  // "Now" view: who is on probation today, regardless of hire year/month
  // (probation is a current state). Respects Legal Entity and Department.
  function drawProbation() {
    sectionTitle(contentEl, "Probation & Onboarding — Now");
    const in30 = addDays(REFERENCE_TODAY, 30), in90 = addDays(REFERENCE_TODAY, 90);
    const onProbation = db.employeeMaster
      .filter((e) => legalEntityAllowed(db, e.legalEntity) && (dept === "All" || e.department === dept) && isCurrentlyEmployed(e) &&
        e.hireDate && e.hireDate <= REFERENCE_TODAY && e.confirmationDate && e.confirmationDate > REFERENCE_TODAY)
      .map((e) => ({ ...e, daysToConfirmation: Math.round(daysBetween(REFERENCE_TODAY, e.confirmationDate)), confirmationMonth: monthLabel(e.confirmationDate.slice(0, 7)) }))
      .sort((a, b) => a.confirmationDate.localeCompare(b.confirmationDate));
    const due30 = onProbation.filter((e) => e.confirmationDate <= in30);
    const due90 = onProbation.filter((e) => e.confirmationDate <= in90);

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "On Probation Now", value: fmtInt(onProbation.length), note: `as of ${REFERENCE_TODAY}` });
    kpiCard(kpiRow, { label: "Probation Ending ≤ 30 Days", value: fmtInt(due30.length), note: "confirmation reviews due soon" });
    kpiCard(kpiRow, { label: "Probation Ending ≤ 90 Days", value: fmtInt(due90.length) });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);
    const months = sortedUnique(onProbation, (e) => e.confirmationDate.slice(0, 7)).sort();
    const c1 = chartCard(grid, { title: "Probation End Dates by Month", sub: "Employees currently on probation", drilldown: { records: onProbation, matchField: "confirmationMonth", db } });
    barChart(c1, { labels: months.map(monthLabel), datasets: [{ label: "Probation ends", data: months.map((m) => onProbation.filter((e) => e.confirmationDate.startsWith(m)).length) }], showLegend: false });

    const deptCounts = sortedUnique(onProbation, (e) => e.department).map((d) => [d, onProbation.filter((e) => e.department === d).length]).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const c2 = chartCard(grid, { title: "On Probation by Department", sub: `top ${deptCounts.length}`, drilldown: { records: onProbation, matchField: "department", db } });
    barChart(c2, { labels: deptCounts.map((d) => d[0]), datasets: [{ label: "On probation", data: deptCounts.map((d) => d[1]) }], showLegend: false, horizontal: true });

    tableCard(contentEl, {
      title: "Employees on Probation", sub: "Soonest confirmation first",
      columns: [
        { key: "employeeName", label: "Employee" }, { key: "department", label: "Department" }, { key: "jobLevel", label: "Job Level" },
        { key: "lineManagerName", label: "Line Manager" }, { key: "hireDate", label: "Hire Date" },
        { key: "confirmationDate", label: "Probation Ends" }, { key: "daysToConfirmation", label: "Days Left", num: true },
      ],
      rows: onProbation,
    });
  }

  draw();
}
