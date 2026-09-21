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
  criticalPositions: "critical_positions",
  incumbents: "incumbents",
  successors: "successors",
  kpiTargets: "kpi_targets",
  probationReviews: "probation_reviews",
  pipRecords: "pip_records",
  exitSurveys: "exit_surveys",
  stageGateScores: "stage_gate_scores",
  headcountForecast: "headcount_forecast",
  initiatives: "initiatives",
};

// Mirrors the RLS policies in supabase/06_section_based_access.sql: which raw
// tables a given dashboard section actually reads from (directly or via
// employeeIndex/latestBaseSalary/etc). Used to skip fetching tables the current
// user has no section access to — RLS would return them empty anyway, but there's
// no reason to pay for the round trip.
const SECTION_TABLES = {
  exec: ["employee_master", "attrition", "absenteeism", "leave", "base_salary", "kpi_targets", "critical_positions", "successors", "stage_gate_scores", "initiatives"],
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
  succession: ["critical_positions", "incumbents", "successors", "employee_master"],
  "probation-pip": ["probation_reviews", "pip_records", "employee_master"],
  enps: ["exit_surveys", "stage_gate_scores", "employee_master"],
  "headcount-forecast": ["headcount_forecast", "employee_master"],
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

  // Keyed by (grade, jobFamily, currency) -- grade alone is ambiguous in the
  // real SAP salary bands, and (grade, jobFamily) alone still collides
  // across countries (see 25_salary_structure_composite_key.sql). Look up
  // with salaryStructureLookup(db, grade, jobFamily, currency), not
  // .get(grade) directly.
  db.salaryStructureIndex = new Map(db.salaryStructure.map((s) => [`${s.grade}|${s.jobFamily}|${s.currency}`, s]));

  db.costCenterIndex = new Map(db.costCenters.map((c) => [c.costCenter, c]));

  db.budgetedPositionsIndex = new Map(db.budgetedPositions.map((b) => [b.department, b]));

  db.criticalPositionsIndex = new Map(db.criticalPositions.map((p) => [p.positionId, p]));

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

// salary_structure's key is (grade, jobFamily, currency), not grade alone --
// see 25_salary_structure_composite_key.sql. currency comes from the
// employee's own base_salary row (sal.currency), not employee_master --
// (Grade, Job Family) alone still collides across countries (Qatar/QAR vs.
// Egypt/EGP shared the same combo under two very different-scale bands).
// jobFamily is null for any employee whose Position Number had no match in
// Position Data (see the SAP migration notes), so this can legitimately
// return null.
export function salaryStructureLookup(db, grade, jobFamily, currency) {
  return db.salaryStructureIndex.get(`${grade}|${jobFamily}|${currency}`) || null;
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

// User-provided rate (2026-09-17), for pages that sum/average money across
// employees regardless of currency (e.g. Compensation's Avg Total Cash
// Compensation, Underpaid & Overpaid's Difference from Min/Max Salary) --
// mixing raw QAR and EGP figures in one total would be meaningless.
// Per-employee comparisons against the employee's own (native-currency)
// salary_structure band -- compa-ratio, range penetration, severity band --
// don't need this, since both sides of that comparison are already in the
// same currency.
export const EGP_TO_QAR = 17.717;
export function toQarEquivalent(amount, currency) {
  if (amount === null || amount === undefined) return amount;
  return currency === "EGP" ? amount * EGP_TO_QAR : amount;
}

// Phase G (19_phase_g.sql/kpi_targets): a shared good/bad delta line for any
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

// employee_master.job_level's real 9-tier Grade banding (see
// 25_salary_structure_composite_key.sql's sibling decision, and the SAP
// migration notes) -- replaces the old synthetic 4-tier Staff/Supervisory/
// Managerial/Executive scheme everywhere a page needs the full ordered
// list (an Org Level filter, a "by Job Level" chart). Shared here rather
// than duplicated per page, since every page needs the exact same 9
// values in the exact same order -- unlike a page-local heuristic
// (SEVERITY_BANDS, RATING_ORDER), this is a fixed vocabulary describing
// the real data itself.
export const JOB_LEVEL_ORDER = ["Junior", "Mid", "Senior", "Executive", "Specialist/Supervisor", "Managerial", "Director", "Chief", "CEO/Group CEO"];

// The tiers that count as "manages people" for pages that don't already
// have org_hierarchy loaded to check direct-report counts directly (prefer
// that where it's available -- see headcount.js's Span of Control). Maps
// the old scheme's Supervisory+Managerial+Executive (all 3 "manager"
// tiers) onto their real equivalents; new Executive (G13-14) is NOT
// included here despite the name -- it sits below Specialist/Supervisor
// in the real hierarchy and isn't a people-management tier.
export const LEADERSHIP_LEVELS = ["Specialist/Supervisor", "Managerial", "Director", "Chief", "CEO/Group CEO"];

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
