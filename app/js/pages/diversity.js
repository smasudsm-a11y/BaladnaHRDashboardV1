import { sortedUnique, sortGrades, withEmployeeFields, fmtInt, fmtPct, JOB_LEVEL_ORDER, LEADERSHIP_LEVELS, legalEntityAllowed, isCurrentlyEmployed, lastNMonths, monthEnd, REFERENCE_TODAY } from "../data.js";
import { kpiCard, chartCard, barChart, doughnutChart, filterSelect, legalEntityFilter } from "../charts.js";

// All real SAP data (2026-10-01 rework), so no dataStatus dot. Fixes made
// then: (1) the diversity table holds every employee ever loaded, including
// leavers, so everything is now limited to currently employed people (it
// previously counted all 3,148); (2) Women in Leadership read an always-empty
// `leadershipStatus` -- leaders are now management_level in LEADERSHIP_LEVELS,
// the same rule as Executive Insights; (3) Workforce Flow took hires from the
// still-synthetic recruitment table -- it now uses real employee_master hire
// and termination dates; (4) age bands are in age order, not alphabetical.
export const meta = { id: "diversity", label: "Diversity & Inclusion", subtitle: "Current workforce composition across gender, nationality, age, and leadership" };

const AGE_BAND_ORDER = ["<25", "25-34", "35-44", "45-54", "55+"];

export function render({ db, contentEl, filtersEl }) {
  // diversity has no legal_entity/status of its own — joined in via employeeMaster.
  const enriched = withEmployeeFields(db, db.diversity, ["legalEntity", "employmentStatus", "hireDate", "terminationDate"]);
  const current = enriched.filter((d) => isCurrentlyEmployed(d));
  const grades = ["All", ...sortGrades(sortedUnique(current, (d) => d.grade))];
  let grade = "All";
  legalEntityFilter(filtersEl, { db, onChange: draw });
  filterSelect(filtersEl, { label: "Grade", options: grades, value: grade, onChange: (v) => { grade = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const inScope = (d) => legalEntityAllowed(db, d.legalEntity) && (grade === "All" || d.grade === grade);
    const rows = current.filter(inScope);

    const female = rows.filter((d) => d.gender === "Female").length;
    const femaleRatio = rows.length ? (female / rows.length) * 100 : 0;
    const leaders = rows.filter((d) => LEADERSHIP_LEVELS.includes(d.managementLevel));
    const femaleLeaders = leaders.filter((d) => d.gender === "Female").length;
    const womenInLeadership = leaders.length ? (femaleLeaders / leaders.length) * 100 : 0;
    const nationalities = new Set(rows.map((d) => d.nationality)).size;
    // "Local" = Qatari nationals. employmentCategory now holds Direct/Indirect
    // (a real, but different, concept post-SAP-migration -- see
    // employee_master's employment_category) -- this KPI/chart had been
    // silently reading 0% since the cutover by checking employmentCategory
    // === "Local", a value that no longer exists. Same nationality-based
    // definition as headcount.js's "Locals (Qatari)" KPI.
    const local = rows.filter((d) => d.nationality === "Qatar").length;
    const localizationRate = rows.length ? (local / rows.length) * 100 : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Female Ratio", value: fmtPct(femaleRatio), note: `${fmtInt(female)} of ${fmtInt(rows.length)} current employees` });
    kpiCard(kpiRow, { label: "Women in Leadership", value: fmtPct(womenInLeadership), note: `${fmtInt(femaleLeaders)} of ${fmtInt(leaders.length)} leaders (Specialist/Supervisor and above)` });
    kpiCard(kpiRow, { label: "Nationalities Represented", value: fmtInt(nationalities) });
    kpiCard(kpiRow, { label: "Localization", value: fmtPct(localizationRate), note: `${fmtInt(local)} local nationals` });
    kpiCard(kpiRow, { label: "Current Headcount", value: fmtInt(rows.length), note: "Active, Paid Leave and Unpaid Leave" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const natCounts = new Map();
    for (const d of rows) natCounts.set(d.nationality, (natCounts.get(d.nationality) || 0) + 1);
    const topNat = Array.from(natCounts.entries()).sort((a, b) => b[1] - a[1]);
    const top8 = topNat.slice(0, 8);
    const otherSum = topNat.slice(8).reduce((s, [, n]) => s + n, 0);
    const natLabels = [...top8.map(([n]) => n), ...(otherSum ? ["Other"] : [])];
    const natValues = [...top8.map(([, n]) => n), ...(otherSum ? [otherSum] : [])];
    const c1 = chartCard(grid, { title: "Nationality Mix", sub: "Top nationalities by active headcount", drilldown: { records: rows, matchField: "nationality", db } });
    barChart(c1, { labels: natLabels, datasets: [{ label: "Headcount", data: natValues }], horizontal: true, showLegend: false });

    // Fixed age order ("<25" first), plus any unexpected band at the end.
    const ageBandOrder = [...AGE_BAND_ORDER, ...sortedUnique(rows, (d) => d.ageBand).filter((b) => !AGE_BAND_ORDER.includes(b))].filter((b) => rows.some((d) => d.ageBand === b));
    const ageCounts = ageBandOrder.map((b) => rows.filter((d) => d.ageBand === b).length);
    const c2 = chartCard(grid, { title: "Age Distribution", drilldown: { records: rows, matchField: "ageBand", db } });
    barChart(c2, { labels: ageBandOrder, datasets: [{ label: "Headcount", data: ageCounts }], showLegend: false });

    const gradeOrder = sortGrades(sortedUnique(rows, (d) => d.grade));
    const maleByGrade = gradeOrder.map((g) => rows.filter((d) => d.grade === g && d.gender === "Male").length);
    const femaleByGrade = gradeOrder.map((g) => rows.filter((d) => d.grade === g && d.gender === "Female").length);
    const c3 = chartCard(grid, { title: "Diversity by Grade", sub: "Gender split across job grades", drilldown: { records: rows, matchField: "grade", datasetField: "gender", db } });
    barChart(c3, { labels: gradeOrder, datasets: [{ label: "Male", data: maleByGrade, stacked: true }, { label: "Female", data: femaleByGrade, stacked: true }], stacked: true });

    const levelOrder = JOB_LEVEL_ORDER;
    const levelCounts = levelOrder.map((l) => rows.filter((d) => d.managementLevel === l).length);
    const c4 = chartCard(grid, { title: "Headcount by Organisation Level", drilldown: { records: rows, matchField: "managementLevel", db } });
    barChart(c4, { labels: levelOrder, datasets: [{ label: "Headcount", data: levelCounts }], showLegend: false });

    const grid2 = document.createElement("div");
    grid2.className = "grid-2";
    contentEl.appendChild(grid2);

    // Real hires and exits over the trailing 12 months, both from
    // employee_master dates, so both halves respect Legal Entity and Grade.
    const ttmStart = `${lastNMonths(12)[0]}-01`;
    const flowPeople = enriched.filter(inScope);
    const hires = flowPeople.filter((d) => d.hireDate && d.hireDate >= ttmStart && d.hireDate <= REFERENCE_TODAY);
    const exits = flowPeople.filter((d) => d.terminationDate && d.terminationDate >= ttmStart && d.terminationDate <= REFERENCE_TODAY);
    const flowRecords = [...hires.map((d) => ({ ...d, flow: "Hires In" })), ...exits.map((d) => ({ ...d, flow: "Exits Out" }))];
    const c5 = chartCard(grid2, {
      title: "Workforce Flow by Gender", sub: `Hires in vs. exits out, last 12 months (since ${ttmStart.slice(0, 7)})`,
      drilldown: { records: flowRecords, matchField: "gender", datasetField: "flow", db },
    });
    barChart(c5, {
      labels: ["Male", "Female"],
      datasets: [
        { label: "Hires In", data: ["Male", "Female"].map((g) => hires.filter((d) => d.gender === g).length) },
        { label: "Exits Out", data: ["Male", "Female"].map((g) => exits.filter((d) => d.gender === g).length) },
      ],
    });

    const c6 = chartCard(grid2, {
      title: "Workforce by Nationality Category", sub: "Local (Qatari) vs. Expatriate",
      drilldown: { records: rows, matchFn: (r, label) => (label === "Local") === (r.nationality === "Qatar"), db },
    });
    doughnutChart(c6, { labels: ["Local", "Expatriate"], data: [local, rows.length - local] });
  }

  draw();
}
