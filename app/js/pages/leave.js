import { sortedUnique, fmtInt, fmtDec, fmtPct, fmtMoney } from "../data.js";
import { kpiCard, chartCard, barChart, filterSelect } from "../charts.js";

export const meta = { id: "leave", label: "Leave & Absence", subtitle: "Leave utilization, liability, and absenteeism" };

function ageBandOf(age) {
  if (age == null) return "Unknown";
  if (age < 25) return "<25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
}

export function render({ db, contentEl, filtersEl }) {
  const years = ["All", ...sortedUnique(db.leave, (l) => l.leaveStartDate?.slice(0, 4)).sort()];
  const bus = ["All", ...sortedUnique(db.leave, (l) => l.department)];
  let year = "All", dept = "All";

  filterSelect(filtersEl, { label: "Year", options: years, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: bus, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const leaveRows = db.leave.filter((l) => (year === "All" || l.leaveStartDate?.startsWith(year)) && (dept === "All" || l.department === dept) && l.leaveStatus === "Approved");
    const absRows = db.absenteeism.filter((a) => (year === "All" || a.absenceDate?.startsWith(year)) && (dept === "All" || a.department === dept));

    const totalLeaveDays = leaveRows.reduce((s, l) => s + l.leaveDays, 0);

    const annualRows = db.leave.filter((l) => {
      const e = db.employeeIndex.get(l.employeeId);
      return l.leaveType === "Annual" && (dept === "All" || l.department === dept) && e && e.employmentStatus === "Active";
    });
    const latestBalance = new Map();
    for (const l of annualRows) {
      const prev = latestBalance.get(l.employeeId);
      if (!prev || l.leaveStartDate > prev.leaveStartDate) latestBalance.set(l.employeeId, l);
    }
    const balances = Array.from(latestBalance.values()).map((l) => l.leaveBalance);
    const avgBalance = balances.length ? balances.reduce((a, b) => a + b, 0) / balances.length : 0;

    let liability = 0;
    for (const [empId, l] of latestBalance) {
      const sal = db.latestBaseSalary.get(empId);
      if (sal) liability += (l.leaveBalance || 0) * (sal.baseSalary / 30);
    }

    const headcount = dept === "All" ? db.employeeMaster.filter((e) => e.employmentStatus === "Active").length : db.employeeMaster.filter((e) => e.employmentStatus === "Active" && e.department === dept).length;
    const totalAbsenceHours = absRows.reduce((s, a) => s + a.absenceHours, 0);
    const workingDaysInYear = year === "All" ? 260 * years.length : 260;
    const scheduledHours = Math.max(1, headcount * workingDaysInYear * 8);
    const absenceRate = (totalAbsenceHours / scheduledHours) * 100;
    const lostWorkdays = totalAbsenceHours / 8;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Leave Days Taken", value: fmtInt(totalLeaveDays), note: "approved leave, selected period" });
    kpiCard(kpiRow, { label: "Avg Annual Leave Balance", value: fmtDec(avgBalance, 1), note: `days, across ${balances.length} employees` });
    kpiCard(kpiRow, { label: "Est. Annual Leave Liability", value: fmtMoney(liability) });
    kpiCard(kpiRow, { label: "Absence Rate", value: fmtPct(absenceRate), note: "absence hours ÷ est. scheduled hours" });
    kpiCard(kpiRow, { label: "Lost Workdays", value: fmtInt(lostWorkdays), note: `${fmtInt(totalAbsenceHours)} absence hours` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const leaveByType = new Map();
    for (const l of leaveRows) leaveByType.set(l.leaveType, (leaveByType.get(l.leaveType) || 0) + l.leaveDays);
    const ltLabels = Array.from(leaveByType.keys());
    const c1 = chartCard(grid, { title: "Leave Days Taken by Type", drilldown: { records: leaveRows, matchField: "leaveType", db } });
    barChart(c1, { labels: ltLabels, datasets: [{ label: "Days", data: ltLabels.map((t) => Math.round(leaveByType.get(t))) }], showLegend: false });

    const absByType = new Map();
    for (const a of absRows) absByType.set(a.absenceType, (absByType.get(a.absenceType) || 0) + a.absenceHours);
    const atLabels = Array.from(absByType.keys());
    const c2 = chartCard(grid, { title: "Absence Hours by Type", drilldown: { records: absRows, matchField: "absenceType", db } });
    barChart(c2, { labels: atLabels, datasets: [{ label: "Hours", data: atLabels.map((t) => Math.round(absByType.get(t))) }], showLegend: false });

    const bandOrder = ["<25", "25-34", "35-44", "45-54", "55+"];
    const absByBand = new Map(bandOrder.map((b) => [b, 0]));
    for (const a of absRows) {
      const e = db.employeeIndex.get(a.employeeId);
      const band = ageBandOf(e ? e.age : null);
      if (absByBand.has(band)) absByBand.set(band, absByBand.get(band) + a.absenceHours);
    }
    const c3 = chartCard(grid, {
      title: "Absence Hours by Age Band",
      drilldown: { records: absRows, matchFn: (r, label) => ageBandOf(db.employeeIndex.get(r.employeeId)?.age) === label, db },
    });
    barChart(c3, { labels: bandOrder, datasets: [{ label: "Hours", data: bandOrder.map((b) => Math.round(absByBand.get(b))) }], showLegend: false });

    const paidCounts = { Paid: 0, Unpaid: 0 };
    for (const a of absRows) paidCounts[a.paidUnpaid] = (paidCounts[a.paidUnpaid] || 0) + a.absenceHours;
    const c4 = chartCard(grid, { title: "Absence Hours: Paid vs. Unpaid", drilldown: { records: absRows, matchField: "paidUnpaid", db } });
    barChart(c4, { labels: ["Paid", "Unpaid"], datasets: [{ label: "Hours", data: [Math.round(paidCounts.Paid), Math.round(paidCounts.Unpaid)] }], showLegend: false });
  }

  draw();
}
