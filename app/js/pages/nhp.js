import { sortGrades, sortedUnique, withEmployeeFields, fmtInt, fmtPct } from "../data.js";
import { kpiCard, chartCard, barChart, doughnutChart } from "../charts.js";

// Shares the "training" access grant — this is one row per participant in the
// same `training` table (training_category: "New Hire Program"), not a
// separate table, so there's no reason for it to need its own section grant.
export const meta = {
  id: "nhp", section: "training", sectionLabel: "Learning & Training",
  label: "New Hire Program", subtitle: "Onboarding curriculum completion for recently hired employees",
};

const STATUS_ORDER = ["Completed", "In Progress", "Overdue"];

export function render({ db, contentEl }) {
  const enriched = withEmployeeFields(db, db.training, ["employeeName", "department", "jobGrade"]);
  const rows = enriched.filter((t) => t.trainingCategory === "New Hire Program");

  const counts = STATUS_ORDER.map((s) => rows.filter((t) => t.completionStatus === s).length);
  const [completed, inProgress, overdue] = counts;

  const kpiRow = document.createElement("div");
  kpiRow.className = "kpi-row";
  contentEl.appendChild(kpiRow);
  kpiCard(kpiRow, { label: "Total New Hire Program (NHP)", value: fmtInt(rows.length) });
  kpiCard(kpiRow, { label: "NHP Completed", value: fmtInt(completed), note: fmtPct(rows.length ? (completed / rows.length) * 100 : 0) });
  kpiCard(kpiRow, { label: "NHP Completion %", value: fmtPct(rows.length ? (completed / rows.length) * 100 : 0) });
  kpiCard(kpiRow, { label: "NHP Overdue", value: fmtInt(overdue), note: fmtPct(rows.length ? (overdue / rows.length) * 100 : 0) });

  const grid = document.createElement("div");
  grid.className = "grid-2";
  contentEl.appendChild(grid);

  const c1 = chartCard(grid, {
    title: "Total NHP by Status",
    drilldown: {
      records: rows, matchField: "completionStatus", db,
      columns: [
        { key: "employeeId", label: "Employee ID" }, { key: "employeeName", label: "Name" },
        { key: "department", label: "Department" }, { key: "jobGrade", label: "Grade" },
        { key: "completionStatus", label: "Status" }, { key: "completionDate", label: "Completion Date" },
      ],
    },
  });
  doughnutChart(c1, { labels: STATUS_ORDER, data: counts });

  const gradeOrder = sortGrades(sortedUnique(rows, (t) => t.jobGrade));
  const byGradeStatus = STATUS_ORDER.map((s) => gradeOrder.map((g) => rows.filter((t) => t.jobGrade === g && t.completionStatus === s).length));
  const c2 = chartCard(grid, { title: "Total NHP by Grade and Status", drilldown: { records: rows, matchField: "jobGrade", db } });
  barChart(c2, { labels: gradeOrder, datasets: STATUS_ORDER.map((s, i) => ({ label: s, data: byGradeStatus[i], stacked: true })), stacked: true });

  const deptOrder = sortedUnique(rows, (t) => t.department).sort();
  const byDeptStatus = STATUS_ORDER.map((s) => deptOrder.map((d) => rows.filter((t) => t.department === d && t.completionStatus === s).length));
  const c3 = chartCard(grid, {
    title: "Total NHP Status by Department",
    drilldown: {
      records: rows, matchField: "department", db,
      columns: [
        { key: "employeeId", label: "Employee ID" }, { key: "employeeName", label: "Name" },
        { key: "department", label: "Department" }, { key: "completionStatus", label: "Status" }, { key: "completionDate", label: "Completion Date" },
      ],
    },
    tableColumns: [
      { key: "employeeName", label: "Employee" }, { key: "department", label: "Department" },
      { key: "jobGrade", label: "Grade" }, { key: "completionStatus", label: "Status" }, { key: "completionDate", label: "Completion Date" },
    ],
    tableRows: rows,
  });
  barChart(c3, { labels: deptOrder, datasets: STATUS_ORDER.map((s, i) => ({ label: s, data: byDeptStatus[i], stacked: true })), stacked: true, horizontal: true });
}
