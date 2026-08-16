import { sortedUnique, lastNMonths, monthEnd, monthLabel, isActiveAsOf, daysBetween, REFERENCE_TODAY, targetDelta, fmtInt, fmtDec, fmtPct, fmtMoney } from "../data.js";
import { kpiCard, chartCard, barChart, lineChart, filterSelect } from "../charts.js";

export const meta = { id: "leave", label: "Leave & Absence", subtitle: "Leave utilization, liability, and absenteeism" };

function ageBandOf(age) {
  if (age == null) return "Unknown";
  if (age < 25) return "<25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const inMonth = (dateStr, month) => month === "All" || Number(dateStr?.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month);

export function render({ db, contentEl, filtersEl }) {
  const realYears = sortedUnique(db.leave, (l) => l.leaveStartDate?.slice(0, 4)).sort();
  const years = ["All", ...realYears];
  const bus = ["All", ...sortedUnique(db.leave, (l) => l.department)];
  let year = "All", month = "All", dept = "All";

  filterSelect(filtersEl, { label: "Year", options: years, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: bus, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    const leaveRows = db.leave.filter((l) => (year === "All" || l.leaveStartDate?.startsWith(year)) && inMonth(l.leaveStartDate, month) && (dept === "All" || l.department === dept) && l.leaveStatus === "Approved");
    const absRows = db.absenteeism.filter((a) => (year === "All" || a.absenceDate?.startsWith(year)) && inMonth(a.absenceDate, month) && (dept === "All" || a.department === dept));

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

    const totalAbsenceHours = absRows.reduce((s, a) => s + a.absenceHours, 0);
    const unapprovedAbsences = absRows.filter((a) => a.approvalStatus === "Unapproved").length;
    const yearsCount = year === "All" ? Math.max(1, realYears.length) : 1;
    const workingDaysInPeriod = (month === "All" ? 260 : 260 / 12) * yearsCount;
    const lostWorkdays = totalAbsenceHours / 8;

    // Split by workforce_category (Staff = white-collar/management tier, Labor =
    // frontline/individual-contributor tier — see 14_workforce_category.sql),
    // same framing as Power BI's separate Staff/Labor absenteeism KPIs.
    const activeForRate = db.employeeMaster.filter((e) => e.employmentStatus === "Active" && (dept === "All" || e.department === dept));
    function absenceRateFor(category) {
      const hc = activeForRate.filter((e) => e.workforceCategory === category).length;
      const hours = absRows.filter((a) => db.employeeIndex.get(a.employeeId)?.workforceCategory === category).reduce((s, a) => s + a.absenceHours, 0);
      const scheduled = Math.max(1, hc * workingDaysInPeriod * 8);
      return (hours / scheduled) * 100;
    }
    const absenceRateStaff = absenceRateFor("Staff");
    const absenceRateLabor = absenceRateFor("Labor");

    // "Total Working Days" = active headcount x est. scheduled working days in the
    // selected period (the same 260-days/year assumption already used above for
    // the absenteeism rate denominator, just expressed as a company-wide total
    // rather than a per-employee figure). "Days till YTD" = calendar days elapsed
    // from Jan 1 of the effective year through the selected month (or through
    // REFERENCE_TODAY if no month is selected) — how far into the year this
    // period's numbers reach.
    const totalWorkingDays = activeForRate.length * workingDaysInPeriod;
    const effectiveYear = year !== "All" ? year : REFERENCE_TODAY.slice(0, 4);
    const ytdCutoff = month !== "All" ? monthEnd(`${effectiveYear}-${String(MONTH_NAMES.indexOf(month) + 1).padStart(2, "0")}`) : REFERENCE_TODAY;
    const daysTillYTD = Math.max(0, Math.round(daysBetween(`${effectiveYear}-01-01`, ytdCutoff)));

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Leave Days Taken", value: fmtInt(totalLeaveDays), note: "approved leave, selected period" });
    kpiCard(kpiRow, { label: "Avg Annual Leave Balance", value: fmtDec(avgBalance, 1), note: `days, across ${balances.length} employees` });
    kpiCard(kpiRow, { label: "Est. Annual Leave Liability", value: fmtMoney(liability) });
    kpiCard(kpiRow, { label: "Absenteeism Rate — Staff", value: fmtPct(absenceRateStaff), note: "absence hours ÷ est. scheduled hours", ...targetDelta(db, "absenteeism_rate_staff", absenceRateStaff) });
    kpiCard(kpiRow, { label: "Absenteeism Rate — Labor", value: fmtPct(absenceRateLabor), note: "absence hours ÷ est. scheduled hours", ...targetDelta(db, "absenteeism_rate_labor", absenceRateLabor) });
    kpiCard(kpiRow, { label: "Lost Workdays", value: fmtInt(lostWorkdays), note: `${fmtInt(totalAbsenceHours)} absence hours` });
    kpiCard(kpiRow, { label: "Unapproved Absences", value: fmtInt(unapprovedAbsences), note: `of ${fmtInt(absRows.length)} total absence records`, deltaKind: unapprovedAbsences > 0 ? "warn" : "good" });
    kpiCard(kpiRow, { label: "Total Working Days", value: fmtInt(totalWorkingDays), note: "active headcount × est. scheduled days" });
    kpiCard(kpiRow, { label: "Days till YTD", value: fmtInt(daysTillYTD), note: `${effectiveYear}, through ${month === "All" ? "today" : month}` });

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

    // Monthly trend, trailing 12 months — Department applies (same dimension as
    // the rest of this page), Year/Month don't (a 12-month trend needs all 12
    // months regardless of the period filter, same convention as every other
    // trend chart in this app).
    const months = lastNMonths(12);
    function monthlyRateFor(category, ym) {
      const monthEndDate = monthEnd(ym);
      const hc = db.employeeMaster.filter((e) => isActiveAsOf(e, monthEndDate) && e.workforceCategory === category && (dept === "All" || e.department === dept)).length;
      const hours = db.absenteeism
        .filter((a) => a.absenceDate?.startsWith(ym) && (dept === "All" || a.department === dept) && db.employeeIndex.get(a.employeeId)?.workforceCategory === category)
        .reduce((s, a) => s + a.absenceHours, 0);
      const scheduled = Math.max(1, hc * (260 / 12) * 8);
      return (hours / scheduled) * 100;
    }
    const staffTrend = months.map((ym) => monthlyRateFor("Staff", ym));
    const laborTrend = months.map((ym) => monthlyRateFor("Labor", ym));
    const c5 = chartCard(grid, { title: "Absenteeism % Trend", sub: "Monthly, Staff vs. Labor, trailing 12 months" });
    lineChart(c5, { labels: months.map(monthLabel), datasets: [
      { label: "Staff", data: staffTrend.map((v) => Math.round(v * 100) / 100) },
      { label: "Labor", data: laborTrend.map((v) => Math.round(v * 100) / 100) },
    ] });
  }

  draw();
}
