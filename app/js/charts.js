import { exportRowsToExcel, openDrilldownModal, defaultColumns } from "./export.js";

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function seriesColors() {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar(`--series-${i}`));
}

export function ink() {
  return {
    primary: cssVar("--text-primary"),
    secondary: cssVar("--text-secondary"),
    muted: cssVar("--text-muted"),
    grid: cssVar("--gridline"),
    baseline: cssVar("--baseline"),
  };
}

export function status() {
  return {
    good: cssVar("--status-good"),
    warning: cssVar("--status-warning"),
    serious: cssVar("--status-serious"),
    critical: cssVar("--status-critical"),
  };
}

const registry = new Map();

function destroyIfExists(canvas) {
  const existing = registry.get(canvas);
  if (existing) { existing.destroy(); registry.delete(canvas); }
}

function baseScales(extra = {}) {
  const { grid, muted, baseline } = ink();
  return {
    x: {
      grid: { color: "transparent" },
      border: { color: baseline },
      ticks: { color: muted, font: { size: 11 } },
      ...extra.x,
    },
    y: {
      grid: { color: grid },
      border: { display: false },
      ticks: { color: muted, font: { size: 11 } },
      beginAtZero: true,
      ...extra.y,
    },
  };
}

function baseLegend(showLegend) {
  const { secondary } = ink();
  return {
    display: !!showLegend,
    labels: { color: secondary, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, boxHeight: 10, font: { size: 12 } },
    position: "top",
    align: "start",
  };
}

function tooltipConfig() {
  return {
    backgroundColor: cssVar("--surface-1"),
    titleColor: ink().primary,
    bodyColor: ink().secondary,
    borderColor: cssVar("--border") || "rgba(0,0,0,0.1)",
    borderWidth: 1,
    padding: 10,
    boxPadding: 4,
    cornerRadius: 8,
    displayColors: true,
  };
}

export function barChart(canvas, { labels, datasets, horizontal = false, stacked = false, showLegend = null }) {
  destroyIfExists(canvas);
  const colors = seriesColors();
  const ds = datasets.map((d, i) => ({
    borderRadius: 4,
    borderSkipped: false,
    maxBarThickness: 42,
    backgroundColor: d.color || colors[i % colors.length],
    ...d,
  }));
  const legend = showLegend === null ? datasets.length > 1 : showLegend;
  const chart = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: ds },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: baseLegend(legend), tooltip: tooltipConfig() },
      scales: horizontal
        ? { x: { ...baseScales().y, stacked }, y: { ...baseScales().x, stacked } }
        : { x: { ...baseScales().x, stacked }, y: { ...baseScales().y, stacked } },
    },
  });
  registry.set(canvas, chart);
  return chart;
}

export function lineChart(canvas, { labels, datasets, showLegend = null, fill = false }) {
  destroyIfExists(canvas);
  const colors = seriesColors();
  const ds = datasets.map((d, i) => ({
    borderColor: d.color || colors[i % colors.length],
    backgroundColor: (d.color || colors[i % colors.length]) + "22",
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHitRadius: 12,
    tension: 0.25,
    fill,
    ...d,
  }));
  const legend = showLegend === null ? datasets.length > 1 : showLegend;
  const chart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: baseLegend(legend), tooltip: tooltipConfig() },
      scales: baseScales(),
    },
  });
  registry.set(canvas, chart);
  return chart;
}

export function doughnutChart(canvas, { labels, data, showLegend = true }) {
  destroyIfExists(canvas);
  const colors = seriesColors();
  const chart = new Chart(canvas, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => colors[i % colors.length]), borderColor: cssVar("--surface-1"), borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: { legend: baseLegend(showLegend), tooltip: tooltipConfig() },
    },
  });
  registry.set(canvas, chart);
  return chart;
}

export function bin(values, binSize, min = null, max = null) {
  const lo = min !== null ? min : Math.floor(Math.min(...values) / binSize) * binSize;
  const hi = max !== null ? max : Math.ceil(Math.max(...values) / binSize) * binSize;
  const nBins = Math.max(1, Math.round((hi - lo) / binSize));
  const counts = new Array(nBins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - lo) / binSize);
    if (idx < 0) idx = 0;
    if (idx >= nBins) idx = nBins - 1;
    counts[idx]++;
  }
  const labels = counts.map((_, i) => {
    const a = lo + i * binSize;
    return `${Math.round(a / 1000)}k`;
  });
  return { labels, counts };
}

// ---- DOM component helpers ----

export function kpiCard(container, { label, value, delta, deltaKind, note }) {
  const el = document.createElement("div");
  el.className = "kpi-card";
  el.innerHTML = `
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    ${delta ? `<div class="kpi-delta ${deltaKind || ""}">${delta}</div>` : ""}
    ${note ? `<div class="kpi-note">${note}</div>` : ""}
  `;
  container.appendChild(el);
  return el;
}

let cardCounter = 0;

export function chartCard(container, { title, sub, size = "grid-2", height = "", tableColumns, tableRows, drilldown }) {
  const id = `chart-${cardCounter++}`;
  const wrap = document.createElement("div");
  wrap.className = "card";
  const canvasId = `${id}-canvas`;
  const showTableToggle = !!(tableColumns && tableColumns.length);
  const showExcelBtn = !!(drilldown && drilldown.records);
  wrap.innerHTML = `
    <h3>${title}</h3>
    ${sub ? `<div class="card-sub">${sub}</div>` : ""}
    <div class="card-canvas-wrap ${height}"><canvas id="${canvasId}"></canvas></div>
    ${showTableToggle || showExcelBtn ? `<div class="card-actions">
      ${showTableToggle ? `<button class="table-toggle" data-target="${id}-table">Show data table</button>` : ""}
      ${showExcelBtn ? `<button class="excel-btn">Export to Excel</button>` : ""}
    </div>` : ""}
    ${showTableToggle ? `<div class="data-table-wrap" id="${id}-table"></div>` : ""}
    ${showExcelBtn ? `<div class="drilldown-hint">Click a bar or segment to view the underlying people</div>` : ""}
  `;
  container.appendChild(wrap);

  if (showTableToggle) {
    const btn = wrap.querySelector(".table-toggle");
    const tableWrap = wrap.querySelector(`#${id}-table`);
    btn.addEventListener("click", () => {
      const open = tableWrap.classList.toggle("open");
      btn.textContent = open ? "Hide data table" : "Show data table";
      if (open && !tableWrap.dataset.built) {
        tableWrap.dataset.built = "1";
        tableWrap.appendChild(buildTable(tableColumns, tableRows));
      }
    });
  }

  const canvas = document.getElementById(canvasId);

  if (showExcelBtn) {
    wrap.querySelector(".excel-btn").addEventListener("click", () => {
      const cols = drilldown.columns && drilldown.columns.length ? drilldown.columns : defaultColumns(drilldown.records);
      exportRowsToExcel(drilldown.records, cols, drilldown.filenamePrefix || title);
    });

    canvas.style.cursor = "pointer";
    canvas.addEventListener("click", (evt) => {
      const chart = registry.get(canvas);
      if (!chart) return;
      const els = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
      if (!els.length) return;
      const { index, datasetIndex } = els[0];
      const label = chart.data.labels[index];
      let matched = drilldown.matchFn
        ? drilldown.records.filter((r) => drilldown.matchFn(r, label))
        : drilldown.records.filter((r) => String(r[drilldown.matchField]) === String(label));
      if (drilldown.datasetField && chart.data.datasets[datasetIndex]) {
        const dsLabel = chart.data.datasets[datasetIndex].label;
        matched = matched.filter((r) => String(r[drilldown.datasetField]) === String(dsLabel));
      }
      openDrilldownModal({
        title: `${title} — ${label}`,
        records: matched,
        columns: drilldown.columns,
        db: drilldown.db,
        filenamePrefix: `${title} - ${label}`,
      });
    });
  }

  return canvas;
}

export function tableCard(container, { title, sub, columns, rows }) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h3>${title}</h3>${sub ? `<div class="card-sub">${sub}</div>` : ""}`;
  wrap.appendChild(buildTable(columns, rows));
  container.appendChild(wrap);
  return wrap;
}

export function buildTable(columns, rows) {
  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${columns.map((c) => `<th class="${c.num ? "num" : ""}">${c.label}</th>`).join("")}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  tbody.innerHTML = rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.num ? "num" : ""}">${c.fmt ? c.fmt(r[c.key]) : r[c.key]}</td>`).join("")}</tr>`).join("");
  table.appendChild(tbody);
  return table;
}

export function noteBanner(container, html) {
  const el = document.createElement("div");
  el.className = "note-banner";
  el.innerHTML = html;
  container.appendChild(el);
  return el;
}

export function filterSelect(container, { label, options, value, onChange }) {
  const wrap = document.createElement("label");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "3px";
  wrap.style.fontSize = "11px";
  wrap.innerHTML = `<span style="color:var(--text-muted)">${label}</span>`;
  const select = document.createElement("select");
  select.innerHTML = options.map((o) => {
    const v = typeof o === "object" ? o.value : o;
    const l = typeof o === "object" ? o.label : o;
    return `<option value="${v}" ${v === value ? "selected" : ""}>${l}</option>`;
  }).join("");
  select.addEventListener("change", () => onChange(select.value));
  wrap.appendChild(select);
  container.appendChild(wrap);
  return select;
}

export function sectionTitle(container, text) {
  const el = document.createElement("div");
  el.className = "section-title";
  el.textContent = text;
  container.appendChild(el);
  return el;
}
