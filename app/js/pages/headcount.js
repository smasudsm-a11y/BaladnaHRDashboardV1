import { lastNMonths, monthEnd, monthLabel, isActiveAsOf, sortedUnique, fmtInt, fmtDec, REFERENCE_TODAY } from "../data.js";
import { kpiCard, chartCard, lineChart, barChart, filterSelect } from "../charts.js";

export const meta = { id: "headcount", label: "Headcount & Workforce Profile", subtitle: "Trend, structure, and span of control" };

export function render({ db, contentEl, filtersEl }) {
  const bus = ["All", ...sortedUnique(db.employeeMaster, (e) => e.businessUnit)];
  let bu = "All";

  filterSelect(filtersEl, { label: "Business Unit", options: bus, value: bu, onChange: (v) => { bu = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const em = db.employeeMaster.filter((e) => bu === "All" || e.businessUnit === bu);
    const active = em.filter((e) => e.employmentStatus === "Active");
    const months = lastNMonths(12);

    const fte = active.reduce((s, e) => s + (e.fullTimePartTime === "Part Time" ? 0.5 : 1), 0);
    const avgAge = active.length ? active.reduce((s, e) => s + (e.age || 0), 0) / active.length : 0;
    const avgTenure = active.length ? active.reduce((s, e) => s + (e.lengthOfService || 0), 0) / active.length : 0;

    const ttmStart = monthEnd(months[0]);
    const hiresTTM = em.filter((e) => e.hireDate >= ttmStart).length;
    const exitsTTM = em.filter((e) => e.terminationDate && e.terminationDate >= ttmStart).length;
    const opening = em.filter((e) => isActiveAsOf(e, ttmStart)).length;

    // span of control: current direct reports among active employees only, restricted to this BU
    const empIds = new Set(active.map((e) => e.employeeId));
    const orgRows = db.orgHierarchy.filter((o) => empIds.has(o.employeeId));
    const directReports = new Map();
    for (const o of orgRows) {
      if (!o.managerId) continue;
      directReports.set(o.managerId, (directReports.get(o.managerId) || 0) + 1);
    }
    const spans = Array.from(directReports.values());
    const avgSpan = spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Headcount", value: fmtInt(active.length), note: `FTE ${fmtInt(fte)}` });
    kpiCard(kpiRow, { label: "Headcount Movement (TTM)", value: `${opening} → ${active.length}`, note: `+${hiresTTM} hires, −${exitsTTM} exits` });
    kpiCard(kpiRow, { label: "Average Age", value: fmtDec(avgAge, 1), note: "years" });
    kpiCard(kpiRow, { label: "Average Tenure", value: fmtDec(avgTenure, 1), note: "years of service" });
    kpiCard(kpiRow, { label: "Span of Control", value: fmtDec(avgSpan, 1), note: `avg direct reports across ${spans.length} managers` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const headcountSeries = months.map((ym) => em.filter((e) => isActiveAsOf(e, monthEnd(ym))).length);
    const c1 = chartCard(grid, { title: "Headcount Trend", sub: "Active employees, month-end" });
    lineChart(c1, { labels: months.map(monthLabel), datasets: [{ label: "Headcount", data: headcountSeries }] });

    const contractCounts = new Map();
    for (const e of active) contractCounts.set(e.employeeType, (contractCounts.get(e.employeeType) || 0) + 1);
    const ctLabels = Array.from(contractCounts.keys());
    const c2 = chartCard(grid, { title: "Headcount by Contract Type", drilldown: { records: active, matchField: "employeeType", db } });
    barChart(c2, { labels: ctLabels, datasets: [{ label: "Headcount", data: ctLabels.map((k) => contractCounts.get(k)) }], showLegend: false });

    const levelOrder = ["Staff", "Supervisory", "Managerial", "Executive"];
    const levelCounts = new Map(levelOrder.map((l) => [l, 0]));
    for (const e of active) if (levelCounts.has(e.jobLevel)) levelCounts.set(e.jobLevel, levelCounts.get(e.jobLevel) + 1);
    const c3 = chartCard(grid, { title: "Headcount by Organisation Level", drilldown: { records: active, matchField: "jobLevel", db } });
    barChart(c3, { labels: levelOrder, datasets: [{ label: "Headcount", data: levelOrder.map((l) => levelCounts.get(l)) }], showLegend: false });

    // span of control by department: average direct-report count of managers in each department
    const managers = active
      .filter((e) => e.jobLevel === "Managerial" || e.jobLevel === "Executive" || e.jobLevel === "Supervisory")
      .map((e) => ({ ...e, directReports: directReports.get(e.employeeId) || 0 }));
    const managersByDept = new Map();
    for (const m of managers) {
      if (!managersByDept.has(m.department)) managersByDept.set(m.department, []);
      managersByDept.get(m.department).push(m.directReports);
    }
    const deptLabels = Array.from(managersByDept.keys()).sort();
    const deptAvgSpan = deptLabels.map((d) => {
      const arr = managersByDept.get(d);
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    });
    const c4 = chartCard(grid, {
      title: "Span of Control by Department", sub: "Average direct reports per manager/supervisor",
      drilldown: { records: managers, matchField: "department", db, columns: [
        { key: "employeeId", label: "Employee ID" }, { key: "employeeName", label: "Name" },
        { key: "jobLevel", label: "Level" }, { key: "positionTitle", label: "Position" }, { key: "directReports", label: "Direct Reports" },
      ] },
    });
    barChart(c4, { labels: deptLabels, datasets: [{ label: "Avg direct reports", data: deptAvgSpan.map((v) => Math.round(v * 10) / 10) }], horizontal: true, showLegend: false });
  }

  draw();
}
