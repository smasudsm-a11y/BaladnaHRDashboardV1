import { getClient } from "../supabase-client.js";

export const meta = { id: "data-refresh", label: "Data Refresh", subtitle: "Upload updated Excel workbooks to refresh the live Supabase data" };

// Mirrors the exact sheet/column mapping used to build the original import
// (see the PRD's 11 source workbooks). Each "unit" is one physical Excel file;
// Compensation is the one file that updates three tables at once.
const UPLOAD_UNITS = [
  {
    id: "employee_master", fileLabel: "01 — Employee Master",
    sheets: [{
      sheetName: "Employee Master Data", table: "employee_master",
      // 9 other tables FK-reference employee_id here, so a delete-then-insert
      // replace would violate those constraints as soon as any of them has data.
      // Upserted by employee_id instead — see 10_employee_master_upsert.sql.
      upsertKey: "employee_id",
      dateFields: ["date_of_birth", "hire_date", "confirmation_date", "termination_date"],
      fields: {
        "Employee ID": "employee_id", "Employee Number": "employee_number", "Employee Name": "employee_name",
        "Preferred Name": "preferred_name", "Gender": "gender", "Nationality": "nationality",
        "Date of Birth": "date_of_birth", "Age": "age", "Marital Status": "marital_status",
        "Employment Status": "employment_status", "Employee Type": "employee_type",
        "Full Time / Part Time": "full_time_part_time", "Hire Date": "hire_date",
        "Confirmation Date": "confirmation_date", "Termination Date": "termination_date",
        "Termination Reason": "termination_reason", "Length of Service": "length_of_service",
        "Legal Entity": "legal_entity", "Business Unit": "business_unit", "Department": "department",
        "Division": "division", "Section": "section", "Cost Center": "cost_center",
        "Position ID": "position_id", "Position Title": "position_title", "Job Family": "job_family",
        "Job Grade": "job_grade", "Job Level": "job_level", "Line Manager ID": "line_manager_id",
        "Line Manager Name": "line_manager_name", "Location": "location", "Country": "country",
        "City": "city", "Employment Category": "employment_category",
        "Workforce Category": "workforce_category",
      },
    }],
  },
  {
    id: "org_hierarchy", fileLabel: "02 — Organizational Hierarchy",
    sheets: [{
      sheetName: "Org Hierarchy Data", table: "org_hierarchy", dateFields: [],
      fields: {
        "Employee ID": "employee_id", "Manager ID": "manager_id", "Manager Name": "manager_name",
        "Level 1 Leader": "level1_leader", "Level 2 Leader": "level2_leader", "Level 3 Leader": "level3_leader",
        "CEO Hierarchy Level": "ceo_hierarchy_level", "Department": "department", "Division": "division",
        "Function": "function", "Cost Center": "cost_center",
      },
    }],
  },
  {
    id: "recruitment", fileLabel: "04 — Recruitment Dashboard",
    sheets: [{
      sheetName: "Recruitment Data", table: "recruitment",
      dateFields: ["requisition_open_date", "requisition_close_date", "interview_date", "offer_date", "joining_date"],
      fields: {
        "Requisition ID": "requisition_id", "Vacancy Position": "vacancy_position", "Job Grade": "job_grade",
        "Department": "department", "Hiring Manager": "hiring_manager",
        "Requisition Open Date": "requisition_open_date", "Requisition Close Date": "requisition_close_date",
        "Candidate ID": "candidate_id", "Candidate Gender": "candidate_gender",
        "Candidate Nationality": "candidate_nationality", "Source of Hire": "source_of_hire",
        "Interview Date": "interview_date", "Offer Date": "offer_date", "Joining Date": "joining_date",
        "Recruitment Cost": "recruitment_cost",
      },
    }],
  },
  {
    id: "diversity", fileLabel: "05 — Diversity Dashboard",
    sheets: [{
      sheetName: "Diversity Data", table: "diversity", dateFields: [],
      fields: {
        "Employee ID": "employee_id", "Gender": "gender", "Nationality": "nationality",
        "Ethnicity (if available)": "ethnicity", "Age": "age", "Age Band": "age_band",
        "Disability Status": "disability_status", "Grade": "grade", "Management Level": "management_level",
        "Leadership Status": "leadership_status",
      },
    }],
  },
  {
    id: "attrition", fileLabel: "06 — Attrition Dashboard",
    sheets: [{
      sheetName: "Attrition Data", table: "attrition", dateFields: ["hire_date", "termination_date"],
      fields: {
        "Employee ID": "employee_id", "Hire Date": "hire_date", "Termination Date": "termination_date",
        "Termination Reason": "termination_reason", "Voluntary / Involuntary": "voluntary_involuntary",
        "Department": "department", "Grade": "grade", "Manager": "manager", "Gender": "gender",
        "Age": "age", "Tenure": "tenure",
      },
    }],
  },
  {
    id: "compensation", fileLabel: "07 — Compensation Dashboard",
    sheets: [
      {
        sheetName: "Base Salary Data", table: "base_salary", dateFields: ["salary_effective_date"],
        fields: {
          "Employee ID": "employee_id", "Grade": "grade", "Position": "position",
          "Base Salary": "base_salary", "Currency": "currency", "Salary Effective Date": "salary_effective_date",
        },
      },
      {
        sheetName: "Total Rewards Data", table: "total_rewards", dateFields: ["salary_effective_date"],
        fields: {
          "Employee ID": "employee_id", "Salary Effective Date": "salary_effective_date",
          "Housing Allowance": "housing_allowance", "Transport Allowance": "transport_allowance",
          "Education Allowance": "education_allowance", "Other Allowances": "other_allowances",
          "Variable Pay": "variable_pay", "Bonus": "bonus", "Incentive": "incentive",
          "Total Cash Compensation": "total_cash_compensation", "Total Remuneration": "total_remuneration",
        },
      },
      {
        sheetName: "Salary Structure Data", table: "salary_structure", dateFields: [],
        fields: {
          "Grade": "grade", "Salary Range Minimum": "salary_range_min",
          "Salary Midpoint": "salary_midpoint", "Salary Range Maximum": "salary_range_max",
          "Grade Tier": "grade_tier",
        },
      },
    ],
  },
  {
    id: "leave", fileLabel: "08 — Leave Dashboard",
    sheets: [{
      sheetName: "Leave Data", table: "leave", dateFields: ["leave_start_date", "leave_end_date"],
      fields: {
        "Employee ID": "employee_id", "Leave Type": "leave_type", "Leave Start Date": "leave_start_date",
        "Leave End Date": "leave_end_date", "Leave Days": "leave_days", "Leave Status": "leave_status",
        "Leave Balance": "leave_balance", "Department": "department", "Manager": "manager",
      },
    }],
  },
  {
    id: "absenteeism", fileLabel: "09 — Absenteeism Dashboard",
    sheets: [{
      sheetName: "Absenteeism Data", table: "absenteeism", dateFields: ["absence_date"],
      fields: {
        "Employee ID": "employee_id", "Absence Date": "absence_date", "Absence Type": "absence_type",
        "Absence Hours": "absence_hours", "Paid / Unpaid": "paid_unpaid", "Department": "department",
        "Manager": "manager", "Approval Status": "approval_status",
      },
    }],
  },
  {
    id: "performance", fileLabel: "10 — Performance Dashboard",
    sheets: [{
      sheetName: "Performance Data", table: "performance", dateFields: ["rating_date"],
      fields: {
        "Employee ID": "employee_id", "Performance Cycle": "performance_cycle", "Goal Score": "goal_score",
        "Competency Score": "competency_score", "Overall Rating": "overall_rating", "Rating Date": "rating_date",
        "Manager Rating": "manager_rating", "Calibration Rating": "calibration_rating",
        "Promotion Recommendation": "promotion_recommendation",
      },
    }],
  },
  {
    id: "training", fileLabel: "11 — Learning & Training Dashboard",
    sheets: [{
      sheetName: "Training Data", table: "training", dateFields: ["completion_date", "expiry_date", "required_date"],
      fields: {
        "Employee ID": "employee_id", "Course Name": "course_name", "Training Category": "training_category",
        "Training Hours": "training_hours", "Training Cost": "training_cost",
        "Completion Status": "completion_status", "Completion Date": "completion_date",
        "Certification Achieved": "certification_achieved",
        "Expiry Date": "expiry_date", "Compliance Status": "compliance_status", "Required Date": "required_date",
      },
    }],
  },
  {
    id: "attendance_violations", fileLabel: "12 — Attendance Violations Dashboard",
    sheets: [
      {
        sheetName: "Excess Hours Data", table: "excess_hours_violations", dateFields: ["violation_date"],
        fields: {
          "Employee ID": "employee_id", "Employee Name": "employee_name", "Job Title": "job_title",
          "Division": "division", "Department": "department", "Section": "section",
          "Violation Date": "violation_date", "Clock In": "clock_in", "Clock Out": "clock_out",
          "Total Hours": "total_hours", "Manager Name": "manager_name",
        },
      },
      {
        sheetName: "Article 75 Data", table: "article75_violations", dateFields: ["week_start", "week_end"],
        fields: {
          "Week Start": "week_start", "Week End": "week_end", "Case Count": "case_count",
        },
      },
    ],
  },
  // The 4 CTC tables are 4 separate cards, not one bundled file — Finance
  // uploads a new Actuals file every month, but Cost Centers/Budget/Revenue
  // change rarely and on their own schedules. All 4 sheets still live in one
  // workbook (Database/13_CTC_Report.xlsx) for the one-time historical load;
  // each card below just reads its own sheet out of whatever file it's given.
  {
    id: "cost_centers", fileLabel: "13a — CTC Cost Centers",
    sheets: [{
      // Rarely changes; upserted by its own code so corrections never need a delete step.
      sheetName: "Cost Centers Data", table: "cost_centers", dateFields: [],
      upsertKey: "cost_center",
      fields: { "Cost Center": "cost_center", "Division": "division", "Department": "department" },
    }],
  },
  {
    id: "ctc_actuals", fileLabel: "13b — CTC Actuals",
    sheets: [{
      // Real financial data that accumulates month by month — see 12_ctc_report.sql.
      // Upsert key is composite (period+GL+cost center) so re-uploading a corrected
      // month never touches any other month's rows, unlike a delete-then-insert table.
      // This is the card the CTC Data Converter's output goes into, monthly.
      sheetName: "CTC Actuals Data", table: "ctc_actuals", dateFields: ["period"],
      upsertKey: "period,gl_code,cost_center",
      fields: { "Period": "period", "GL Code": "gl_code", "GL Name": "gl_name", "FS Category": "fs_category", "Cost Center": "cost_center", "Amount": "amount" },
    }],
  },
  {
    id: "ctc_budget", fileLabel: "13c — CTC Budget",
    sheets: [{
      sheetName: "CTC Budget Data", table: "ctc_budget", dateFields: ["period"],
      upsertKey: "period,gl_code,cost_center",
      fields: { "Period": "period", "GL Code": "gl_code", "GL Name": "gl_name", "FS Category": "fs_category", "Cost Center": "cost_center", "Amount": "amount" },
    }],
  },
  {
    id: "ctc_revenue", fileLabel: "13d — CTC Revenue",
    sheets: [{
      sheetName: "CTC Revenue Data", table: "ctc_revenue", dateFields: ["period"],
      upsertKey: "period",
      fields: { "Period": "period", "Actual Revenue": "actual_revenue", "Budget Revenue": "budget_revenue" },
    }],
  },
  {
    id: "payroll", fileLabel: "14 — Payroll Report",
    sheets: [{
      // Synthetic, monthly-accumulating table — upserted by (employee_id,
      // period) so a corrected month's re-upload never touches other months.
      sheetName: "Payroll Data", table: "payroll", dateFields: ["period"],
      upsertKey: "employee_id,period",
      fields: {
        "Employee ID": "employee_id", "Period": "period", "Gross Salary": "gross_salary",
        "Overtime Amount": "overtime_amount", "Total Deductions": "total_deductions",
        "Air Ticket Cost": "air_ticket_cost", "Net Pay": "net_pay",
        "Annual Leave Cost": "annual_leave_cost",
      },
    }],
  },
  {
    id: "budgeted_positions", fileLabel: "16 — Budgeted Positions",
    sheets: [{
      // Small, rarely-changing department -> headcount-budget lookup (see
      // 17_phase_f.sql) — upserted by department, same reasoning as
      // cost_centers. No source Database/*.xlsx workbook exists for this one
      // (seeded directly by the migration's INSERT); this card exists so
      // Total Rewards can revise department budgets going forward.
      sheetName: "Budgeted Positions Data", table: "budgeted_positions", dateFields: [],
      upsertKey: "department",
      fields: { "Department": "department", "Budgeted Headcount": "budgeted_headcount" },
    }],
  },
  {
    id: "succession", fileLabel: "15 — Succession Planning",
    sheets: [
      {
        // Delete+insert, not upserted — a succession roster is a point-in-time
        // snapshot Total Rewards replaces wholesale when revised (see
        // 18_succession_planning.sql), not an accumulating monthly table.
        sheetName: "Critical Positions Data", table: "critical_positions", dateFields: [],
        fields: {
          "Position ID": "position_id", "Position Title": "position_title", "Department": "department",
          "Division": "division", "Business Unit": "business_unit", "Job Grade": "job_grade", "Criticality": "criticality",
        },
      },
      {
        sheetName: "Incumbents Data", table: "incumbents", dateFields: [],
        fields: {
          "Position ID": "position_id", "Employee ID": "employee_id",
          "Time in Role (Years)": "time_in_role_years", "Retirement Risk": "retirement_risk",
        },
      },
      {
        sheetName: "Successors Data", table: "successors", dateFields: [],
        fields: {
          "Position ID": "position_id", "Successor Employee ID": "successor_employee_id",
          "Readiness": "readiness", "Is High Potential": "is_high_potential",
        },
      },
    ],
  },
  {
    id: "kpi_targets", fileLabel: "17 — KPI Targets",
    sheets: [{
      // Small, rarely-changing benchmark table (see 19_phase_g.sql) —
      // upserted by metric_id, same reasoning as budgeted_positions/
      // cost_centers. No source Database/*.xlsx workbook exists for this
      // one either (seeded directly by the migration's INSERT); this card
      // exists so targets can be revised without a new SQL migration.
      sheetName: "KPI Targets Data", table: "kpi_targets", dateFields: [],
      upsertKey: "metric_id",
      fields: {
        "Metric ID": "metric_id", "Metric Label": "metric_label",
        "Target Value": "target_value", "Direction": "direction", "Unit": "unit",
      },
    }],
  },
  {
    id: "probation_pip", fileLabel: "16 — Probation & PIP",
    sheets: [
      {
        // Delete+insert, not upserted — a point-in-time roster snapshot
        // (see 20_probation_pip.sql), same reasoning as Succession Planning.
        sheetName: "Probation Reviews Data", table: "probation_reviews",
        dateFields: ["probation_start_date", "review_date"],
        fields: {
          "Employee ID": "employee_id", "Probation Start Date": "probation_start_date",
          "Review Date": "review_date", "Outcome": "outcome",
        },
      },
      {
        sheetName: "PIP Records Data", table: "pip_records", dateFields: ["pip_start_date"],
        fields: {
          "Employee ID": "employee_id", "PIP Start Date": "pip_start_date", "Reason": "reason",
          "Month 3 Status": "month3_status", "Month 6 Status": "month6_status",
        },
      },
    ],
  },
  {
    id: "enps", fileLabel: "18 — Employee Satisfaction",
    sheets: [
      {
        // Delete+insert, not upserted — a point-in-time roster snapshot
        // (see 21_enps.sql), same reasoning as Succession Planning/
        // Probation & PIP.
        sheetName: "Exit Surveys Data", table: "exit_surveys", dateFields: ["survey_date"],
        fields: {
          "Employee ID": "employee_id", "Survey Date": "survey_date", "eNPS Score": "enps_score",
          "eNPS Category": "enps_category", "Would Recommend": "would_recommend",
        },
      },
      {
        sheetName: "Stage Gate Scores Data", table: "stage_gate_scores", dateFields: ["score_date"],
        fields: {
          "Employee ID": "employee_id", "Stage": "stage", "Score": "score", "Score Date": "score_date",
        },
      },
    ],
  },
  {
    id: "headcount_forecast", fileLabel: "19 — Headcount Forecast",
    sheets: [{
      // Upserted by (period, division), not delete+insert — a rolling
      // forecast that gets regenerated periodically should only touch the
      // periods/divisions in that upload (see 22_headcount_forecast.sql),
      // same reasoning as payroll's (employee_id, period) key. No "Actual"
      // sheet here — Actual headcount is computed live from
      // employee_master, same as headcount.js's own trend chart.
      sheetName: "Headcount Forecast Data", table: "headcount_forecast", dateFields: ["period"],
      upsertKey: "period,division",
      fields: {
        "Period": "period", "Division": "division", "Forecast Headcount": "forecast_headcount",
        "Lower Bound": "lower_bound", "Upper Bound": "upper_bound",
      },
    }],
  },
  {
    id: "initiatives", fileLabel: "20 — Initiatives",
    sheets: [{
      // Small tracker table (see 23_phase_l.sql) — upserted by name, same
      // reasoning as kpi_targets/budgeted_positions. No source Database/*.xlsx
      // workbook exists for this one either (seeded directly by the
      // migration's INSERT); this card exists so initiatives can be revised
      // without a new SQL migration.
      sheetName: "Initiatives Data", table: "initiatives", dateFields: [],
      upsertKey: "name",
      fields: { "Name": "name", "Status": "status" },
    }],
  },
];

function toIsoDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return String(v).trim() || null;
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function parseSheet(workbook, sheetSpec) {
  const sheet = workbook.Sheets[sheetSpec.sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetSpec.sheetName}" not found in this file.`);
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const dateFields = new Set(sheetSpec.dateFields || []);
  return rawRows.map((row) => {
    const out = {};
    for (const [excelHeader, dbField] of Object.entries(sheetSpec.fields)) {
      let v = row[excelHeader];
      if (v === "") v = null;
      out[dbField] = dateFields.has(dbField) ? toIsoDate(v) : v;
    }
    return out;
  });
}

function fmtTimestamp(iso) {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function render({ contentEl }) {
  contentEl.innerHTML = "";

  const historyWrap = document.createElement("div");
  historyWrap.className = "card";
  historyWrap.innerHTML = `<h3>Last Updated</h3><div class="admin-loading">Loading history…</div>`;
  contentEl.appendChild(historyWrap);

  const unitsWrap = document.createElement("div");
  unitsWrap.className = "grid-2";
  contentEl.appendChild(unitsWrap);

  loadHistory();
  UPLOAD_UNITS.forEach((unit) => buildUnitCard(unitsWrap, unit));

  async function loadHistory() {
    const client = getClient();
    const { data, error } = await client.from("data_refresh_log").select("*").order("uploaded_at", { ascending: false });
    if (error) {
      historyWrap.innerHTML = `<h3>Last Updated</h3><div class="note-banner"><b>Failed to load history:</b> ${error.message}</div>`;
      return;
    }
    const latestByTable = new Map();
    for (const row of data) {
      if (!latestByTable.has(row.table_name)) latestByTable.set(row.table_name, row);
    }
    const allTables = UPLOAD_UNITS.flatMap((u) => u.sheets.map((s) => s.table));
    const rows = allTables.map((table) => {
      const log = latestByTable.get(table);
      return {
        table,
        uploaded_at: log ? fmtTimestamp(log.uploaded_at) : "Never updated",
        row_count: log ? log.row_count : "—",
        uploaded_by: log ? log.uploaded_by || "—" : "—",
      };
    });
    historyWrap.innerHTML = `<h3>Last Updated</h3>`;
    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = `<thead><tr><th>Table</th><th>Last Updated</th><th class="num">Rows</th><th>By</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    tbody.innerHTML = rows.map((r) => `<tr><td>${r.table}</td><td>${r.uploaded_at}</td><td class="num">${r.row_count}</td><td>${r.uploaded_by}</td></tr>`).join("");
    table.appendChild(tbody);
    const tableWrapEl = document.createElement("div");
    tableWrapEl.className = "data-table-wrap open";
    tableWrapEl.appendChild(table);
    historyWrap.appendChild(tableWrapEl);
  }

  function buildUnitCard(container, unit) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${unit.fileLabel}</h3>
      <div class="card-sub">${unit.sheets.map((s) => s.table).join(", ")}</div>
      <input type="file" accept=".xlsx,.xls" class="refresh-file-input">
      <div class="refresh-preview"></div>
    `;
    container.appendChild(card);

    const fileInput = card.querySelector(".refresh-file-input");
    const previewEl = card.querySelector(".refresh-preview");

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      previewEl.innerHTML = `<div class="admin-loading">Parsing ${file.name}…</div>`;
      try {
        const buffer = await readFileAsArrayBuffer(file);
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const parsed = unit.sheets.map((s) => ({ spec: s, rows: parseSheet(workbook, s) }));
        await showPreview(unit, parsed, previewEl, fileInput);
      } catch (err) {
        previewEl.innerHTML = `<div class="note-banner"><b>Couldn't read this file:</b> ${err.message}</div>`;
      }
    });
  }

  async function showPreview(unit, parsed, previewEl, fileInput) {
    const client = getClient();
    const summaries = await Promise.all(parsed.map(async ({ spec, rows }) => {
      const { count } = await client.from(spec.table).select("*", { count: "exact", head: true });
      return { table: spec.table, currentCount: count ?? 0, newCount: rows.length, sample: rows.slice(0, 3) };
    }));

    const anyUpsert = parsed.some(({ spec }) => spec.upsertKey);
    const anyReplace = parsed.some(({ spec }) => !spec.upsertKey);
    previewEl.innerHTML = `
      ${anyReplace ? `<div class="note-banner"><b>This will fully replace</b> the table(s) below — existing rows are deleted, then the parsed file's rows are inserted.</div>` : ""}
      ${anyUpsert ? `<div class="note-banner"><b>This will update in place</b> — existing rows are matched by their key and updated, new rows are added. Rows removed from the file are left untouched (not deleted), since other data may still reference them.</div>` : ""}
      ${summaries.map((s) => `
        <div class="refresh-summary">
          <b>${s.table}:</b> ${s.currentCount} current rows → ${s.newCount} rows in this file
        </div>
      `).join("")}
      <div class="progress-wrap" style="display:none">
        <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>
        <div class="progress-label"></div>
      </div>
      <div class="card-actions">
        <button class="modal-export-btn confirm-replace-btn">Confirm & Upload</button>
        <button class="table-toggle cancel-replace-btn">Cancel</button>
      </div>
    `;

    previewEl.querySelector(".cancel-replace-btn").addEventListener("click", () => {
      previewEl.innerHTML = "";
      fileInput.value = "";
    });

    previewEl.querySelector(".confirm-replace-btn").addEventListener("click", async () => {
      const progressWrap = previewEl.querySelector(".progress-wrap");
      const progressFill = previewEl.querySelector(".progress-fill");
      const progressLabel = previewEl.querySelector(".progress-label");
      const actionsRow = previewEl.querySelector(".card-actions");
      actionsRow.style.display = "none";
      progressWrap.style.display = "block";

      try {
        await commitReplace(parsed, (frac, label) => {
          progressFill.style.width = `${Math.round(frac * 100)}%`;
          progressLabel.textContent = label;
        });
        const stamp = fmtTimestamp(new Date().toISOString());
        progressLabel.textContent = `Upload successful — ${stamp}`;
        loadHistory();
      } catch (err) {
        progressLabel.textContent = `Failed: ${err.message}`;
      }
    });
  }

  async function commitReplace(parsed, onProgress) {
    const client = getClient();
    const { data: userData } = await client.auth.getUser();
    const uploadedBy = userData?.user?.email || null;

    const totalRows = parsed.reduce((s, p) => s + p.rows.length, 0) || 1;
    let doneRows = 0;
    onProgress(0, "Starting…");

    for (const { spec, rows } of parsed) {
      const batchSize = 500;

      if (spec.upsertKey) {
        onProgress(doneRows / totalRows, `Updating ${spec.table}…`);
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { error: upError } = await client.from(spec.table).upsert(batch, { onConflict: spec.upsertKey });
          if (upError) throw new Error(`Failed to update ${spec.table} (rows ${i + 1}-${i + batch.length}): ${upError.message}`);
          doneRows += batch.length;
          onProgress(doneRows / totalRows, `Updating ${spec.table}: ${doneRows}/${totalRows} rows…`);
        }
      } else {
        onProgress(doneRows / totalRows, `Clearing ${spec.table}…`);
        const pkField = Object.values(spec.fields)[0];
        const { error: delError } = await client.from(spec.table).delete().not(pkField, "is", null);
        if (delError) throw new Error(`Failed to clear ${spec.table}: ${delError.message}`);

        if (rows.length === 0) continue;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { error: insError } = await client.from(spec.table).insert(batch);
          if (insError) throw new Error(`Failed to insert into ${spec.table} (rows ${i + 1}-${i + batch.length}): ${insError.message}`);
          doneRows += batch.length;
          onProgress(doneRows / totalRows, `Uploading ${spec.table}: ${doneRows}/${totalRows} rows…`);
        }
      }

      await client.from("data_refresh_log").insert({ table_name: spec.table, row_count: rows.length, uploaded_by: uploadedBy });
    }

    onProgress(1, "Done.");
  }
}
