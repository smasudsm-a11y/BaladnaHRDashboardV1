$ErrorActionPreference = "Stop"
$Dir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\HR Reports"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"
$TODAY = Get-Date

function ToDateStr($oaDate) {
    if ($null -eq $oaDate -or "$oaDate" -eq "") { return "" }
    try { return ([DateTime]::FromOADate([double]$oaDate)).ToString("yyyy-MM-dd") } catch { return "" }
}
function ToIntStr($v) {
    if ($null -eq $v -or "$v" -eq "") { return "" }
    try { return ([int64][double]$v).ToString() } catch { return "$v".Trim() }
}
function Norm($v) { if ($null -eq $v) { return "" }; return "$v".Trim() }
function GradeToG($gradeLabel) {
    if ("$gradeLabel" -match 'Grade-(\d+)') { return "G$($Matches[1])" }
    return Norm $gradeLabel
}
function GradeTier($gradeLabel) {
    if ("$gradeLabel" -notmatch 'Grade-(\d+)') { return "" }
    $n = [int]$Matches[1]
    if ($n -ge 1 -and $n -le 4) { return "Junior" }
    if ($n -ge 5 -and $n -le 8) { return "Mid" }
    if ($n -ge 9 -and $n -le 12) { return "Senior" }
    if ($n -ge 13 -and $n -le 14) { return "Executive" }
    if ($n -eq 15) { return "Specialist/Supervisor" }
    if ($n -ge 16 -and $n -le 18) { return "Managerial" }
    if ($n -ge 19 -and $n -le 20) { return "Director" }
    if ($n -ge 21 -and $n -le 22) { return "Chief" }
    if ($n -ge 23 -and $n -le 24) { return "CEO/Group CEO" }
    return ""
}
function AgeBand($age) {
    if (-not $age) { return "" }
    $n = [int]$age
    if ($n -lt 25) { return "<25" }
    if ($n -le 34) { return "25-34" }
    if ($n -le 44) { return "35-44" }
    if ($n -le 54) { return "45-54" }
    return "55+"
}
function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

function Read-SapSheet($fname) {
    $p = Join-Path $Dir $fname
    $wb = $excel.Workbooks.Open($p, $null, $true)
    $ws = $wb.Worksheets.Item(1)
    $used = $ws.UsedRange
    $rows = $used.Rows.Count
    $cols = $used.Columns.Count
    $hh = @{}
    for ($c = 1; $c -le $cols; $c++) {
        $t = "$($ws.Cells.Item(3, $c).Value2)".Trim()
        if ($t -and -not $hh.ContainsKey($t)) { $hh[$t] = $c }
    }
    $d = $used.Value2
    $wb.Close($false)
    return @{ headers = $hh; data = $d; rows = $rows }
}

Write-Host "Reading Position Data (for job_family)..."
$pos = Read-SapSheet "Position_Data-Ever-Component1 (1).xlsx"
$posIdx = @{}
for ($r = 4; $r -le $pos.rows; $r++) {
    $pn = ToIntStr $pos.data[$r, $pos.headers["Position No."]]
    if ($pn -and -not $posIdx.ContainsKey($pn)) {
        $posIdx[$pn] = Norm $pos.data[$r, $pos.headers["Jobfamily (Label)"]]
    }
}

Write-Host "Reading Termination Request Status..."
$trs = Read-SapSheet "TerminationRequestStatus-Component1.xlsx"
$trsIdx = @{}
for ($r = 4; $r -le $trs.rows; $r++) {
    if ((Norm $trs.data[$r, $trs.headers["Status"]]) -ne "COMPLETED") { continue }
    $eid = ToIntStr $trs.data[$r, $trs.headers["Employee Number"]]
    if (-not $eid) { continue }
    $trsIdx[$eid] = @{
        voluntary = Norm $trs.data[$r, $trs.headers["Separation Type (Picklist Label)"]]
        reason    = Norm $trs.data[$r, $trs.headers["Termination Reason (Picklist Label)"]]
        lwd       = ToDateStr $trs.data[$r, $trs.headers["Last Working Date"]]
    }
}
Write-Host "  $($trsIdx.Count) completed termination requests"

Write-Host "Reading Resignation Status..."
$rst = Read-SapSheet "Resignation_Status-Page1-Component1.xlsx"
$rstIdx = @{}
for ($r = 4; $r -le $rst.rows; $r++) {
    if ((Norm $rst.data[$r, $rst.headers["Status"]]) -ne "COMPLETED") { continue }
    if ((Norm $rst.data[$r, $rst.headers["Withdrawal of Resignation (Picklist Label)"]]) -eq "Yes") { continue }
    $eid = ToIntStr $rst.data[$r, $rst.headers["User"]]
    if (-not $eid) { continue }
    $rstIdx[$eid] = @{
        reason = Norm $rst.data[$r, $rst.headers["Resignation Reason (Picklist Label)"]]
        lwd    = ToDateStr $rst.data[$r, $rst.headers["Approved Last Working Date"]]
    }
}
Write-Host "  $($rstIdx.Count) completed non-withdrawn resignations"

Write-Host "Reading Master List..."
$ml = Read-SapSheet "BaladnaEmployeeMasterList_1_Comp_Details_ALL-Component1 (9).xlsx"
$h = $ml.headers; $data = $ml.data

$orgRows = New-Object System.Collections.Generic.List[object]
$attrRows = New-Object System.Collections.Generic.List[object]
$divRows = New-Object System.Collections.Generic.List[object]

$countAttrTrs = 0; $countAttrRst = 0; $countAttrFallback = 0

for ($r = 4; $r -le $ml.rows; $r++) {
    $country = Norm $data[$r, $h["Country"]]
    if ($country -ne "Qatar" -and $country -ne "Egypt") { continue }
    $empId = ToIntStr $data[$r, $h["Employee Number"]]
    if (-not $empId) { continue }

    $posNo = ToIntStr $data[$r, $h["Position Number"]]
    $func = $(if ($posNo -and $posIdx.ContainsKey($posNo)) { $posIdx[$posNo] } else { "" })
    $dept = Norm $data[$r, $h["Department"]]
    $gradeLabel = Norm $data[$r, $h["Grade"]]
    $age = ToIntStr $data[$r, $h["Age"]]

    # org_hierarchy
    $orgRows.Add(@(
        $empId,
        (ToIntStr $data[$r, $h["Immediate Supervisor Employee Number"]]),
        (Norm $data[$r, $h["Immediate Supervisor"]]),
        (Norm $data[$r, $h["Assignment Manager"]]),
        (Norm $data[$r, $h["Head of Department"]]),
        (Norm $data[$r, $h["Functional Manager"]]),
        "",
        $dept,
        (Norm $data[$r, $h["Division"]]),
        $func,
        (ToIntStr $data[$r, $h["Cost Center Code"]])
    ))

    # diversity
    $divRows.Add(@(
        $empId,
        (Norm $data[$r, $h["Gender"]]),
        (Norm $data[$r, $h["Nationality"]]),
        "",
        $age,
        (AgeBand $age),
        "",
        (GradeToG $gradeLabel),
        (GradeTier $gradeLabel),
        ""
    ))

    # attrition -- only terminated employees
    $empStatus = Norm $data[$r, $h["Employee Status"]]
    if ($empStatus -ne "Terminated") { continue }

    $hireDateStr = ToDateStr $data[$r, $h["Actual Date of Joining"]]
    $termDateStr = ""; $reason = ""; $voluntary = ""

    if ($trsIdx.ContainsKey($empId)) {
        $countAttrTrs++
        $info = $trsIdx[$empId]
        $termDateStr = $info.lwd
        $reason = $info.reason
        $voluntary = $info.voluntary
    } elseif ($rstIdx.ContainsKey($empId)) {
        $countAttrRst++
        $info = $rstIdx[$empId]
        $termDateStr = $info.lwd
        $reason = $info.reason
        $voluntary = "Voluntary"
    } else {
        $countAttrFallback++
        $termDateStr = ToDateStr $data[$r, $h["Separation Date"]]
        $reason = Norm $data[$r, $h["Reason For Separation"]]
        $voluntary = ""
    }
    if (-not $termDateStr) { $termDateStr = ToDateStr $data[$r, $h["Separation Date"]] }

    $tenure = ""
    if ($hireDateStr -and $termDateStr) {
        try {
            $hd = [DateTime]::Parse($hireDateStr); $td = [DateTime]::Parse($termDateStr)
            $tenure = [Math]::Round((($td - $hd).TotalDays) / 365.25, 1)
        } catch {}
    }

    $attrRows.Add(@(
        $empId,
        $hireDateStr,
        $termDateStr,
        $reason,
        $voluntary,
        $dept,
        (GradeToG $gradeLabel),
        (Norm $data[$r, $h["Immediate Supervisor"]]),
        (Norm $data[$r, $h["Gender"]]),
        $age,
        $tenure
    ))
}

WriteCsv (Join-Path $Scratch "org_hierarchy_new.csv") @("employee_id","manager_id","manager_name","level1_leader","level2_leader","level3_leader","ceo_hierarchy_level","department","division","function","cost_center") $orgRows
WriteCsv (Join-Path $Scratch "diversity_new.csv") @("employee_id","gender","nationality","ethnicity","age","age_band","disability_status","grade","management_level","leadership_status") $divRows
WriteCsv (Join-Path $Scratch "attrition_new.csv") @("employee_id","hire_date","termination_date","termination_reason","voluntary_involuntary","department","grade","manager","gender","age","tenure") $attrRows

Write-Host "org_hierarchy rows: $($orgRows.Count)"
Write-Host "diversity rows: $($divRows.Count)"
Write-Host "attrition rows: $($attrRows.Count)  (from TRS: $countAttrTrs, from Resignation: $countAttrRst, fallback to Master List: $countAttrFallback)"

# --- leave ---
Write-Host "Reading Leave Requests..."
$emIndex = @{}
Import-Csv (Join-Path $Scratch "employee_master_new.csv") | ForEach-Object {
    $emIndex[$_.employee_id] = @{ department = $_.department; manager = $_.line_manager_name }
}
$lr = Read-SapSheet "EmployeeLeaveRequests1-Component1.xlsx"
$lh = $lr.headers; $ld = $lr.data
# headers have trailing newlines from the source export -- match by trimmed prefix
$colTimeType = ($lh.Keys | Where-Object { $_ -like "Time Type Label*" } | Select-Object -First 1)
$colStart    = ($lh.Keys | Where-Object { $_ -like "Start Date*" } | Select-Object -First 1)
$colEnd      = ($lh.Keys | Where-Object { $_ -like "End Date*" } | Select-Object -First 1)

$leaveRows = New-Object System.Collections.Generic.List[object]
for ($r = 4; $r -le $lr.rows; $r++) {
    $eid = ToIntStr $ld[$r, $lh["Employee ID"]]
    if (-not $eid -or -not $emIndex.ContainsKey($eid)) { continue }
    $startStr = ToDateStr $ld[$r, $lh[$colStart]]
    $endStr = ToDateStr $ld[$r, $lh[$colEnd]]
    $days = ""
    if ($startStr -and $endStr) {
        try { $days = ([DateTime]::Parse($endStr) - [DateTime]::Parse($startStr)).TotalDays + 1 } catch {}
    }
    $emp = $emIndex[$eid]
    $leaveRows.Add(@(
        $eid,
        (Norm $ld[$r, $lh[$colTimeType]]),
        $startStr,
        $endStr,
        $days,
        (Norm $ld[$r, $lh["Approval Status"]]),
        "",
        $emp.department,
        $emp.manager
    ))
}
WriteCsv (Join-Path $Scratch "leave_new.csv") @("employee_id","leave_type","leave_start_date","leave_end_date","leave_days","leave_status","leave_balance","department","manager") $leaveRows
Write-Host "leave rows: $($leaveRows.Count) (of $($lr.rows - 3) total leave requests)"

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
