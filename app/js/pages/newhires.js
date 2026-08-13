import { sortedUnique, monthLabel, daysBetween, fmtInt, fmtPct, REFERENCE_TODAY } from "../data.js";
import { kpiCard, chartCard, barChart, doughnutChart, filterSelect, tableCard } from "../charts.js";

export const meta = { id: "newhires", label: "New Hires & Onboarding", subtitle: "Who joined, and how they're distributed in their first year" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthsSince(dateStr) {
  return daysBetween(dateStr, REFERENCE_TODAY) / 30.44;
}

export function render({ db, contentEl, filtersEl }) {
  const years = ["All", ...sortedUnique(db.employeeMaster, (e) => e.hireDate?.slice(0, 4)).sort()];
  const depts = ["All", ...sortedUnique(db.employeeMaster, (e) => e.department)];
  let year = "All", month = "All", dept = "All";
  filterSelect(filtersEl, { label: "Hire Year", options: years, value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Hire Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: depts, value: dept, onChange: (v) => { dept = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";
    // KPIs and breakdown charts: Hire Year + Hire Month + Department all apply.
    const starters = db.employeeMaster.filter((e) => e.hireDate &&
      (year === "All" || e.hireDate.startsWith(year)) &&
      (month === "All" || Number(e.hireDate.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)) &&
      (dept === "All" || e.department === dept));
    // Trend chart: Year + Department apply, but not Month — a trend restricted
    // to one month would collapse to a single point.
    const trendStarters = db.employeeMaster.filter((e) => e.hireDate &&
      (year === "All" || e.hireDate.startsWith(year)) && (dept === "All" || e.department === dept));

    const female = starters.filter((e) => e.gender === "Female").length;
    const retained6 = eligible(starters, 6);
    const retained12 = eligible(starters, 12);

    // Starting salary vs. grade midpoint at hire (not current salary — that's
    // what compensation.js's Compa-Ratio already covers). Only counts starters
    // with a base_salary row on/near their hire date and a matching grade in
    // salary_structure; starters missing either are excluded, not counted as "below."
    const withHireSalary = starters
      .map((e) => {
        const sal = db.earliestBaseSalary.get(e.employeeId);
        const struct = sal ? db.salaryStructureIndex.get(sal.grade) : null;
        return struct ? sal.baseSalary > struct.salaryMidpoint : null;
      })
      .filter((v) => v !== null);
    const aboveMid = withHireSalary.filter(Boolean).length;

    function eligible(rows, milestone) {
      const pool = rows.filter((e) => monthsSince(e.hireDate) >= milestone);
      if (!pool.length) return null;
      const stillIn = pool.filter((e) => {
        if (!e.terminationDate) return true;
        return daysBetween(e.hireDate, e.terminationDate) / 30.44 >= milestone;
      }).length;
      return { pct: (stillIn / pool.length) * 100, n: pool.length };
    }

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "New Starters", value: fmtInt(starters.length), note: year === "All" ? "all years" : year });
    kpiCard(kpiRow, { label: "% Female New Starters", value: starters.length ? fmtPct((female / starters.length) * 100) : "—" });
    kpiCard(kpiRow, { label: "Retention @ 6mo", value: retained6 ? fmtPct(retained6.pct) : "n/a", note: retained6 ? `of ${retained6.n} eligible starters` : "no starters old enough yet" });
    kpiCard(kpiRow, { label: "Retention @ 12mo", value: retained12 ? fmtPct(retained12.pct) : "n/a", note: retained12 ? `of ${retained12.n} eligible starters` : "no starters old enough yet" });
    kpiCard(kpiRow, { label: "Hires Above Mid %", value: withHireSalary.length ? fmtPct((aboveMid / withHireSalary.length) * 100) : "n/a", note: withHireSalary.length ? `${aboveMid} of ${withHireSalary.length} started above grade midpoint` : "no starting-salary data available" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const months = sortedUnique(trendStarters, (e) => e.hireDate.slice(0, 7)).sort();
    const series = months.map((ym) => trendStarters.filter((e) => e.hireDate.slice(0, 7) === ym).length);
    const c1 = chartCard(grid, { title: "New Starters Trend", sub: "By hire month" });
    barChart(c1, { labels: months.map(monthLabel), datasets: [{ label: "New Starters", data: series }], showLegend: false });

    const levelOrder = ["Staff", "Supervisory", "Managerial", "Executive"];
    const byLevel = new Map(levelOrder.map((l) => [l, 0]));
    for (const e of starters) if (byLevel.has(e.jobLevel)) byLevel.set(e.jobLevel, byLevel.get(e.jobLevel) + 1);
    const c2 = chartCard(grid, { title: "New Starters by Job Level", drilldown: { records: starters, matchField: "jobLevel", db } });
    barChart(c2, { labels: levelOrder, datasets: [{ label: "New Starters", data: levelOrder.map((l) => byLevel.get(l)) }], showLegend: false });

    const c3 = chartCard(grid, { title: "New Starters by Gender", drilldown: { records: starters, matchField: "gender", db } });
    doughnutChart(c3, { labels: ["Male", "Female"], data: [starters.length - female, female] });

    const managerRows = starters.filter((e) => e.jobLevel === "Managerial" || e.jobLevel === "Executive" || e.jobLevel === "Supervisory");
    const nonManagerRows = starters.filter((e) => !(e.jobLevel === "Managerial" || e.jobLevel === "Executive" || e.jobLevel === "Supervisory"));
    const r6m = eligible(managerRows, 6), r6n = eligible(nonManagerRows, 6);
    const r12m = eligible(managerRows, 12), r12n = eligible(nonManagerRows, 12);
    const fmt = (r) => (r ? `${r.pct.toFixed(0)}% (n=${r.n})` : "n/a");
    tableCard(grid, {
      title: "Retention 4-Box",
      sub: "Manager vs. non-manager, by tenure milestone",
      columns: [{ key: "band", label: "Tenure Band" }, { key: "mgr", label: "Manager/Supervisor" }, { key: "nonmgr", label: "Individual Contributor" }],
      rows: [{ band: "0–6 months", mgr: fmt(r6m), nonmgr: fmt(r6n) }, { band: "6–12 months", mgr: fmt(r12m), nonmgr: fmt(r12n) }],
    });
  }

  draw();
}
