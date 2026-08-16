import { lastNMonths, monthEnd, monthLabel, isActiveAsOf, sortedUnique, fmtInt, fmtPct } from "../data.js";
import { kpiCard, chartCard, tableCard, lineChart, barChart, filterSelect } from "../charts.js";

export const meta = { id: "headcount-forecast", label: "Headcount Forecast", subtitle: "Projected headcount trend with a 12-month confidence range" };

const sumField = (rows, field) => rows.reduce((s, r) => s + (r[field] || 0), 0);

export function render({ db, contentEl, filtersEl }) {
  const divisions = ["All", ...sortedUnique(db.employeeMaster, (e) => e.division).sort()];
  let division = "All";

  filterSelect(filtersEl, { label: "Division", options: divisions, value: division, onChange: (v) => { division = v; draw(); } });

  function draw() {
    contentEl.innerHTML = "";

    const em = db.employeeMaster.filter((e) => division === "All" || e.division === division);
    const months = lastNMonths(12);

    // The trend's last historical point deliberately uses the same
    // isActiveAsOf(monthEnd) cutoff as every other month in this series
    // (not a live employmentStatus snapshot, unlike headcount.js's KPI
    // card) — it has to land on exactly the same number
    // generate_headcount_forecast_data.ps1 used as its own baseline, since
    // the whole forecast series was projected forward from that figure.
    const actualSeries = months.map((ym) => em.filter((e) => isActiveAsOf(e, monthEnd(ym))).length);
    const currentHeadcount = actualSeries[actualSeries.length - 1];

    const forecastRows = db.headcountForecast.filter((r) => division === "All" || r.division === division);
    const forecastPeriods = sortedUnique(forecastRows, (r) => r.period).sort();
    const lastPeriod = forecastPeriods[forecastPeriods.length - 1];
    const forecastByPeriod = (period) => forecastRows.filter((r) => r.period === period);

    const forecastHeadcount12mo = sumField(forecastByPeriod(lastPeriod), "forecastHeadcount");
    const lowerBound12mo = sumField(forecastByPeriod(lastPeriod), "lowerBound");
    const upperBound12mo = sumField(forecastByPeriod(lastPeriod), "upperBound");
    const netChange = forecastHeadcount12mo - currentHeadcount;
    const growthPct = currentHeadcount ? (netChange / currentHeadcount) * 100 : 0;

    const kpiRow = document.createElement("div");
    kpiRow.className = "kpi-row";
    contentEl.appendChild(kpiRow);
    kpiCard(kpiRow, { label: "Current Headcount", value: fmtInt(currentHeadcount), note: `month-end ${monthLabel(months[months.length - 1])}` });
    kpiCard(kpiRow, { label: "Forecasted Headcount (12 Months)", value: fmtInt(forecastHeadcount12mo), note: lastPeriod ? monthLabel(lastPeriod.slice(0, 7)) : "" });
    kpiCard(kpiRow, { label: "Projected Net Change", value: `${netChange >= 0 ? "+" : ""}${fmtInt(netChange)}`, note: "over 12 months" });
    kpiCard(kpiRow, { label: "Projected Growth", value: fmtPct(growthPct), note: "over 12 months" });
    kpiCard(kpiRow, { label: "Forecast Confidence Range", value: `± ${fmtInt(Math.round((upperBound12mo - lowerBound12mo) / 2))}`, note: "at 12-month horizon" });

    const grid = document.createElement("div");
    grid.className = "grid-2";
    contentEl.appendChild(grid);

    const forecastSeries = forecastPeriods.map((p) => sumField(forecastByPeriod(p), "forecastHeadcount"));
    const lowerSeries = forecastPeriods.map((p) => sumField(forecastByPeriod(p), "lowerBound"));
    const upperSeries = forecastPeriods.map((p) => sumField(forecastByPeriod(p), "upperBound"));

    // Actual and Forecast/Lower/Upper are 4 separate datasets, not one
    // continuous line — Chart.js draws `null` points as gaps, so each
    // forecast-side dataset is null-padded across the historical months
    // except for one bridging point at the boundary (set equal to the last
    // Actual value) so the dashed forecast/band lines visually pick up
    // exactly where the solid Actual line ends, instead of floating apart.
    const allLabels = [...months.map(monthLabel), ...forecastPeriods.map((p) => monthLabel(p.slice(0, 7)))];
    const bridge = (arr) => [...months.slice(0, -1).map(() => null), currentHeadcount, ...arr];

    const c1 = chartCard(grid, { title: "Headcount Trend — Actual vs. Forecast", sub: "Monthly, with a widening confidence range" });
    lineChart(c1, {
      labels: allLabels,
      datasets: [
        { label: "Actual", data: [...actualSeries, ...forecastPeriods.map(() => null)] },
        { label: "Forecast", data: bridge(forecastSeries), borderDash: [6, 4] },
        { label: "Lower Bound", data: bridge(lowerSeries), borderDash: [2, 3], borderWidth: 1, pointRadius: 0 },
        { label: "Upper Bound", data: bridge(upperSeries), borderDash: [2, 3], borderWidth: 1, pointRadius: 0 },
      ],
      showLegend: true,
    });

    // Breaks down by division regardless of the Division filter above —
    // same convention as every other page's "by <the one filter's own
    // dimension>" chart (e.g. probation-pip.js's year-trend chart ignoring
    // its own Year filter): the one dimension a chart itself groups by
    // isn't also narrowed by the dropdown that filters everything else.
    const allDivisions = sortedUnique(db.employeeMaster, (e) => e.division).sort();
    const lastActualCutoff = monthEnd(months[months.length - 1]);
    const currentByDiv = allDivisions.map((d) => db.employeeMaster.filter((e) => e.division === d && isActiveAsOf(e, lastActualCutoff)).length);
    const forecastByDiv = allDivisions.map((d) => sumField(db.headcountForecast.filter((r) => r.division === d && r.period === lastPeriod), "forecastHeadcount"));

    const c2 = chartCard(grid, {
      title: "Forecasted Headcount by Division", sub: "12 months out",
      drilldown: { records: db.headcountForecast.filter((r) => r.period === lastPeriod), matchField: "division", db },
    });
    barChart(c2, { labels: allDivisions, datasets: [{ label: "Current", data: currentByDiv }, { label: "Forecast (+12mo)", data: forecastByDiv }] });

    tableCard(contentEl, {
      title: "Forecast Detail", sub: division === "All" ? "All divisions" : division,
      columns: [
        { key: "period", label: "Period" }, { key: "division", label: "Division" },
        { key: "forecastHeadcount", label: "Forecast Headcount", num: true, fmt: fmtInt },
        { key: "lowerBound", label: "Lower Bound", num: true, fmt: fmtInt },
        { key: "upperBound", label: "Upper Bound", num: true, fmt: fmtInt },
      ],
      rows: forecastRows.slice().sort((a, b) => a.period.localeCompare(b.period) || a.division.localeCompare(b.division)),
    });
  }

  draw();
}
