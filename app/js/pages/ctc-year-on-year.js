import { sortedUnique, fmtMoney } from "../data.js";
import { kpiCard, chartCard, lineChart, filterSelect } from "../charts.js";

export const meta = {
  id: "ctc-yoy", section: "ctc", sectionLabel: "CTC Report",
  label: "CTC Year on Year",
  subtitle: "Monthly cost-to-company trend across years",
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function enrich(db, row) {
  const cc = db.costCenterIndex.get(row.costCenter);
  return { ...row, division: cc?.division || "Unclassified", department: cc?.department || "Unclassified" };
}

function sumAmount(rows) {
  return rows.reduce((s, r) => s + (r.amount || 0), 0);
}

export function render({ db, contentEl, filtersEl }) {
  const actuals = db.ctcActuals.map((r) => enrich(db, r));
  const budget = db.ctcBudget.map((r) => enrich(db, r));

  const divisions = sortedUnique(db.costCenters, (c) => c.division).sort();
  const departments = sortedUnique(db.costCenters, (c) => c.department).sort();

  let division = "All", department = "All", scenario = "actual";

  filterSelect(filtersEl, { label: "Division", options: ["All", ...divisions], value: division, onChange: (v) => { division = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: ["All", ...departments], value: department, onChange: (v) => { department = v; draw(); } });
  filterSelect(filtersEl, { label: "Scenario", options: [{ value: "actual", label: "Actual" }, { value: "budget", label: "Budget" }], value: scenario, onChange: (v) => { scenario = v; draw(); } });

  function matchesDivDept(r) {
    return (division === "All" || r.division === division) && (department === "All" || r.department === department);
  }

  function draw() {
    contentEl.innerHTML = "";

    const source = (scenario === "budget" ? budget : actuals).filter(matchesDivDept);
    const years = sortedUnique(source, (r) => r.period?.slice(0, 4)).sort();

    const thisYear = years[years.length - 1];
    const lastYear = years[years.length - 2];
    const thisYearMonths = sortedUnique(source.filter((r) => r.period?.startsWith(thisYear)), (r) => r.period?.slice(5, 7));
    const thisYearTotal = sumAmount(source.filter((r) => r.period?.startsWith(thisYear)));
    const lastYearTotal = lastYear ? sumAmount(source.filter((r) => r.period?.startsWith(lastYear))) : null;
    // YoY % compares the SAME months in both years, not this-year-to-date vs
    // last year's full year — otherwise a partial current year always looks
    // like a huge decline purely from having fewer months of data.
    const lastYearToDateTotal = lastYear
      ? sumAmount(source.filter((r) => r.period?.startsWith(lastYear) && thisYearMonths.includes(r.period?.slice(5, 7))))
      : null;
    const yoyPct = lastYearToDateTotal ? ((thisYearTotal - lastYearToDateTotal) / lastYearToDateTotal) * 100 : null;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: `${thisYear} CTC (to date)`, value: fmtMoney(thisYearTotal), note: scenario === "budget" ? "Budget" : "Actual" });
    if (lastYear) kpiCard(kpiRow, { label: `${lastYear} CTC (full year)`, value: fmtMoney(lastYearTotal), note: scenario === "budget" ? "Budget" : "Actual" });
    if (yoyPct !== null) {
      kpiCard(kpiRow, {
        label: "Year-over-Year Change", value: `${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)}%`,
        note: `${thisYear} vs ${lastYear}, same ${thisYearMonths.length} months`, deltaKind: yoyPct > 0 ? "warn" : "good",
      });
    }

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    // Chart 1: monthly overlay, one line per year
    const c1 = chartCard(grid, { title: "CTC by Month, Overlaid by Year", sub: scenario === "budget" ? "Budget" : "Actual" });
    const overlayDatasets = years.map((y) => ({
      label: y,
      data: MONTH_LABELS.map((_, i) => {
        const p = `${y}-${String(i + 1).padStart(2, "0")}-01`;
        const rows = source.filter((r) => r.period === p);
        return rows.length ? Math.round(sumAmount(rows)) : null;
      }),
    }));
    lineChart(c1, { labels: MONTH_LABELS, datasets: overlayDatasets });

    // Chart 2: one continuous multi-year timeline
    const allPeriods = sortedUnique(source, (r) => r.period).sort();
    const timelineData = allPeriods.map((p) => Math.round(sumAmount(source.filter((r) => r.period === p))));
    const timelineLabels = allPeriods.map((p) => new Date(p).toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
    const c2 = chartCard(grid, { title: "CTC Trend, Continuous", sub: `${years[0] || ""}–${thisYear || ""}` });
    lineChart(c2, { labels: timelineLabels, datasets: [{ label: scenario === "budget" ? "Budget CTC" : "Actual CTC", data: timelineData }], showLegend: false });
  }

  draw();
}
