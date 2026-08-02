import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

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

export async function loadAll() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured yet — fill in SUPABASE_URL and SUPABASE_ANON_KEY in app/js/supabase-config.js.");
  }
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const entries = Object.entries(TABLES);
  const results = await Promise.all(entries.map(([, table]) => fetchAllRows(client, table)));
  const db = {};
  entries.forEach(([key], i) => { db[key] = results[i]; });

  db.employeeIndex = new Map(db.employeeMaster.map((e) => [e.employeeId, e]));

  db.salaryStructureIndex = new Map(db.salaryStructure.map((s) => [s.grade, s]));

  db.latestBaseSalary = latestByEmployee(db.baseSalary, "employeeId", "salaryEffectiveDate");
  db.latestTotalRewards = latestByEmployee(db.totalRewards, "employeeId", "salaryEffectiveDate");

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
