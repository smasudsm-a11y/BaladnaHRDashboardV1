import { getClient } from "./supabase-client.js";

const TABLES = {
  employeeMaster: "employee_master",
  orgHierarchy: "org_hierarchy",
  recruitment: "recruitment",
  diversity: "diversity",
  attrition: "attrition",
  baseSalary: "base_salary",
  totalRewards: "total_rewards",
  salaryStructure: "salary_structure",
  leave: "leave",
  absenteeism: "absenteeism",
  performance: "performance",
  training: "training",
  excessHours: "excess_hours_violations",
  article75: "article75_violations",
  costCenters: "cost_centers",
  ctcActuals: "ctc_actuals",
  ctcBudget: "ctc_budget",
  ctcRevenue: "ctc_revenue",
  payroll: "payroll",
  budgetedPositions: "budgeted_positions",
  kpiTargets: "kpi_targets",
};

// Mirrors the RLS policies in supabase/06_section_based_access.sql: which raw
// tables a given dashboard section actually reads from (directly or via
// employeeIndex/latestBaseSalary/etc). Used to skip fetching tables the current
// user has no section access to — RLS would return them empty anyway, but there's
// no reason to pay for the round trip.
const SECTION_TABLES = {
  exec: ["employee_master", "attrition", "absenteeism", "leave", "base_salary", "kpi_targets"],
  headcount: ["employee_master", "org_hierarchy"],
  recruitment: ["recruitment", "employee_master", "budgeted_positions"],
  newhires: ["employee_master", "base_salary", "salary_structure"],
  diversity: ["diversity", "recruitment", "attrition"],
  compensation: ["base_salary", "employee_master", "total_rewards", "salary_structure"],
  attrition: ["employee_master", "attrition", "performance", "kpi_targets"],
  leave: ["leave", "absenteeism", "employee_master", "base_salary", "kpi_targets"],
  performance: ["performance", "employee_master"],
  training: ["training", "employee_master"],
  attendance: ["excess_hours_violations", "article75_violations"],
  "ctc-budget-actual": ["cost_centers", "ctc_actuals", "ctc_budget", "ctc_revenue"],
  "ctc-expense-category": ["cost_centers", "ctc_actuals", "ctc_budget"],
  "ctc-variance-explorer": ["cost_centers", "ctc_actuals", "ctc_budget"],
  "ctc-yoy": ["cost_centers", "ctc_actuals", "ctc_budget"],
  payroll: ["payroll", "employee_master", "base_salary"],
};

function toCamel(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}

// Supabase/PostgREST caps a single request at 1000 rows by default — several of these
// tables (absenteeism, leave, training…) are well past that, so page through in batches.
async function fetchAllRows(client, table) {
  const pageSize = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase query failed for "${table}": ${error.message}`);
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all.map(toCamel);
}

export async function loadAll(allowedIds) {
  const client = getClient();

  const neededTables = new Set();
  for (const id of allowedIds) {
    (SECTION_TABLES[id] || []).forEach((t) => neededTables.add(t));
  }

  const entries = Object.entries(TABLES);
  const results = await Promise.all(entries.map(([, table]) =>
    neededTables.has(table) ? fetchAllRows(client, table) : Promise.resolve([])
  ));
  const db = {};
  entries.forEach(([key], i) => { db[key] = results[i]; });

  db.employeeIndex = new Map(db.employeeMaster.map((e) => [e.employeeId, e]));

  db.salaryStructureIndex = new Map(db.salaryStructure.map((s) => [s.grade, s]));

  db.costCenterIndex = new Map(db.costCenters.map((c) => [c.costCenter, c]));

  db.budgetedPositionsIndex = new Map(db.budgetedPositions.map((b) => [b.department, b]));

  db.kpiTargetsIndex = new Map(db.kpiTargets.map((t) => [t.metricId, t]));

  db.latestBaseSalary = latestByEmployee(db.baseSalary, "employeeId", "salaryEffectiveDate");
  db.latestTotalRewards = latestByEmployee(db.totalRewards, "employeeId", "salaryEffectiveDate");
  db.earliestBaseSalary = earliestByEmployee(db.baseSalary, "employeeId", "salaryEffectiveDate");

  return db;
}

export function latestByEmployee(rows, idField, dateField) {
  const best = new Map();
  for (const row of rows) {
    const key = row[idField];
    const d = row[dateField];
    const prev = best.get(key);
    if (!prev || (d && (!prev[dateField] || d > prev[dateField]))) best.set(key, row);
  }
  return best;
}

// Mirrors latestByEmployee, flipped to earliest — used for "at hire" comparisons
// (e.g. starting salary vs. grade midpoint) where the latest record would answer
// a different question (current pay, not what they were hired in at).
export function earliestByEmployee(rows, idField, dateField) {
  const best = new Map();
  for (const row of rows) {
    const key = row[idField];
    const d = row[dateField];
    const prev = best.get(key);
    if (!prev || (d && (!prev[dateField] || d < prev[dateField]))) best.set(key, row);
  }
  return best;
}

export function emp(db, employeeId) {
  return db.employeeIndex.get(employeeId) || null;
}

export function withEmployeeFields(db, rows, fields) {
  return rows.map((row) => {
    const e = emp(db, row.employeeId);
    const extra = {};
    for (const f of fields) extra[f] = e ? e[f] : null;
    return { ...row, ...extra };
  });
}

export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(row);
  }
  return m;
}

export function sumBy(rows, valueFn) {
  return rows.reduce((s, r) => s + (Number(valueFn(r)) || 0), 0);
}

export function avgBy(rows, valueFn) {
  if (!rows.length) return 0;
  return sumBy(rows, valueFn) / rows.length;
}

export function countUnique(rows, keyFn) {
  return new Set(rows.map(keyFn)).size;
}

export function yearOf(dateStr) {
  return dateStr ? Number(dateStr.slice(0, 4)) : null;
}

export function monthOf(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : null; // YYYY-MM
}

export function monthLabel(ym) {
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(m) - 1]} ${y}`;
}

export function daysBetween(a, b) {
  if (!a || !b) return null;
  return (new Date(b) - new Date(a)) / 86400000;
}

export function sortedUnique(rows, keyFn) {
  return Array.from(new Set(rows.map(keyFn).filter((v) => v !== null && v !== undefined && v !== ""))).sort();
}

export function sortGrades(arr) {
  return [...arr].sort((a, b) => {
    const na = parseInt(String(a).replace(/\D/g, ""), 10);
    const nb = parseInt(String(b).replace(/\D/g, ""), 10);
    if (Number.isNaN(na) || Number.isNaN(nb)) return String(a).localeCompare(String(b));
    return na - nb;
  });
}

export function fmtInt(n) {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtDec(n, digits = 1) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(n, digits = 1) {
  return `${Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function fmtMoney(n, currency = "QAR") {
  return `${currency} ${Math.round(n).toLocaleString("en-US")}`;
}

// Phase G (18_phase_g.sql/kpi_targets): a shared good/bad delta line for any
// KPI card that has a target — computes the comparison generically off
// `direction` instead of hardcoding a threshold on every page that surfaces
// one. Returns {} (no delta rendered — kpiCard already treats a falsy delta
// as "skip it") if this metric has no target row, e.g. a section-restricted
// user without kpi_targets read access.
export function targetDelta(db, metricId, actualValue) {
  const t = db.kpiTargetsIndex?.get(metricId);
  if (!t) return {};
  const diff = actualValue - t.targetValue;
  const meetsTarget = t.direction === "lower_is_better" ? diff <= 0 : diff >= 0;
  const arrow = diff === 0 ? "●" : diff > 0 ? "▲" : "▼";
  return {
    delta: `${arrow} Target: ${fmtPct(t.targetValue)}`,
    deltaKind: meetsTarget ? "good" : "bad",
  };
}

export const REFERENCE_TODAY = "2026-08-02";

export function lastNMonths(n, refDate = REFERENCE_TODAY) {
  const [ry, rm] = refDate.split("-").map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    let y = ry, m = rm - i;
    while (m <= 0) { m += 12; y -= 1; }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export function monthEnd(ym) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, "0")}`;
}

export function isActiveAsOf(e, dateStr) {
  if (!e.hireDate || e.hireDate > dateStr) return false;
  if (e.terminationDate && e.terminationDate <= dateStr) return false;
  return true;
}
