$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\scripts\sap-migration"
$OutDir = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad\workbooks"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

# Writes one CSV's rows into one worksheet, mapping db-field CSV headers to
# the exact Excel header text data-refresh.js's `fields` map expects.
# Date-field columns are written as literal Text (NumberFormat "@") BEFORE
# assignment -- same gotcha as build_ctc_workbook.ps1's own Write-SheetFromRows:
# Excel auto-converts an "2024-04-01"-looking string to a date serial on
# write, and reading it back shifts it a day. Text sidesteps that path
# entirely, and data-refresh.js's toIsoDate() returns a plain string
# unchanged.
function Write-Sheet($ws, $csvPath, [System.Collections.Specialized.OrderedDictionary]$fieldToHeader, [string[]]$dateFields) {
    $rows = @(Import-Csv $csvPath)
    $dbFields = @($fieldToHeader.Keys)
    $headers = @($fieldToHeader.Values)
    $colCount = $headers.Count
    $rowCount = $rows.Count

    $textCols = New-Object System.Collections.Generic.List[int]
    for ($c = 0; $c -lt $colCount; $c++) {
        if ($dateFields -contains $dbFields[$c]) { $textCols.Add($c) }
    }
    foreach ($colIdx in $textCols) { $ws.Columns.Item($colIdx + 1).NumberFormat = "@" }

    $arr = New-Object 'object[,]' ($rowCount + 1), $colCount
    for ($c = 0; $c -lt $colCount; $c++) { $arr[0, $c] = $headers[$c] }
    for ($r = 0; $r -lt $rowCount; $r++) {
        for ($c = 0; $c -lt $colCount; $c++) {
            $val = $rows[$r].($dbFields[$c])
            if ($null -eq $val) { $val = "" }
            $isTextCol = $textCols.Contains($c)
            if (-not $isTextCol -and "$val" -match '^-?\d+(\.\d+)?$') {
                $arr[($r + 1), $c] = [double]$val
            } else {
                $arr[($r + 1), $c] = "$val"
            }
        }
    }
    if ($rowCount -gt 0) {
        $range = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($rowCount + 1, $colCount))
        $range.Value2 = $arr
    } else {
        for ($c = 0; $c -lt $colCount; $c++) { $ws.Cells.Item(1, $c + 1).Value2 = $headers[$c] }
    }
    return $rowCount
}

function OD([string[]]$pairs) {
    # pairs: alternating dbField, header, dbField, header, ...
    $d = New-Object System.Collections.Specialized.OrderedDictionary
    for ($i = 0; $i -lt $pairs.Count; $i += 2) { $d[$pairs[$i]] = $pairs[$i + 1] }
    return $d
}

function NewWorkbook($sheetSpecs, $outName) {
    # sheetSpecs: array of @{ sheetName; csv; fields; dates }
    $wb = $excel.Workbooks.Add()
    while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }
    for ($i = 0; $i -lt $sheetSpecs.Count; $i++) {
        $spec = $sheetSpecs[$i]
        $ws = if ($i -eq 0) { $wb.Worksheets.Item(1) } else { $wb.Worksheets.Add([System.Reflection.Missing]::Value, $wb.Worksheets.Item($wb.Worksheets.Count)) }
        $ws.Name = $spec.sheetName
        $n = Write-Sheet $ws (Join-Path $Scratch $spec.csv) $spec.fields $spec.dates
        Write-Host "  $($spec.sheetName): $n rows"
    }
    $outPath = Join-Path $OutDir $outName
    $wb.SaveAs($outPath, 51)  # 51 = xlOpenXMLWorkbook (.xlsx)
    $wb.Close($false)
    Write-Host "Saved $outName"
}

Write-Host "=== 01 - Employee Master ==="
NewWorkbook @(@{
    sheetName = "Employee Master Data"; csv = "employee_master_draft.csv"
    dates = @("date_of_birth","hire_date","confirmation_date","termination_date")
    fields = OD @(
        "employee_id","Employee ID","employee_number","Employee Number","employee_name","Employee Name",
        "preferred_name","Preferred Name","gender","Gender","nationality","Nationality",
        "date_of_birth","Date of Birth","age","Age","marital_status","Marital Status",
        "employment_status","Employment Status","employee_type","Employee Type",
        "full_time_part_time","Full Time / Part Time","hire_date","Hire Date",
        "confirmation_date","Confirmation Date","termination_date","Termination Date",
        "termination_reason","Termination Reason","length_of_service","Length of Service",
        "legal_entity","Legal Entity","business_unit","Business Unit","department","Department",
        "division","Division","section","Section","cost_center","Cost Center",
        "position_id","Position ID","position_title","Position Title","job_family","Job Family",
        "job_grade","Job Grade","job_level","Job Level","line_manager_id","Line Manager ID",
        "line_manager_name","Line Manager Name","location","Location","country","Country",
        "city","City","employment_category","Employment Category","workforce_category","Workforce Category"
    )
}) "01_Employee_Master.xlsx"

Write-Host "=== 02 - Org Hierarchy ==="
NewWorkbook @(@{
    sheetName = "Org Hierarchy Data"; csv = "org_hierarchy_draft.csv"; dates = @()
    fields = OD @(
        "employee_id","Employee ID","manager_id","Manager ID","manager_name","Manager Name",
        "level1_leader","Level 1 Leader","level2_leader","Level 2 Leader","level3_leader","Level 3 Leader",
        "ceo_hierarchy_level","CEO Hierarchy Level","department","Department","division","Division",
        "function","Function","cost_center","Cost Center"
    )
}) "02_Organizational_Hierarchy.xlsx"

Write-Host "=== 05 - Diversity ==="
NewWorkbook @(@{
    sheetName = "Diversity Data"; csv = "diversity_draft.csv"; dates = @()
    fields = OD @(
        "employee_id","Employee ID","gender","Gender","nationality","Nationality",
        "ethnicity","Ethnicity (if available)","age","Age","age_band","Age Band",
        "disability_status","Disability Status","grade","Grade","management_level","Management Level",
        "leadership_status","Leadership Status"
    )
}) "05_Diversity_Dashboard.xlsx"

Write-Host "=== 06 - Attrition ==="
NewWorkbook @(@{
    sheetName = "Attrition Data"; csv = "attrition_draft.csv"; dates = @("hire_date","termination_date")
    fields = OD @(
        "employee_id","Employee ID","hire_date","Hire Date","termination_date","Termination Date",
        "termination_reason","Termination Reason","voluntary_involuntary","Voluntary / Involuntary",
        "department","Department","grade","Grade","manager","Manager","gender","Gender",
        "age","Age","tenure","Tenure"
    )
}) "06_Attrition_Dashboard.xlsx"

Write-Host "=== 07 - Compensation (3 sheets) ==="
NewWorkbook @(
    @{
        sheetName = "Base Salary Data"; csv = "base_salary_draft.csv"; dates = @("salary_effective_date")
        fields = OD @("employee_id","Employee ID","grade","Grade","position","Position","base_salary","Base Salary","currency","Currency","salary_effective_date","Salary Effective Date")
    },
    @{
        sheetName = "Total Rewards Data"; csv = "total_rewards_draft.csv"; dates = @("salary_effective_date")
        fields = OD @(
            "employee_id","Employee ID","salary_effective_date","Salary Effective Date",
            "housing_allowance","Housing Allowance","transport_allowance","Transport Allowance",
            "education_allowance","Education Allowance","other_allowances","Other Allowances",
            "variable_pay","Variable Pay","bonus","Bonus","incentive","Incentive",
            "total_cash_compensation","Total Cash Compensation","total_remuneration","Total Remuneration"
        )
    },
    @{
        sheetName = "Salary Structure Data"; csv = "salary_structure_draft.csv"; dates = @()
        fields = OD @(
            "grade","Grade","job_family","Job Family","currency","Currency",
            "salary_range_min","Salary Range Minimum","salary_midpoint","Salary Midpoint",
            "salary_range_max","Salary Range Maximum","grade_tier","Grade Tier"
        )
    }
) "07_Compensation_Dashboard.xlsx"

Write-Host "=== 08 - Leave ==="
NewWorkbook @(@{
    sheetName = "Leave Data"; csv = "leave_draft.csv"; dates = @("leave_start_date","leave_end_date")
    fields = OD @(
        "employee_id","Employee ID","leave_type","Leave Type","leave_start_date","Leave Start Date",
        "leave_end_date","Leave End Date","leave_days","Leave Days","leave_status","Leave Status",
        "leave_balance","Leave Balance","department","Department","manager","Manager"
    )
}) "08_Leave_Dashboard.xlsx"

Write-Host "=== 09 - Absenteeism ==="
NewWorkbook @(@{
    sheetName = "Absenteeism Data"; csv = "absenteeism_draft.csv"; dates = @("absence_date")
    fields = OD @(
        "employee_id","Employee ID","absence_date","Absence Date","absence_type","Absence Type",
        "absence_hours","Absence Hours","paid_unpaid","Paid / Unpaid","department","Department",
        "manager","Manager","approval_status","Approval Status"
    )
}) "09_Absenteeism_Dashboard.xlsx"

Write-Host "=== 10 - Performance ==="
NewWorkbook @(@{
    sheetName = "Performance Data"; csv = "performance_draft.csv"; dates = @("rating_date")
    fields = OD @(
        "employee_id","Employee ID","performance_cycle","Performance Cycle","goal_score","Goal Score",
        "competency_score","Competency Score","overall_rating","Overall Rating","rating_date","Rating Date",
        "manager_rating","Manager Rating","calibration_rating","Calibration Rating",
        "promotion_recommendation","Promotion Recommendation"
    )
}) "10_Performance_Dashboard.xlsx"

Write-Host "=== 11 - Training ==="
NewWorkbook @(@{
    sheetName = "Training Data"; csv = "training_draft.csv"; dates = @("completion_date","expiry_date","required_date")
    fields = OD @(
        "employee_id","Employee ID","course_name","Course Name","training_category","Training Category",
        "training_hours","Training Hours","training_cost","Training Cost","completion_status","Completion Status",
        "completion_date","Completion Date","certification_achieved","Certification Achieved",
        "expiry_date","Expiry Date","compliance_status","Compliance Status","required_date","Required Date"
    )
}) "11_Learning_Training_Dashboard.xlsx"

Write-Host "=== 13a - Cost Centers ==="
NewWorkbook @(@{
    sheetName = "Cost Centers Data"; csv = "cost_centers_draft.csv"; dates = @()
    fields = OD @("cost_center","Cost Center","division","Division","department","Department")
}) "13a_CTC_Cost_Centers.xlsx"

Write-Host "=== 14 - Payroll ==="
NewWorkbook @(@{
    sheetName = "Payroll Data"; csv = "payroll_draft.csv"; dates = @("period")
    fields = OD @(
        "employee_id","Employee ID","period","Period","gross_salary","Gross Salary",
        "overtime_amount","Overtime Amount","total_deductions","Total Deductions",
        "air_ticket_cost","Air Ticket Cost","net_pay","Net Pay","annual_leave_cost","Annual Leave Cost"
    )
}) "14_Payroll_Report.xlsx"

Write-Host "=== 15 - Succession (3 sheets) ==="
NewWorkbook @(
    @{
        sheetName = "Critical Positions Data"; csv = "critical_positions_draft.csv"; dates = @()
        fields = OD @(
            "position_id","Position ID","position_title","Position Title","department","Department",
            "division","Division","business_unit","Business Unit","job_grade","Job Grade","criticality","Criticality"
        )
    },
    @{
        sheetName = "Incumbents Data"; csv = "incumbents_draft.csv"; dates = @()
        fields = OD @("position_id","Position ID","employee_id","Employee ID","time_in_role_years","Time in Role (Years)","retirement_risk","Retirement Risk")
    },
    @{
        sheetName = "Successors Data"; csv = "successors_draft.csv"; dates = @()
        fields = OD @("position_id","Position ID","successor_employee_id","Successor Employee ID","readiness","Readiness","is_high_potential","Is High Potential")
    }
) "15_Succession_Planning.xlsx"

Write-Host "=== 16 - Budgeted Positions ==="
NewWorkbook @(@{
    sheetName = "Budgeted Positions Data"; csv = "budgeted_positions_draft.csv"; dates = @()
    fields = OD @("department","Department","budgeted_headcount","Budgeted Headcount")
}) "16_Budgeted_Positions.xlsx"

Write-Host "=== 16 - Probation and PIP (2 sheets) ==="
NewWorkbook @(
    @{
        sheetName = "Probation Reviews Data"; csv = "probation_reviews_draft.csv"; dates = @("probation_start_date","review_date")
        fields = OD @("employee_id","Employee ID","probation_start_date","Probation Start Date","review_date","Review Date","outcome","Outcome")
    },
    @{
        sheetName = "PIP Records Data"; csv = "pip_records_draft.csv"; dates = @("pip_start_date")
        fields = OD @("employee_id","Employee ID","pip_start_date","PIP Start Date","reason","Reason","month3_status","Month 3 Status","month6_status","Month 6 Status")
    }
) "16_Probation_PIP.xlsx"

Write-Host "=== 18 - Employee Satisfaction (2 sheets) ==="
NewWorkbook @(
    @{
        sheetName = "Exit Surveys Data"; csv = "exit_surveys_draft.csv"; dates = @("survey_date")
        fields = OD @("employee_id","Employee ID","survey_date","Survey Date","enps_score","eNPS Score","enps_category","eNPS Category","would_recommend","Would Recommend")
    },
    @{
        sheetName = "Stage Gate Scores Data"; csv = "stage_gate_scores_draft.csv"; dates = @("score_date")
        fields = OD @("employee_id","Employee ID","stage","Stage","score","Score","score_date","Score Date")
    }
) "17_Employee_Satisfaction.xlsx"

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
Write-Host ""
Write-Host "All workbooks written to $OutDir"
