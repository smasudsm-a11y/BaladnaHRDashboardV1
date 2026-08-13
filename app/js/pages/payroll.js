import { sortedUnique, sumBy, avgBy, fmtInt, fmtMoney } from "../data.js";
import { kpiCard, chartCard, tableCard, lineChart, barChart, filterSelect } from "../charts.js";

export const meta = {
  id: "payroll", label: "Payroll Report",
  subtitle: "Monthly gross salary, deductions, overtime, and air ticket cost",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WC_ORDER = ["Staff", "Labor"];
const NAT_ORDER = ["Qatari", "Non-Qatari"];

function periodLabelOf(period) {
  const d = new Date(period);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function enrich(db, row) {
  const e = db.employeeIndex.get(row.employeeId);
  return {
    ...row,
    employeeName: e?.employeeName || row.employeeId,
    department: e?.department || "Unclassified",
    division: e?.division || "Unclassified",
    workforceCategory: e?.workforceCategory || "Unclassified",
    nationality: e?.nationality || "Unknown",
    nationalityGroup: e?.nationality === "Qatari" ? "Qatari" : "Non-Qatari",
  };
}

export function render({ db, contentEl, filtersEl }) {
  const records = db.payroll.map((r) => enrich(db, r));

  const years = sortedUnique(records, (r) => r.period?.slice(0, 4)).sort();
  const divisions = sortedUnique(records, (r) => r.division).sort();

  let year = years[years.length - 1] || "All";
  let month = "All", division = "All", workforceCategory = "All";

  filterSelect(filtersEl, { label: "Year", options: ["All", ...years], value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Division", options: ["All", ...divisions], value: division, onChange: (v) => { division = v; draw(); } });
  filterSelect(filtersEl, { label: "Workforce Category", options: ["All", ...WC_ORDER], value: workforceCategory, onChange: (v) => { workforceCategory = v; draw(); } });

  function matchesDivWc(r) {
    return (division === "All" || r.division === division) && (workforceCategory === "All" || r.workforceCategory === workforceCategory);
  }
  function matchesPeriod(r) {
    return (year === "All" || r.period?.startsWith(year)) &&
      (month === "All" || Number(r.period?.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)) &&
      matchesDivWc(r);
  }
  // Trend chart: Year + Division + Workforce Category apply, Month does not
  // — a trend restricted to one month would collapse to a single point.
  function matchesTrend(r) {
    return (year === "All" || r.period?.startsWith(year)) && matchesDivWc(r);
  }
  // Workforce Category breakdown chart: ignores its own filter dimension
  // (selecting one category would otherwise collapse the chart to a single
  // bar) — same convention as every other breakdown chart in this app.
  function matchesPeriodExceptWc(r) {
    return (year === "All" || r.period?.startsWith(year)) &&
      (month === "All" || Number(r.period?.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)) &&
      (division === "All" || r.division === division);
  }

  function draw() {
    contentEl.innerHTML = "";

    const periodRows = records.filter(matchesPeriod);

    const totalGross = sumBy(periodRows, (r) => r.grossSalary);
    const totalOvertime = sumBy(periodRows, (r) => r.overtimeAmount);
    const totalDeductions = sumBy(periodRows, (r) => r.totalDeductions);
    const totalAirTicket = sumBy(periodRows, (r) => r.airTicketCost);
    const totalNetPay = sumBy(periodRows, (r) => r.netPay);
    const avgNetPay = avgBy(periodRows, (r) => r.netPay);

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Total Gross Salary", value: fmtMoney(totalGross), note: "selected period" });
    kpiCard(kpiRow, { label: "Total Overtime", value: fmtMoney(totalOvertime), note: "selected period" });
    kpiCard(kpiRow, { label: "Total Deductions", value: fmtMoney(totalDeductions), note: "selected period" });
    kpiCard(kpiRow, { label: "Total Air Ticket Cost", value: fmtMoney(totalAirTicket), note: "selected period" });
    kpiCard(kpiRow, { label: "Total Net Pay", value: fmtMoney(totalNetPay), note: "selected period" });
    kpiCard(kpiRow, { label: "Avg Net Pay / Employee", value: fmtMoney(avgNetPay), note: `${fmtInt(periodRows.length)} employee-months` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    // Chart 1: monthly cost trend
    const trendRows = records.filter(matchesTrend);
    const periods = sortedUnique(trendRows, (r) => r.period).sort();
    const grossByPeriod = periods.map((p) => sumBy(trendRows.filter((r) => r.period === p), (r) => r.grossSalary));
    const overtimeByPeriod = periods.map((p) => sumBy(trendRows.filter((r) => r.period === p), (r) => r.overtimeAmount));
    const deductionsByPeriod = periods.map((p) => sumBy(trendRows.filter((r) => r.period === p), (r) => r.totalDeductions));
    const airTicketByPeriod = periods.map((p) => sumBy(trendRows.filter((r) => r.period === p), (r) => r.airTicketCost));
    const c1 = chartCard(grid, { title: "Payroll Cost Trend", sub: `Monthly, ${year === "All" ? "trailing history" : year}` });
    lineChart(c1, { labels: periods.map(periodLabelOf), datasets: [
      { label: "Gross Salary", data: grossByPeriod.map(Math.round) },
      { label: "Overtime", data: overtimeByPeriod.map(Math.round) },
      { label: "Deductions", data: deductionsByPeriod.map(Math.round) },
      { label: "Air Ticket Cost", data: airTicketByPeriod.map(Math.round) },
    ] });

    // Chart 2: Net Pay by Department, selected period
    const deptOrder = sortedUnique(periodRows, (r) => r.department).sort();
    const netByDept = deptOrder.map((d) => sumBy(periodRows.filter((r) => r.department === d), (r) => r.netPay));
    const c2 = chartCard(grid, {
      title: "Payroll Cost by Department", sub: "Net pay, selected period",
      drilldown: { records: periodRows, matchField: "department", db },
    });
    barChart(c2, { labels: deptOrder, datasets: [{ label: "Net Pay", data: netByDept.map(Math.round) }], showLegend: false });

    // Chart 3: Overtime by Workforce Category
    const wcRows = records.filter(matchesPeriodExceptWc);
    const overtimeByWc = WC_ORDER.map((w) => sumBy(wcRows.filter((r) => r.workforceCategory === w), (r) => r.overtimeAmount));
    const c3 = chartCard(grid, {
      title: "Overtime by Workforce Category", sub: "Selected period",
      drilldown: { records: wcRows, matchField: "workforceCategory", db },
    });
    barChart(c3, { labels: WC_ORDER, datasets: [{ label: "Overtime", data: overtimeByWc.map(Math.round) }], showLegend: false });

    // Chart 4: Air Ticket Cost by Nationality Group
    const airTicketByNat = NAT_ORDER.map((n) => sumBy(periodRows.filter((r) => r.nationalityGroup === n), (r) => r.airTicketCost));
    const c4 = chartCard(grid, {
      title: "Air Ticket Cost by Nationality Group", sub: "Selected period",
      drilldown: { records: periodRows, matchField: "nationalityGroup", db },
    });
    barChart(c4, { labels: NAT_ORDER, datasets: [{ label: "Air Ticket Cost", data: airTicketByNat.map(Math.round) }], showLegend: false });

    // Breakdown table: Department x metric, selected period
    const deptBreakdown = deptOrder.map((d) => {
      const rows = periodRows.filter((r) => r.department === d);
      return {
        department: d,
        grossSalary: sumBy(rows, (r) => r.grossSalary),
        overtimeAmount: sumBy(rows, (r) => r.overtimeAmount),
        totalDeductions: sumBy(rows, (r) => r.totalDeductions),
        airTicketCost: sumBy(rows, (r) => r.airTicketCost),
        netPay: sumBy(rows, (r) => r.netPay),
      };
    });
    tableCard(contentEl, {
      title: "Payroll Breakdown by Department",
      sub: `Selected period (${year === "All" ? "all years" : year}${month === "All" ? "" : `, ${month}`})`,
      columns: [
        { key: "department", label: "Department" },
        { key: "grossSalary", label: "Gross Salary", num: true, fmt: fmtMoney },
        { key: "overtimeAmount", label: "Overtime", num: true, fmt: fmtMoney },
        { key: "totalDeductions", label: "Deductions", num: true, fmt: fmtMoney },
        { key: "airTicketCost", label: "Air Ticket Cost", num: true, fmt: fmtMoney },
        { key: "netPay", label: "Net Pay", num: true, fmt: fmtMoney },
      ],
      rows: deptBreakdown,
    });
  }

  draw();
}
