import { sortedUnique, fmtInt, fmtPct } from "../data.js";
import { kpiCard, chartCard, tableCard, barChart, doughnutChart, filterSelect } from "../charts.js";

export const meta = { id: "probation-pip", label: "Probation & PIP", subtitle: "Probation outcomes and Performance Improvement Plan success rates" };

const PROBATION_OUTCOME_ORDER = ["Confirmed", "Extended", "Not Confirmed"];
const MONTH3_ORDER = ["Improved", "Not Improved", "Terminated"];
const MONTH6_ORDER = ["Completed Successfully", "Not Improved", "Terminated"];

function enrich(db, rows) {
  return rows.map((r) => {
    const e = db.employeeIndex.get(r.employeeId);
    return { ...r, employeeName: e?.employeeName || r.employeeId, department: e?.department || "Unclassified" };
  });
}

export function render({ db, contentEl, filtersEl }) {
  const probation = enrich(db, db.probationReviews);
  const pip = enrich(db, db.pipRecords);

  const years = ["All", ...sortedUnique(probation, (r) => r.probationStartDate?.slice(0, 4)).sort()];
  const depts = ["All", ...sortedUnique(probation, (r) => r.department).sort()];
  let year = "All", dept = "All";

  filterSelect(filtersEl, { label: "Year", options: years, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    // Probation rows are scoped by hire year (probationStartDate = hire
    // date); PIP rows by their own pipStartDate year — each table uses the
    // date field that actually matters for it, same convention as every
    // other multi-table page in this app.
    const probationRows = probation.filter((r) =>
      (year === "All" || r.probationStartDate?.startsWith(year)) && (dept === "All" || r.department === dept));
    const pipRows = pip.filter((r) =>
      (year === "All" || r.pipStartDate?.startsWith(year)) && (dept === "All" || r.department === dept));

    const confirmedCount = probationRows.filter((r) => r.outcome === "Confirmed").length;
    const extendedCount = probationRows.filter((r) => r.outcome === "Extended").length;
    const notConfirmedCount = probationRows.filter((r) => r.outcome === "Not Confirmed").length;
    const probationSuccessRate = probationRows.length ? (confirmedCount / probationRows.length) * 100 : 0;

    const month3Improved = pipRows.filter((r) => r.month3Status === "Improved").length;
    const month6Success = pipRows.filter((r) => r.month6Status === "Completed Successfully").length;
    const month3Rate = pipRows.length ? (month3Improved / pipRows.length) * 100 : 0;
    const month6Rate = pipRows.length ? (month6Success / pipRows.length) * 100 : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Probation Reviews", value: fmtInt(probationRows.length), note: "selected period" });
    kpiCard(kpiRow, { label: "Probation Success Rate", value: fmtPct(probationSuccessRate), note: `${fmtInt(confirmedCount)} confirmed`, deltaKind: probationSuccessRate >= 90 ? "good" : probationSuccessRate >= 75 ? "warn" : "bad" });
    kpiCard(kpiRow, { label: "Extended Probations", value: fmtInt(extendedCount), note: fmtPct(probationRows.length ? (extendedCount / probationRows.length) * 100 : 0) });
    kpiCard(kpiRow, { label: "PIP Enrollments", value: fmtInt(pipRows.length), note: "selected period" });
    kpiCard(kpiRow, { label: "PIP Success Rate — 3 Month", value: fmtPct(month3Rate), note: `${fmtInt(month3Improved)} of ${fmtInt(pipRows.length)} improved` });
    kpiCard(kpiRow, { label: "PIP Success Rate — 6 Month", value: fmtPct(month6Rate), note: `${fmtInt(month6Success)} of ${fmtInt(pipRows.length)} completed successfully` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const outcomeCounts = [confirmedCount, extendedCount, notConfirmedCount];
    const c1 = chartCard(grid, { title: "Probation Outcome", drilldown: { records: probationRows, matchField: "outcome", db } });
    doughnutChart(c1, { labels: PROBATION_OUTCOME_ORDER, data: outcomeCounts });

    const deptOrder = sortedUnique(probationRows, (r) => r.department).sort();
    const byDeptOutcome = PROBATION_OUTCOME_ORDER.map((o) => deptOrder.map((d) => probationRows.filter((r) => r.department === d && r.outcome === o).length));
    const c2 = chartCard(grid, { title: "Probation Outcome by Department", drilldown: { records: probationRows, matchField: "department", db } });
    barChart(c2, { labels: deptOrder, datasets: PROBATION_OUTCOME_ORDER.map((o, i) => ({ label: o, data: byDeptOutcome[i], stacked: true })), stacked: true, horizontal: true });

    const yearOrder = sortedUnique(probation, (r) => r.probationStartDate?.slice(0, 4)).sort();
    const byYearOutcome = PROBATION_OUTCOME_ORDER.map((o) => yearOrder.map((y) => probation.filter((r) => r.probationStartDate?.startsWith(y) && (dept === "All" || r.department === dept) && r.outcome === o).length));
    const c3 = chartCard(grid, { title: "Probation Outcome Trend", sub: "By hire year" });
    barChart(c3, { labels: yearOrder, datasets: PROBATION_OUTCOME_ORDER.map((o, i) => ({ label: o, data: byYearOutcome[i], stacked: true })), stacked: true });

    const pipDeptOrder = sortedUnique(pipRows, (r) => r.department).sort();
    const pipByDept = pipDeptOrder.map((d) => pipRows.filter((r) => r.department === d).length);
    const c4 = chartCard(grid, { title: "PIP Enrollments by Department", drilldown: { records: pipRows, matchField: "department", db } });
    barChart(c4, { labels: pipDeptOrder, datasets: [{ label: "PIP Enrollments", data: pipByDept }], showLegend: false, horizontal: true });

    const month3Counts = MONTH3_ORDER.map((s) => pipRows.filter((r) => r.month3Status === s).length);
    const c5 = chartCard(grid, { title: "PIP Outcome — 3 Month", drilldown: { records: pipRows, matchField: "month3Status", db } });
    doughnutChart(c5, { labels: MONTH3_ORDER, data: month3Counts });

    const month6Counts = MONTH6_ORDER.map((s) => pipRows.filter((r) => r.month6Status === s).length);
    const c6 = chartCard(grid, { title: "PIP Outcome — 6 Month", drilldown: { records: pipRows, matchField: "month6Status", db } });
    doughnutChart(c6, { labels: MONTH6_ORDER, data: month6Counts });

    tableCard(contentEl, {
      title: "PIP Records", sub: "Selected period",
      columns: [
        { key: "employeeName", label: "Employee" }, { key: "department", label: "Department" },
        { key: "pipStartDate", label: "PIP Start Date" }, { key: "reason", label: "Reason" },
        { key: "month3Status", label: "3-Month Status" }, { key: "month6Status", label: "6-Month Status" },
      ],
      rows: pipRows,
    });
  }

  draw();
}
