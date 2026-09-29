import { sortedUnique, fmtInt, fmtPct, fmtDec, legalEntityAllowed, isActiveAsOf, daysBetween, REFERENCE_TODAY, JOB_LEVEL_ORDER } from "../data.js";
import { kpiCard, chartCard, tableCard, barChart, filterSelect, legalEntityFilter, sectionTitle } from "../charts.js";

// Real SAP data (promotion_history, from the Merit Increase & Promotions
// report -- see 29_promotion_history.sql), so no dataStatus dot.
export const meta = { id: "promotions", label: "Promotions & Mobility", subtitle: "Promotions, internal mobility, and pay changes from SAP employee-action history" };

// SAP event-reason codes, user-confirmed 2026-09-29. ESC-TLECHGSA is still
// unconfirmed -- shown under its raw code rather than guessed.
const EVENT_LABELS = {
  "ESC-PR": "Promotion",
  "ESC-PRT": "Promotion due to Transfer",
  "ESC-SL": "Merit Increase",
  "ESC-JR": "Job Regrade",
  "ESC-BA": "Benefit Adjustment",
  "ESC-SA": "Salary Adjustment",
};
const PROMOTION_CODES = ["ESC-PR", "ESC-PRT"];
const PROMOTION_TYPES = PROMOTION_CODES.map((c) => EVENT_LABELS[c]);
// "Pay Changes" section (user's scope call, 2026-09-29: all four, not merit
// alone -- Merit Increase is only single digits a year since 2024). The SAP
// report records THAT a change happened, never the amount, so this section
// is counts and rates only -- no increase % or cost.
const PAY_CODES = ["ESC-SL", "ESC-SA", "ESC-BA", "ESC-JR"];
const PAY_TYPES = PAY_CODES.map((c) => EVENT_LABELS[c]);

// Pre-2022 history is near-empty (4 promotions across 2019-2021) -- the SAP
// record effectively starts at go-live, so a rate for those years would read
// as "nobody got promoted" rather than "no data".
const TREND_START_YEAR = 2022;
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const labelFor = (code) => EVENT_LABELS[code] || `${code} (unconfirmed)`;

export function render({ db, contentEl, filtersEl }) {
  const events = db.promotionHistory.map((r) => {
    const e = db.employeeIndex.get(r.employeeId);
    const tenure = e?.hireDate ? daysBetween(e.hireDate, r.eventDate) / 365.25 : null;
    return {
      ...r,
      eventType: labelFor(r.eventReason),
      isPromotion: PROMOTION_CODES.includes(r.eventReason),
      isPayChange: PAY_CODES.includes(r.eventReason),
      year: r.eventDate.slice(0, 4),
      month: MONTH_NAMES[Number(r.eventDate.slice(5, 7)) - 1],
      employeeName: e?.employeeName || r.employeeId,
      division: e?.division || "Unclassified",
      department: e?.department || "Unclassified",
      jobLevel: e?.jobLevel || "Unclassified",
      gender: e?.gender || "Unknown",
      legalEntity: e?.legalEntity || null,
      // A rehire can put hire_date after an older event -- no meaningful
      // tenure for those.
      tenureYears: tenure !== null && tenure >= 0 ? tenure : null,
    };
  });

  const maxYear = Math.max(TREND_START_YEAR, ...events.map((r) => Number(r.year)));
  const yearOrder = [];
  for (let y = TREND_START_YEAR; y <= maxYear; y++) yearOrder.push(String(y));
  const refYear = Number(REFERENCE_TODAY.slice(0, 4));
  // Default to the latest complete year -- the current year is partial, so
  // its rate isn't comparable with a full year's.
  let year = yearOrder.includes(String(refYear - 1)) ? String(refYear - 1) : yearOrder[yearOrder.length - 1];
  let division = "All", dept = "All", payType = "All";

  const divisions = ["All", ...sortedUnique(db.employeeMaster, (e) => e.division)];
  const depts = ["All", ...sortedUnique(db.employeeMaster, (e) => e.department)];

  legalEntityFilter(filtersEl, { db, onChange: draw });
  filterSelect(filtersEl, { label: "Year", options: yearOrder, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Division", options: divisions, value: division, onChange: (v) => { division = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });
  // Only narrows the Pay Changes section below, not the promotion charts.
  filterSelect(filtersEl, { label: "Pay Change Type", options: ["All", ...PAY_TYPES], value: payType, onChange: (v) => { payType = v; draw(); } });

  // Headcount denominator: average of active headcount at the start and end
  // of the year (end capped at REFERENCE_TODAY for the current, partial
  // year), from employee_master's hire/termination dates -- the same
  // point-in-time isActiveAsOf check headcount.js's trend chart uses.
  function avgHeadcount(y, employees) {
    const start = `${y}-01-01`;
    const end = `${y}-12-31` < REFERENCE_TODAY ? `${y}-12-31` : REFERENCE_TODAY;
    const atStart = employees.filter((e) => isActiveAsOf(e, start)).length;
    const atEnd = employees.filter((e) => isActiveAsOf(e, end)).length;
    return (atStart + atEnd) / 2;
  }
  function rate(promoRows, y, employees) {
    const hc = avgHeadcount(y, employees);
    const promoted = new Set(promoRows.filter((r) => r.year === y).map((r) => r.employeeId)).size;
    return hc ? (promoted / hc) * 100 : 0;
  }

  function draw() {
    contentEl.innerHTML = "";
    const inScope = (r) => legalEntityAllowed(db, r.legalEntity) &&
      (division === "All" || r.division === division) && (dept === "All" || r.department === dept);
    const employees = db.employeeMaster.filter(inScope);
    const scopedEvents = events.filter(inScope);
    const allYearPromos = scopedEvents.filter((r) => r.isPromotion && Number(r.year) >= TREND_START_YEAR);
    const promos = allYearPromos.filter((r) => r.year === year);
    const isPartial = Number(year) >= refYear;

    const promotedIds = new Set(promos.map((r) => r.employeeId));
    const hc = avgHeadcount(year, employees);
    const promoRate = hc ? (promotedIds.size / hc) * 100 : 0;
    const transferCount = promos.filter((r) => r.eventReason === "ESC-PRT").length;
    const withTenure = promos.filter((r) => r.tenureYears !== null);
    const avgTenure = withTenure.length ? withTenure.reduce((s, r) => s + r.tenureYears, 0) / withTenure.length : null;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Promotions", value: fmtInt(promos.length), note: isPartial ? `${year} year-to-date` : year });
    kpiCard(kpiRow, { label: "Employees Promoted", value: fmtInt(promotedIds.size), note: "distinct employees" });
    kpiCard(kpiRow, { label: "Promotion Rate", value: fmtPct(promoRate), note: `of avg headcount ${fmtInt(hc)}${isPartial ? " (YTD)" : ""}` });
    kpiCard(kpiRow, { label: "Promoted via Transfer", value: fmtInt(transferCount), note: `${fmtPct(promos.length ? (transferCount / promos.length) * 100 : 0)} of promotions` });
    kpiCard(kpiRow, { label: "Avg Tenure at Promotion", value: avgTenure === null ? "n/a" : `${fmtDec(avgTenure)} yrs`, note: "hire date to promotion date" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    // Trend charts ignore the Year filter (they're the year axis), same
    // convention as probation-pip.js's year-trend chart.
    const c1 = chartCard(grid, { title: "Promotion Rate Trend", sub: `% of average headcount promoted${yearOrder.includes(String(refYear)) ? ` · ${refYear} is year-to-date` : ""}` });
    barChart(c1, { labels: yearOrder, datasets: [{ label: "Promotion Rate %", data: yearOrder.map((y) => Number(rate(allYearPromos, y, employees).toFixed(1))) }], showLegend: false });

    const c2 = chartCard(grid, { title: "Promotions by Year", drilldown: { records: allYearPromos, matchField: "year", datasetField: "eventType", db } });
    barChart(c2, {
      labels: yearOrder,
      datasets: PROMOTION_TYPES.map((t) => ({ label: t, data: yearOrder.map((y) => allYearPromos.filter((r) => r.year === y && r.eventType === t).length), stacked: true })),
      stacked: true,
    });

    // Every division, regardless of the Division filter -- the chart's own
    // grouping dimension isn't also narrowed by that filter.
    const divScope = db.employeeMaster.filter((e) => legalEntityAllowed(db, e.legalEntity) && (dept === "All" || e.department === dept));
    const divScopePromos = events.filter((r) => r.isPromotion && legalEntityAllowed(db, r.legalEntity) && (dept === "All" || r.department === dept));
    const divOrder = sortedUnique(divScope, (e) => e.division);
    const divRates = divOrder.map((d) => Number(rate(divScopePromos.filter((r) => r.division === d), year, divScope.filter((e) => e.division === d)).toFixed(1)));
    const c3 = chartCard(grid, { title: "Promotion Rate by Division", sub: `${year}, % of average headcount`, drilldown: { records: divScopePromos.filter((r) => r.year === year), matchField: "division", db } });
    barChart(c3, { labels: divOrder, datasets: [{ label: "Promotion Rate %", data: divRates }], showLegend: false, horizontal: true });

    const deptCounts = sortedUnique(promos, (r) => r.department)
      .map((d) => [d, promos.filter((r) => r.department === d).length])
      .sort((a, b) => b[1] - a[1]);
    const c4 = chartCard(grid, { title: "Promotions by Department", sub: year, drilldown: { records: promos, matchField: "department", db } });
    barChart(c4, { labels: deptCounts.map((d) => d[0]), datasets: [{ label: "Promotions", data: deptCounts.map((d) => d[1]) }], showLegend: false, horizontal: true });

    const levels = [...JOB_LEVEL_ORDER, "Unclassified"].filter((l) => promos.some((r) => r.jobLevel === l));
    const c5 = chartCard(grid, { title: "Promotions by Job Level", sub: "Employee's current level, not the level at time of promotion", drilldown: { records: promos, matchField: "jobLevel", db } });
    barChart(c5, { labels: levels, datasets: [{ label: "Promotions", data: levels.map((l) => promos.filter((r) => r.jobLevel === l).length) }], showLegend: false });

    const genders = ["Male", "Female"];
    const c6 = chartCard(grid, { title: "Promotion Rate by Gender", sub: `${year}, % of average headcount`, drilldown: { records: promos, matchField: "gender", db } });
    barChart(c6, { labels: genders, datasets: [{ label: "Promotion Rate %", data: genders.map((g) => Number(rate(promos.filter((r) => r.gender === g), year, employees.filter((e) => e.gender === g)).toFixed(1))) }], showLegend: false });

    const c7 = chartCard(grid, { title: "Promotions by Month", sub: `${year} — when promotion cycles land`, drilldown: { records: promos, matchField: "month", db } });
    barChart(c7, { labels: MONTH_NAMES, datasets: [{ label: "Promotions", data: MONTH_NAMES.map((m) => promos.filter((r) => r.month === m).length) }], showLegend: false });

    tableCard(contentEl, {
      title: "Promotion Records", sub: year,
      columns: [
        { key: "employeeName", label: "Employee" }, { key: "division", label: "Division" },
        { key: "department", label: "Department" }, { key: "jobLevel", label: "Current Job Level" },
        { key: "eventDate", label: "Promotion Date" }, { key: "eventType", label: "Type" },
      ],
      rows: [...promos].sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    });

    drawPayChanges({ scopedEvents, employees, isPartial });
  }

  function drawPayChanges({ scopedEvents, employees, isPartial }) {
    sectionTitle(contentEl, "Pay Changes");

    const typeAllowed = (r) => payType === "All" || r.eventType === payType;
    const allYearPay = scopedEvents.filter((r) => r.isPayChange && typeAllowed(r) && Number(r.year) >= TREND_START_YEAR);
    const pay = allYearPay.filter((r) => r.year === year);
    const shownTypes = payType === "All" ? PAY_TYPES : [payType];

    const affectedIds = new Set(pay.map((r) => r.employeeId));
    const hc = avgHeadcount(year, employees);
    const payRate = hc ? (affectedIds.size / hc) * 100 : 0;
    const meritCount = pay.filter((r) => r.eventReason === "ESC-SL").length;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Pay Changes", value: fmtInt(pay.length), note: `${payType === "All" ? "all types" : payType} · ${isPartial ? `${year} YTD` : year}` });
    kpiCard(kpiRow, { label: "Employees Affected", value: fmtInt(affectedIds.size), note: "distinct employees" });
    kpiCard(kpiRow, { label: "Pay Change Rate", value: fmtPct(payRate), note: `of avg headcount ${fmtInt(hc)}${isPartial ? " (YTD)" : ""}` });
    kpiCard(kpiRow, { label: "Merit Increases", value: fmtInt(meritCount), note: payType === "All" || payType === "Merit Increase" ? "SAP reason ESC-SL" : "excluded by Pay Change Type filter" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const p1 = chartCard(grid, { title: "Pay Changes by Year", sub: `Counts only; the SAP report has no amounts${yearOrder.includes(String(refYear)) ? ` · ${refYear} is year-to-date` : ""}`, drilldown: { records: allYearPay, matchField: "year", datasetField: "eventType", db } });
    barChart(p1, {
      labels: yearOrder,
      datasets: shownTypes.map((t) => ({ label: t, data: yearOrder.map((y) => allYearPay.filter((r) => r.year === y && r.eventType === t).length), stacked: true })),
      stacked: true,
    });

    const p2 = chartCard(grid, { title: "Pay Changes by Month", sub: `${year} — when pay cycles land`, drilldown: { records: pay, matchField: "month", datasetField: "eventType", db } });
    barChart(p2, {
      labels: MONTH_NAMES,
      datasets: shownTypes.map((t) => ({ label: t, data: MONTH_NAMES.map((m) => pay.filter((r) => r.month === m && r.eventType === t).length), stacked: true })),
      stacked: true,
    });

    // Every division regardless of the Division filter, same as the
    // promotion-rate-by-division chart above.
    const divScope = db.employeeMaster.filter((e) => legalEntityAllowed(db, e.legalEntity) && (dept === "All" || e.department === dept));
    const divScopePay = events.filter((r) => r.isPayChange && typeAllowed(r) && legalEntityAllowed(db, r.legalEntity) && (dept === "All" || r.department === dept));
    const divOrder = sortedUnique(divScope, (e) => e.division);
    const p3 = chartCard(grid, { title: "Pay Change Rate by Division", sub: `${year}, % of average headcount`, drilldown: { records: divScopePay.filter((r) => r.year === year), matchField: "division", db } });
    barChart(p3, { labels: divOrder, datasets: [{ label: "Pay Change Rate %", data: divOrder.map((d) => Number(rate(divScopePay.filter((r) => r.division === d), year, divScope.filter((e) => e.division === d)).toFixed(1))) }], showLegend: false, horizontal: true });

    const deptCounts = sortedUnique(pay, (r) => r.department)
      .map((d) => [d, pay.filter((r) => r.department === d).length])
      .sort((a, b) => b[1] - a[1]);
    const p4 = chartCard(grid, { title: "Pay Changes by Department", sub: year, drilldown: { records: pay, matchField: "department", db } });
    barChart(p4, { labels: deptCounts.map((d) => d[0]), datasets: [{ label: "Pay Changes", data: deptCounts.map((d) => d[1]) }], showLegend: false, horizontal: true });

    tableCard(contentEl, {
      title: "Pay Change Records", sub: `${year} · ${payType === "All" ? "all types" : payType}`,
      columns: [
        { key: "employeeName", label: "Employee" }, { key: "division", label: "Division" },
        { key: "department", label: "Department" }, { key: "jobLevel", label: "Current Job Level" },
        { key: "eventDate", label: "Effective Date" }, { key: "eventType", label: "Type" },
      ],
      rows: [...pay].sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    });
  }

  draw();
}
