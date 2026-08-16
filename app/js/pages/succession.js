import { sortedUnique, fmtInt, fmtPct, fmtDec } from "../data.js";
import { kpiCard, chartCard, tableCard, barChart, doughnutChart, filterSelect } from "../charts.js";

export const meta = { id: "succession", label: "Succession Planning", subtitle: "Critical roles, incumbents, and successor readiness" };

const CRITICALITY_ORDER = ["Critical", "High", "Medium"];
const READINESS_ORDER = ["Ready Now", "Ready 1-2 Years", "Ready 3-5 Years", "Not Ready"];

function enrichIncumbents(db) {
  return db.incumbents.map((inc) => {
    const pos = db.criticalPositionsIndex.get(inc.positionId);
    const e = inc.employeeId ? db.employeeIndex.get(inc.employeeId) : null;
    return {
      ...inc,
      positionTitle: pos?.positionTitle || "Unknown Position",
      department: pos?.department || "Unclassified",
      criticality: pos?.criticality || "Unclassified",
      isVacant: !inc.employeeId,
      employeeName: e ? e.employeeName : null,
    };
  });
}

// `employeeId` is deliberately aliased from successorEmployeeId here (not
// just carried as its own field) — export.js's openPersonDetail always
// looks up `record.employeeId` when a drilldown row is clicked, so without
// this alias, clicking a successor in a drilldown list would fail to merge
// in that person's employee_master fields.
function enrichSuccessors(db) {
  return db.successors.map((s) => {
    const pos = db.criticalPositionsIndex.get(s.positionId);
    const e = db.employeeIndex.get(s.successorEmployeeId);
    return {
      ...s,
      employeeId: s.successorEmployeeId,
      employeeName: e?.employeeName || s.successorEmployeeId,
      department: pos?.department || e?.department || "Unclassified",
      positionTitle: pos?.positionTitle || "Unknown Position",
    };
  });
}

export function render({ db, contentEl, filtersEl }) {
  const incumbents = enrichIncumbents(db);
  const successors = enrichSuccessors(db);

  const depts = ["All", ...sortedUnique(db.criticalPositions, (p) => p.department).sort()];
  let dept = "All";
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const posRows = db.criticalPositions.filter((p) => dept === "All" || p.department === dept);
    const posIds = new Set(posRows.map((p) => p.positionId));
    const incRows = incumbents.filter((i) => posIds.has(i.positionId));
    const succRows = successors.filter((s) => posIds.has(s.positionId));

    const vacantCount = incRows.filter((i) => i.isVacant).length;
    const vacancyRate = posRows.length ? (vacantCount / posRows.length) * 100 : 0;

    const positionsWithSuccessor = new Set(succRows.map((s) => s.positionId));
    const coverageRate = posRows.length ? (positionsWithSuccessor.size / posRows.length) * 100 : 0;

    const hiPoEmployeeIds = new Set(succRows.filter((s) => s.isHighPotential).map((s) => s.employeeId));
    const readyNowCount = succRows.filter((s) => s.readiness === "Ready Now").length;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Critical Roles", value: fmtInt(posRows.length) });
    kpiCard(kpiRow, {
      label: "Vacant Positions", value: fmtInt(vacantCount),
      note: `${fmtPct(vacancyRate)} of critical roles`,
      deltaKind: vacantCount > 0 ? "warn" : "good",
    });
    kpiCard(kpiRow, {
      label: "Succession Coverage", value: fmtPct(coverageRate),
      note: `${positionsWithSuccessor.size} of ${posRows.length} roles have a named successor`,
      deltaKind: coverageRate >= 75 ? "good" : coverageRate >= 50 ? "warn" : "bad",
    });
    kpiCard(kpiRow, { label: "High-Potential Employees", value: fmtInt(hiPoEmployeeIds.size), note: "distinct employees flagged high-potential" });
    kpiCard(kpiRow, { label: "Ready-Now Successors", value: fmtInt(readyNowCount), note: `of ${succRows.length} named successors` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const critCounts = CRITICALITY_ORDER.map((c) => posRows.filter((p) => p.criticality === c).length);
    const c1 = chartCard(grid, { title: "Critical Roles by Criticality", drilldown: { records: posRows, matchField: "criticality", db } });
    doughnutChart(c1, { labels: CRITICALITY_ORDER, data: critCounts });

    const deptOrder = sortedUnique(posRows, (p) => p.department).sort();
    const deptCounts = deptOrder.map((d) => posRows.filter((p) => p.department === d).length);
    const c2 = chartCard(grid, { title: "Critical Roles by Department", drilldown: { records: posRows, matchField: "department", db } });
    barChart(c2, { labels: deptOrder, datasets: [{ label: "Critical Roles", data: deptCounts }], horizontal: true, showLegend: false });

    const filledCount = incRows.length - vacantCount;
    const c3 = chartCard(grid, {
      title: "Position Status", sub: "Filled vs. vacant critical positions",
      drilldown: { records: incRows, matchFn: (r, label) => (label === "Vacant" ? r.isVacant : !r.isVacant), db },
    });
    doughnutChart(c3, { labels: ["Filled", "Vacant"], data: [filledCount, vacantCount] });

    const readinessCounts = READINESS_ORDER.map((r) => succRows.filter((s) => s.readiness === r).length);
    const c4 = chartCard(grid, { title: "Successor Readiness", drilldown: { records: succRows, matchField: "readiness", db } });
    barChart(c4, { labels: READINESS_ORDER, datasets: [{ label: "Successors", data: readinessCounts }], showLegend: false });

    const hiPoRows = succRows.filter((s) => s.isHighPotential);
    const hiPoDeptOrder = sortedUnique(hiPoRows, (s) => s.department).sort();
    const hiPoByDept = hiPoDeptOrder.map((d) => hiPoRows.filter((s) => s.department === d).length);
    const c5 = chartCard(grid, { title: "High-Potential Employees by Department", drilldown: { records: hiPoRows, matchField: "department", db } });
    barChart(c5, { labels: hiPoDeptOrder, datasets: [{ label: "High-Potential", data: hiPoByDept }], showLegend: false });

    const successorCounts = new Map();
    for (const s of succRows) successorCounts.set(s.positionId, (successorCounts.get(s.positionId) || 0) + 1);
    const noSuccessorCount = posRows.filter((p) => !successorCounts.has(p.positionId)).length;
    const c6 = chartCard(grid, {
      title: "Positions Without a Named Successor", sub: "Succession gap, by criticality",
      drilldown: { records: posRows.filter((p) => !successorCounts.has(p.positionId)), matchField: "criticality", db },
    });
    barChart(c6, {
      labels: CRITICALITY_ORDER,
      datasets: [{ label: "No Successor", data: CRITICALITY_ORDER.map((c) => posRows.filter((p) => p.criticality === c && !successorCounts.has(p.positionId)).length) }],
      showLegend: false,
    });

    tableCard(contentEl, {
      title: "Position Holders", sub: "Critical roles and their current incumbents",
      columns: [
        { key: "positionTitle", label: "Position" }, { key: "department", label: "Department" },
        { key: "criticality", label: "Criticality" }, { key: "employeeNameDisplay", label: "Incumbent" },
        { key: "timeInRoleYears", label: "Time in Role (yrs)", num: true, fmt: (v) => (v == null ? "—" : fmtDec(v, 1)) },
        { key: "retirementRisk", label: "Retirement Risk", fmt: (v) => v || "—" },
      ],
      rows: incRows.map((i) => ({ ...i, employeeNameDisplay: i.employeeName || "— Vacant —" })),
    });
  }

  draw();
}
