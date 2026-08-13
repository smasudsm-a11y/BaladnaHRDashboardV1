import { sortedUnique, sortGrades, monthLabel, daysBetween, avgBy, fmtInt, fmtDec, fmtPct, fmtMoney } from "../data.js";
import { kpiCard, chartCard, lineChart, barChart, doughnutChart, filterSelect } from "../charts.js";

export const meta = { id: "recruitment", label: "Recruitment", subtitle: "Requisition-to-hire funnel, cost, and source effectiveness" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function render({ db, contentEl, filtersEl }) {
  const years = ["All", ...sortedUnique(db.recruitment, (r) => r.requisitionOpenDate?.slice(0, 4)).sort()];
  const depts = ["All", ...sortedUnique(db.recruitment, (r) => r.department)];
  let year = "All", month = "All", dept = "All";

  filterSelect(filtersEl, { label: "Year", options: years, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    // KPIs and breakdown charts: Year + Month + Department all apply.
    const rows = db.recruitment.filter((r) =>
      (year === "All" || r.requisitionOpenDate?.startsWith(year)) &&
      (month === "All" || Number(r.requisitionOpenDate?.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)) &&
      (dept === "All" || r.department === dept)
    );
    // Monthly trend chart: Year + Department apply, but not Month — a trend
    // restricted to one month would collapse to a single point.
    const trendRows = db.recruitment.filter((r) =>
      (year === "All" || r.requisitionOpenDate?.startsWith(year)) && (dept === "All" || r.department === dept)
    );

    const withOffer = rows.filter((r) => r.offerDate);
    const withJoin = rows.filter((r) => r.joiningDate);
    const tto = avgBy(withOffer, (r) => daysBetween(r.requisitionOpenDate, r.offerDate));
    const tth = avgBy(withJoin.filter((r) => r.interviewDate), (r) => daysBetween(r.interviewDate, r.joiningDate));
    const acceptanceRate = withOffer.length ? (withJoin.length / withOffer.length) * 100 : 0;
    const totalCost = rows.reduce((s, r) => s + (r.recruitmentCost || 0), 0);
    const openReqs = rows.filter((r) => !r.requisitionCloseDate).length;
    const filledReqs = rows.length - openReqs;
    // Proxy definition (no separate "approved positions" concept in this data
    // model): open requisitions as a share of active headcount + open requisitions.
    const activeHC = db.employeeMaster.filter((e) => e.employmentStatus === "Active" && (dept === "All" || e.department === dept)).length;
    const vacancyRate = (activeHC + openReqs) ? (openReqs / (activeHC + openReqs)) * 100 : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Time to Offer", value: `${fmtDec(tto, 0)} days`, note: "requisition open → offer extended" });
    kpiCard(kpiRow, { label: "Time to Hire", value: `${fmtDec(tth, 0)} days`, note: "interview → joining date" });
    kpiCard(kpiRow, { label: "Offer Acceptance Rate", value: fmtPct(acceptanceRate), note: `${withJoin.length} joined of ${withOffer.length} offers` });
    kpiCard(kpiRow, { label: "Recruitment Cost", value: fmtMoney(totalCost), note: `${fmtMoney(rows.length ? totalCost / rows.length : 0)} avg / requisition` });
    kpiCard(kpiRow, { label: "Requisitions", value: fmtInt(rows.length), note: `${openReqs} open · ${filledReqs} filled` });
    kpiCard(kpiRow, { label: "Vacancy Rate", value: fmtPct(vacancyRate), note: "open requisitions ÷ (active headcount + open requisitions)" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const trendWithOffer = trendRows.filter((r) => r.offerDate);
    const trendWithJoin = trendRows.filter((r) => r.joiningDate);
    const months = sortedUnique(trendRows, (r) => r.requisitionOpenDate?.slice(0, 7)).sort();
    const ttoSeries = months.map((ym) => avgBy(trendWithOffer.filter((r) => r.requisitionOpenDate?.slice(0, 7) === ym), (r) => daysBetween(r.requisitionOpenDate, r.offerDate)));
    const tthSeries = months.map((ym) => avgBy(trendWithJoin.filter((r) => r.interviewDate && r.requisitionOpenDate?.slice(0, 7) === ym), (r) => daysBetween(r.interviewDate, r.joiningDate)));
    const c1 = chartCard(grid, { title: "Time to Offer / Time to Hire", sub: "Average days, by requisition open month" });
    lineChart(c1, { labels: months.map(monthLabel), datasets: [{ label: "Time to Offer", data: ttoSeries.map((v) => Math.round(v)) }, { label: "Time to Hire", data: tthSeries.map((v) => Math.round(v)) }] });

    const bySource = new Map();
    for (const r of withJoin) bySource.set(r.sourceOfHire, (bySource.get(r.sourceOfHire) || 0) + 1);
    const srcLabels = Array.from(bySource.keys()).sort((a, b) => bySource.get(b) - bySource.get(a));
    const c2 = chartCard(grid, { title: "Source Effectiveness", sub: "Hires by source of hire", drilldown: { records: withJoin, matchField: "sourceOfHire", db } });
    barChart(c2, { labels: srcLabels, datasets: [{ label: "Hires", data: srcLabels.map((s) => bySource.get(s)) }], horizontal: true, showLegend: false });

    const byGrade = new Map();
    for (const r of rows) byGrade.set(r.jobGrade, (byGrade.get(r.jobGrade) || 0) + 1);
    const gradeLabels = sortGrades(Array.from(byGrade.keys()));
    const c3 = chartCard(grid, { title: "Requisitions by Job Grade", drilldown: { records: rows, matchField: "jobGrade", db } });
    barChart(c3, { labels: gradeLabels, datasets: [{ label: "Requisitions", data: gradeLabels.map((g) => byGrade.get(g)) }], showLegend: false });

    const female = withJoin.filter((r) => r.candidateGender === "Female").length;
    const male = withJoin.length - female;
    const c4 = chartCard(grid, { title: "New Hires by Gender", drilldown: { records: withJoin, matchField: "candidateGender", db } });
    doughnutChart(c4, { labels: ["Male", "Female"], data: [male, female] });
  }

  draw();
}
