import { sortedUnique, withEmployeeFields, countUnique, fmtInt, fmtDec, fmtPct, fmtMoney } from "../data.js";
import { kpiCard, chartCard, barChart, doughnutChart, filterSelect } from "../charts.js";

export const meta = { id: "training", label: "Learning & Training", subtitle: "Training investment, completion, and compliance" };

export function render({ db, contentEl, filtersEl }) {
  const enriched = withEmployeeFields(db, db.training, ["businessUnit", "location"]);
  const years = ["All", ...sortedUnique(enriched, (t) => t.completionDate?.slice(0, 4)).sort()];
  const categories = ["All", ...sortedUnique(enriched, (t) => t.trainingCategory).sort()];
  let year = "All", category = "All";

  filterSelect(filtersEl, { label: "Year", options: years, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Category", options: categories, value: category, onChange: (v) => { category = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const rows = enriched.filter((t) => (year === "All" || t.completionDate?.startsWith(year)) && (category === "All" || t.trainingCategory === category));

    const totalHours = rows.reduce((s, t) => s + t.trainingHours, 0);
    const totalCost = rows.reduce((s, t) => s + t.trainingCost, 0);
    const enrolled = rows.length;
    const completed = rows.filter((t) => t.completionStatus === "Completed").length;
    const completionRate = enrolled ? (completed / enrolled) * 100 : 0;
    const mandatory = rows.filter((t) => t.trainingCategory === "Mandatory");
    const mandatoryCompleted = mandatory.filter((t) => t.completionStatus === "Completed").length;
    const mandatoryCompliance = mandatory.length ? (mandatoryCompleted / mandatory.length) * 100 : 0;
    const uniqueEmployees = countUnique(rows, (t) => t.employeeId);
    const hoursPerEmployee = uniqueEmployees ? totalHours / uniqueEmployees : 0;
    const costPerPerson = uniqueEmployees ? totalCost / uniqueEmployees : 0;
    const costPerHour = totalHours ? totalCost / totalHours : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Training Hours / Employee", value: fmtDec(hoursPerEmployee, 1), note: `${fmtInt(totalHours)} total hours` });
    kpiCard(kpiRow, { label: "Training Cost", value: fmtMoney(totalCost), note: `${fmtMoney(costPerPerson)} / person · ${fmtMoney(costPerHour)} / hour` });
    kpiCard(kpiRow, { label: "Completion Rate", value: fmtPct(completionRate), note: `${completed} of ${enrolled} enrollments` });
    kpiCard(kpiRow, { label: "Mandatory Training Compliance", value: fmtPct(mandatoryCompliance), note: `${mandatoryCompleted} of ${mandatory.length} mandatory enrollments` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const catOrder = sortedUnique(enriched, (t) => t.trainingCategory).sort();
    const hoursByCat = catOrder.map((c) => rows.filter((t) => t.trainingCategory === c).reduce((s, t) => s + t.trainingHours, 0));
    const c1 = chartCard(grid, { title: "Training Hours by Category", drilldown: { records: rows, matchField: "trainingCategory", db } });
    barChart(c1, { labels: catOrder, datasets: [{ label: "Hours", data: hoursByCat.map(Math.round) }], showLegend: false });

    const statusOrder = ["Completed", "In Progress", "Not Started"];
    const statusCounts = statusOrder.map((s) => rows.filter((t) => t.completionStatus === s).length);
    const c2 = chartCard(grid, { title: "Completion Status", drilldown: { records: rows, matchField: "completionStatus", db } });
    doughnutChart(c2, { labels: statusOrder, data: statusCounts });

    const costByBu = new Map();
    for (const t of rows) costByBu.set(t.businessUnit, (costByBu.get(t.businessUnit) || 0) + t.trainingCost);
    const buLabels = Array.from(costByBu.keys());
    const c3 = chartCard(grid, { title: "Training Cost by Business Unit", drilldown: { records: rows, matchField: "businessUnit", db } });
    barChart(c3, { labels: buLabels, datasets: [{ label: "Cost (QAR)", data: buLabels.map((b) => Math.round(costByBu.get(b))) }], showLegend: false });

    const costByLoc = new Map();
    for (const t of rows) costByLoc.set(t.location, (costByLoc.get(t.location) || 0) + t.trainingCost);
    const locLabels = Array.from(costByLoc.keys());
    const c4 = chartCard(grid, { title: "Training Cost by Location", drilldown: { records: rows, matchField: "location", db } });
    barChart(c4, { labels: locLabels, datasets: [{ label: "Cost (QAR)", data: locLabels.map((l) => Math.round(costByLoc.get(l))) }], horizontal: true, showLegend: false });
  }

  draw();
}
