import { sortedUnique, fmtMoney, fmtPct } from "../data.js";
import { kpiCard, chartCard, lineChart, barChart, filterSelect } from "../charts.js";

export const meta = {
  id: "ctc-budget-actual", section: "ctc", sectionLabel: "CTC Report",
  label: "Budget vs Actual CTC",
  subtitle: "Monthly cost-to-company: budget vs. actual, by division and department",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function enrich(db, row) {
  const cc = db.costCenterIndex.get(row.costCenter);
  return { ...row, division: cc?.division || "Unclassified", department: cc?.department || "Unclassified" };
}

function periodLabelOf(period) {
  const d = new Date(period);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function sumAmount(rows) {
  return rows.reduce((s, r) => s + (r.amount || 0), 0);
}

const MATRIX_METRICS = [
  { key: "budgetCTC", label: "Budget CTC" },
  { key: "actualCTC", label: "Actual CTC" },
  { key: "diff", label: "CTC Diff" },
  { key: "diffPct", label: "CC Diff %", pct: true },
];

function withDiffs(months) {
  return months.map((m) => ({ ...m, diff: m.budgetCTC - m.actualCTC, diffPct: m.budgetCTC ? ((m.budgetCTC - m.actualCTC) / m.budgetCTC) * 100 : 0 }));
}

function sumMonths(rowsList) {
  const months = Array.from({ length: 12 }, () => ({ budgetCTC: 0, actualCTC: 0 }));
  for (const row of rowsList) row.months.forEach((m, i) => { months[i].budgetCTC += m.budgetCTC; months[i].actualCTC += m.actualCTC; });
  return withDiffs(months);
}

// One row per Division/Department/Cost Center, each holding a 12-slot months
// array — the leaf level the matrix's Division/Department rows aggregate up from.
function buildMatrixCCRows(actualRows, budgetRows, effectiveYear) {
  const keyOf = (r) => `${r.division}||${r.department}||${r.costCenter}`;
  const buckets = new Map();
  function ensure(key) {
    if (!buckets.has(key)) buckets.set(key, Array.from({ length: 12 }, () => ({ budgetCTC: 0, actualCTC: 0 })));
    return buckets.get(key);
  }
  for (const r of budgetRows) {
    if (!r.period?.startsWith(effectiveYear)) continue;
    ensure(keyOf(r))[Number(r.period.slice(5, 7)) - 1].budgetCTC += r.amount || 0;
  }
  for (const r of actualRows) {
    if (!r.period?.startsWith(effectiveYear)) continue;
    ensure(keyOf(r))[Number(r.period.slice(5, 7)) - 1].actualCTC += r.amount || 0;
  }
  const ccRows = Array.from(buckets.entries()).map(([key, months]) => {
    const [division, department, costCenter] = key.split("||");
    return { division, department, costCenter, months: withDiffs(months) };
  });
  ccRows.sort((x, y) => x.division.localeCompare(y.division) || x.department.localeCompare(y.department) || x.costCenter.localeCompare(y.costCenter));
  return ccRows;
}

// Division -> Department -> [costCenter rows], preserving sorted order.
function groupMatrixTree(ccRows) {
  const tree = new Map();
  for (const row of ccRows) {
    if (!tree.has(row.division)) tree.set(row.division, new Map());
    const depts = tree.get(row.division);
    if (!depts.has(row.department)) depts.set(row.department, []);
    depts.get(row.department).push(row);
  }
  return tree;
}

function matrixMetricCells(months) {
  return months.flatMap((m) => MATRIX_METRICS.map((c, ci) =>
    `<td class="num${ci === 0 ? " month-start" : ""}">${c.pct ? fmtPct(m[c.key]) : fmtMoney(m[c.key])}</td>`
  )).join("");
}

function buildMatrixTable(ccRows) {
  const tree = groupMatrixTree(ccRows);

  const theadRow1 = `<th class="row-label-head">Month</th>` +
    MONTH_NAMES.map((name) => `<th class="month-group-head month-start" colspan="${MATRIX_METRICS.length}">${name}</th>`).join("");
  const theadRow2 = `<th class="row-label-head">Division</th>` +
    MONTH_NAMES.flatMap(() => MATRIX_METRICS.map((c, ci) => `<th class="num${ci === 0 ? " month-start" : ""}">${c.label}</th>`)).join("");

  const bodyRows = [];
  for (const [division, depts] of tree) {
    const divCCRows = Array.from(depts.values()).flat();
    bodyRows.push(`<tr class="row-division" data-division="${division}">
      <td class="row-label"><button class="row-expand-toggle" data-toggle="division" data-division="${division}">+</button>${division}</td>
      ${matrixMetricCells(sumMonths(divCCRows))}
    </tr>`);
    for (const [department, ccList] of depts) {
      bodyRows.push(`<tr class="row-department row-hidden" data-division="${division}" data-department="${department}">
        <td class="row-label"><button class="row-expand-toggle" data-toggle="department" data-division="${division}" data-department="${department}">+</button>${department}</td>
        ${matrixMetricCells(sumMonths(ccList))}
      </tr>`);
      for (const cc of ccList) {
        bodyRows.push(`<tr class="row-costcenter row-hidden" data-division="${division}" data-department="${department}">
          <td class="row-label"><span class="row-label-spacer"></span>${cc.costCenter}</td>
          ${matrixMetricCells(cc.months)}
        </tr>`);
      }
    }
  }
  bodyRows.push(`<tr class="row-total">
    <td class="row-label">Total</td>
    ${matrixMetricCells(sumMonths(ccRows))}
  </tr>`);

  const table = document.createElement("table");
  table.className = "data-table matrix-table";
  table.innerHTML = `<thead><tr>${theadRow1}</tr><tr>${theadRow2}</tr></thead><tbody>${bodyRows.join("")}</tbody>`;

  table.querySelectorAll(".row-expand-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const willExpand = btn.textContent === "+";
      btn.textContent = willExpand ? "−" : "+";
      const { toggle, division, department } = btn.dataset;
      if (toggle === "division") {
        table.querySelectorAll(`tr.row-department[data-division="${division}"]`).forEach((tr) => tr.classList.toggle("row-hidden", !willExpand));
        if (!willExpand) {
          table.querySelectorAll(`tr.row-costcenter[data-division="${division}"]`).forEach((tr) => tr.classList.add("row-hidden"));
          table.querySelectorAll(`.row-expand-toggle[data-toggle="department"][data-division="${division}"]`).forEach((b) => { b.textContent = "+"; });
        }
      } else {
        table.querySelectorAll(`tr.row-costcenter[data-division="${division}"][data-department="${department}"]`).forEach((tr) => tr.classList.toggle("row-hidden", !willExpand));
      }
    });
  });

  return table;
}

export function render({ db, contentEl, filtersEl }) {
  const actuals = db.ctcActuals.map((r) => enrich(db, r));
  const budget = db.ctcBudget.map((r) => enrich(db, r));

  const years = sortedUnique(actuals.concat(budget), (r) => r.period?.slice(0, 4)).sort();
  const divisions = sortedUnique(db.costCenters, (c) => c.division).sort();
  const departments = sortedUnique(db.costCenters, (c) => c.department).sort();

  // Budget only exists for 2026 (see CLAUDE.md CTC Report gotcha) — defaulting
  // to "All" would compare a 2026-only Budget total against a 2024-2026
  // Actual total, producing a nonsensical Diff. Default to the latest year
  // Budget actually covers instead; "All" is still selectable manually.
  const budgetYears = sortedUnique(budget, (r) => r.period?.slice(0, 4)).sort();
  let year = budgetYears[budgetYears.length - 1] || "All";
  let month = "All", division = "All", department = "All";

  filterSelect(filtersEl, { label: "Year", options: ["All", ...years], value: year, onChange: (v) => { year = v; draw(); } });
  filterSelect(filtersEl, { label: "Month", options: ["All", ...MONTH_NAMES], value: month, onChange: (v) => { month = v; draw(); } });
  filterSelect(filtersEl, { label: "Division", options: ["All", ...divisions], value: division, onChange: (v) => { division = v; draw(); } });
  filterSelect(filtersEl, { label: "Department", options: ["All", ...departments], value: department, onChange: (v) => { department = v; draw(); } });

  function matchesDivDept(r) {
    return (division === "All" || r.division === division) && (department === "All" || r.department === department);
  }
  function matchesPeriod(r) {
    return (year === "All" || r.period?.startsWith(year)) &&
      (month === "All" || Number(r.period?.slice(5, 7)) - 1 === MONTH_NAMES.indexOf(month)) &&
      matchesDivDept(r);
  }
  // Trend charts: Year + Division + Department apply, Month does not — a
  // trend restricted to one month would collapse to a single point.
  function matchesTrend(r) {
    return (year === "All" || r.period?.startsWith(year)) && matchesDivDept(r);
  }

  function draw() {
    contentEl.innerHTML = "";

    const periodActuals = actuals.filter(matchesPeriod);
    const periodBudget = budget.filter(matchesPeriod);
    const actualCTC = sumAmount(periodActuals);
    const budgetCTC = sumAmount(periodBudget);
    const diff = budgetCTC - actualCTC;
    const diffPct = budgetCTC ? (diff / budgetCTC) * 100 : 0;

    const effectiveYear = year !== "All" ? year : (years[years.length - 1] || "");
    const yearActualPeriods = sortedUnique(actuals.filter((r) => r.period?.startsWith(effectiveYear)), (r) => r.period).sort();
    const latestActualMonthIdx = yearActualPeriods.length ? Number(yearActualPeriods[yearActualPeriods.length - 1].slice(5, 7)) - 1 : 0;
    const ytdCutoffIdx = month !== "All" ? MONTH_NAMES.indexOf(month) : latestActualMonthIdx;

    function ytdFilter(r) {
      return r.period?.startsWith(effectiveYear) && matchesDivDept(r) && Number(r.period.slice(5, 7)) - 1 <= ytdCutoffIdx;
    }
    const ytdActualCTC = sumAmount(actuals.filter(ytdFilter));
    const ytdBudgetCTC = sumAmount(budget.filter(ytdFilter));

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Budget CTC", value: fmtMoney(budgetCTC), note: "selected period" });
    kpiCard(kpiRow, { label: "Actual CTC", value: fmtMoney(actualCTC), note: "selected period" });
    kpiCard(kpiRow, {
      label: "CTC Diff", value: fmtMoney(diff), note: `${fmtPct(diffPct)} of budget`,
      deltaKind: diff < 0 ? "bad" : diff > 0 ? "good" : null,
    });
    kpiCard(kpiRow, { label: "YTD Budget CTC", value: fmtMoney(ytdBudgetCTC), note: `${effectiveYear}, through ${MONTH_NAMES[ytdCutoffIdx]}` });
    kpiCard(kpiRow, { label: "YTD Actual CTC", value: fmtMoney(ytdActualCTC), note: `${effectiveYear}, through ${MONTH_NAMES[ytdCutoffIdx]}` });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    // Chart 1: monthly Budget vs Actual trend
    const trendActuals = actuals.filter(matchesTrend);
    const trendBudget = budget.filter(matchesTrend);
    const periods = sortedUnique(trendActuals.concat(trendBudget), (r) => r.period).sort();
    const actualByPeriod = periods.map((p) => sumAmount(trendActuals.filter((r) => r.period === p)));
    const budgetByPeriod = periods.map((p) => sumAmount(trendBudget.filter((r) => r.period === p)));
    const c1 = chartCard(grid, { title: "Budget vs Actual CTC Trend", sub: `Monthly, ${year === "All" ? "trailing history" : year}` });
    lineChart(c1, { labels: periods.map(periodLabelOf), datasets: [
      { label: "Budget CTC", data: budgetByPeriod.map(Math.round) },
      { label: "Actual CTC", data: actualByPeriod.map(Math.round) },
    ] });

    // Chart 2: YTD cumulative trend within the effective year
    const monthIndices = Array.from({ length: ytdCutoffIdx + 1 }, (_, i) => i);
    let cumB = 0, cumA = 0;
    const cumBudget = [], cumActual = [];
    for (const mIdx of monthIndices) {
      const p = `${effectiveYear}-${String(mIdx + 1).padStart(2, "0")}-01`;
      cumB += sumAmount(budget.filter((r) => r.period === p && matchesDivDept(r)));
      cumA += sumAmount(actuals.filter((r) => r.period === p && matchesDivDept(r)));
      cumBudget.push(Math.round(cumB));
      cumActual.push(Math.round(cumA));
    }
    const c2 = chartCard(grid, { title: "YTD Cumulative CTC", sub: effectiveYear });
    lineChart(c2, { labels: monthIndices.map((i) => MONTH_NAMES[i].slice(0, 3)), datasets: [
      { label: "Budget CTC YTD", data: cumBudget },
      { label: "Actual CTC YTD", data: cumActual },
    ] });

    // Chart 3: CTC-to-Revenue ratio — company-wide (Revenue has no division
    // breakdown), so only Year applies here, not Division/Department/Month.
    const revenueRows = db.ctcRevenue.filter((r) => year === "All" || r.period?.startsWith(year));
    const revPeriods = sortedUnique(revenueRows, (r) => r.period).sort();
    const actualRatio = revPeriods.map((p) => {
      const rev = revenueRows.find((r) => r.period === p);
      const a = sumAmount(actuals.filter((r) => r.period === p));
      return rev?.actualRevenue ? (a / rev.actualRevenue) * 100 : null;
    });
    const budgetRatio = revPeriods.map((p) => {
      const rev = revenueRows.find((r) => r.period === p);
      const b = sumAmount(budget.filter((r) => r.period === p));
      return rev?.budgetRevenue ? (b / rev.budgetRevenue) * 100 : null;
    });
    const c3 = chartCard(grid, { title: "CTC to Revenue %", sub: "Company-wide" });
    lineChart(c3, { labels: revPeriods.map(periodLabelOf), datasets: [
      { label: "Budget CTC %", data: budgetRatio.map((v) => v == null ? null : Math.round(v * 100) / 100) },
      { label: "Actual CTC %", data: actualRatio.map((v) => v == null ? null : Math.round(v * 100) / 100) },
    ] });

    // Chart 4: Budget vs Actual by Division, for the selected period
    const divOrder = divisions.filter((d) => periodBudget.some((r) => r.division === d) || periodActuals.some((r) => r.division === d));
    const budgetByDiv = divOrder.map((d) => sumAmount(periodBudget.filter((r) => r.division === d)));
    const actualByDiv = divOrder.map((d) => sumAmount(periodActuals.filter((r) => r.division === d)));
    const c4 = chartCard(grid, {
      title: "Budget vs Actual CTC by Division", sub: "Selected period",
      drilldown: { records: periodActuals.concat(periodBudget), matchField: "division", db },
    });
    barChart(c4, { labels: divOrder, datasets: [
      { label: "Budget CTC", data: budgetByDiv.map(Math.round) },
      { label: "Actual CTC", data: actualByDiv.map(Math.round) },
    ] });

    // Breakdown matrix: Division (expandable to Department, then Cost Center)
    // x every month of effectiveYear, Budget/Actual/Diff/Diff% per month —
    // mirrors the source Power BI matrix visual. Month filter doesn't apply
    // here (same reasoning as matchesTrend above: a 12-month matrix needs all
    // 12 months regardless of the Month filter), Division/Department do.
    const breakdownCard = document.createElement("div");
    breakdownCard.className = "card";
    breakdownCard.innerHTML = `
      <h3>CTC Breakdown</h3>
      <div class="card-sub">Division, Department, and Cost Center — Budget vs. Actual, by month (${effectiveYear})</div>
      <div class="data-table-wrap open breakdown-table-wrap"></div>
    `;
    contentEl.appendChild(breakdownCard);
    const breakdownWrap = breakdownCard.querySelector(".breakdown-table-wrap");

    const yearActuals = actuals.filter((r) => r.period?.startsWith(effectiveYear) && matchesDivDept(r));
    const yearBudget = budget.filter((r) => r.period?.startsWith(effectiveYear) && matchesDivDept(r));
    const ccRows = buildMatrixCCRows(yearActuals, yearBudget, effectiveYear);
    breakdownWrap.innerHTML = "";
    breakdownWrap.appendChild(buildMatrixTable(ccRows));
  }

  draw();
}
