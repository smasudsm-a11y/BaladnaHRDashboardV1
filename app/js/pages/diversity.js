import { sortedUnique, sortGrades, withEmployeeFields, fmtInt, fmtPct } from "../data.js";
import { kpiCard, chartCard, barChart, doughnutChart, filterSelect } from "../charts.js";

export const meta = { id: "diversity", label: "Diversity & Inclusion", subtitle: "Workforce composition across gender, nationality, age, and leadership" };

export function render({ db, contentEl, filtersEl }) {
  // diversity has no legal_entity/employment_category of its own — joined in via employeeMaster.
  const enriched = withEmployeeFields(db, db.diversity, ["legalEntity", "employmentCategory"]);
  const grades = ["All", ...sortGrades(sortedUnique(enriched, (d) => d.grade))];
  const legalEntities = ["All", ...sortedUnique(enriched, (d) => d.legalEntity)];
  let grade = "All", legalEntity = "All";
  filterSelect(filtersEl, { label: "Grade", options: grades, value: grade, onChange: (v) => { grade = v; draw(); } });
  filterSelect(filtersEl, { label: "Legal Entity", options: legalEntities, value: legalEntity, onChange: (v) => { legalEntity = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const rows = enriched.filter((d) => (grade === "All" || d.grade === grade) && (legalEntity === "All" || d.legalEntity === legalEntity));

    const female = rows.filter((d) => d.gender === "Female").length;
    const femaleRatio = rows.length ? (female / rows.length) * 100 : 0;
    const leaders = rows.filter((d) => d.leadershipStatus === "Leadership");
    const femaleLeaders = leaders.filter((d) => d.gender === "Female").length;
    const womenInLeadership = leaders.length ? (femaleLeaders / leaders.length) * 100 : 0;
    const nationalities = new Set(rows.map((d) => d.nationality)).size;
    const local = rows.filter((d) => d.employmentCategory === "Local").length;
    const localizationRate = rows.length ? (local / rows.length) * 100 : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Female Ratio", value: fmtPct(femaleRatio), note: `${female} of ${rows.length} active employees` });
    kpiCard(kpiRow, { label: "Women in Leadership", value: fmtPct(womenInLeadership), note: `${femaleLeaders} of ${leaders.length} leaders` });
    kpiCard(kpiRow, { label: "Nationalities Represented", value: fmtInt(nationalities) });
    kpiCard(kpiRow, { label: "Localization", value: fmtPct(localizationRate), note: `${fmtInt(local)} local nationals` });
    kpiCard(kpiRow, { label: "Active Headcount", value: fmtInt(rows.length) });

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

    const ageBandOrder = sortedUnique(rows, (d) => d.ageBand).sort();
    const ageCounts = ageBandOrder.map((b) => rows.filter((d) => d.ageBand === b).length);
    const c2 = chartCard(grid, { title: "Age Distribution", drilldown: { records: rows, matchField: "ageBand", db } });
    barChart(c2, { labels: ageBandOrder, datasets: [{ label: "Headcount", data: ageCounts }], showLegend: false });

    const gradeOrder = sortGrades(sortedUnique(enriched, (d) => d.grade));
    const maleByGrade = gradeOrder.map((g) => rows.filter((d) => d.grade === g && d.gender === "Male").length);
    const femaleByGrade = gradeOrder.map((g) => rows.filter((d) => d.grade === g && d.gender === "Female").length);
    const c3 = chartCard(grid, { title: "Diversity by Grade", sub: "Gender split across job grades", drilldown: { records: rows, matchField: "grade", datasetField: "gender", db } });
    barChart(c3, { labels: gradeOrder, datasets: [{ label: "Male", data: maleByGrade, stacked: true }, { label: "Female", data: femaleByGrade, stacked: true }], stacked: true });

    const levelOrder = ["Staff", "Supervisory", "Managerial", "Executive"];
    const levelCounts = levelOrder.map((l) => rows.filter((d) => d.managementLevel === l).length);
    const c4 = chartCard(grid, { title: "Headcount by Organisation Level", drilldown: { records: rows, matchField: "managementLevel", db } });
    barChart(c4, { labels: levelOrder, datasets: [{ label: "Headcount", data: levelCounts }], showLegend: false });

    const grid2 = document.createElement("div");
    grid2.className = "grid-2";
    contentEl.appendChild(grid2);

    // Grade filter only — recruitment (pre-hire candidates) and attrition have no
    // legal_entity of their own, and no reliable employeeId join for recruitment
    // (candidates aren't in employeeMaster until hired), so Legal Entity doesn't apply here.
    const hiresGender = { Male: 0, Female: 0 };
    for (const r of db.recruitment) if (r.joiningDate && (grade === "All" || r.jobGrade === grade)) hiresGender[r.candidateGender] = (hiresGender[r.candidateGender] || 0) + 1;
    const exitsGender = { Male: 0, Female: 0 };
    for (const a of db.attrition) if (grade === "All" || a.grade === grade) exitsGender[a.gender] = (exitsGender[a.gender] || 0) + 1;
    const c5 = chartCard(grid2, { title: "Workforce Flow by Gender", sub: "Hires-in vs. exits-out, all recorded history" });
    barChart(c5, {
      labels: ["Male", "Female"],
      datasets: [{ label: "Hires In", data: [hiresGender.Male, hiresGender.Female] }, { label: "Exits Out", data: [exitsGender.Male, exitsGender.Female] }],
    });

    const c6 = chartCard(grid2, { title: "Workforce by Employment Category", sub: "Local vs. Expatriate", drilldown: { records: rows, matchField: "employmentCategory", db } });
    doughnutChart(c6, { labels: ["Local", "Expatriate"], data: [local, rows.length - local] });
  }

  draw();
}
