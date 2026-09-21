$ErrorActionPreference = "Stop"
$Dir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\HR Reports"
$OutPath = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad\employee_master_new.csv"
$LogPath = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad\employee_master_build.log"

$TODAY = Get-Date

function ToDateStr($oaDate) {
    if ($null -eq $oaDate -or "$oaDate" -eq "") { return "" }
    try { return ([DateTime]::FromOADate([double]$oaDate)).ToString("yyyy-MM-dd") } catch { return "" }
}
function ToIntStr($v) {
    if ($null -eq $v -or "$v" -eq "") { return "" }
    try { return ([int64][double]$v).ToString() } catch { return "$v".Trim() }
}
function Norm($v) {
    if ($null -eq $v) { return "" }
    return "$v".Trim()
}
function GradeToG($gradeLabel) {
    # "Grade-13" -> "G13"
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
function CsvEscape($v) {
    $s = "$v"
    $s = $s -replace '"', '""'
    return '"' + $s + '"'
}

Write-Host "Reading Personal Information CSV..."
$personalInfo = @{}
Import-Csv (Join-Path $Dir "report_Personal_Information.csv") | ForEach-Object {
    $id = Norm $_.'User/Employee ID'
    if ($id) { $personalInfo[$id] = $_.'Marital Status' }
}
Write-Host "  $($personalInfo.Count) rows"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

function Read-SapSheet($fname) {
    $path = Join-Path $Dir $fname
    $wb = $excel.Workbooks.Open($path, $null, $true)
    $ws = $wb.Worksheets.Item(1)
    $used = $ws.UsedRange
    $rows = $used.Rows.Count
    $cols = $used.Columns.Count
    $headers = @{}
    for ($c = 1; $c -le $cols; $c++) {
        $h = "$($ws.Cells.Item(3, $c).Value2)".Trim()
        if ($h -and -not $headers.ContainsKey($h)) { $headers[$h] = $c }
    }
    $data = $used.Value2
    $wb.Close($false)
    return @{ headers = $headers; data = $data; rows = $rows; cols = $cols }
}

Write-Host "Reading Position Data..."
$posSheet = Read-SapSheet "Position_Data-Ever-Component1 (1).xlsx"
$posIndex = @{}
for ($r = 4; $r -le $posSheet.rows; $r++) {
    $posNo = ToIntStr $posSheet.data[$r, $posSheet.headers["Position No."]]
    if (-not $posNo) { continue }
    if (-not $posIndex.ContainsKey($posNo)) {
        $posIndex[$posNo] = @{
            jobFamily = Norm $posSheet.data[$r, $posSheet.headers["Jobfamily (Label)"]]
            location  = Norm $posSheet.data[$r, $posSheet.headers["Location"]]
        }
    }
}
Write-Host "  $($posIndex.Count) distinct positions indexed"

Write-Host "Reading Master List..."
$ml = Read-SapSheet "BaladnaEmployeeMasterList_1_Comp_Details_ALL-Component1 (9).xlsx"
$h = $ml.headers
$data = $ml.data

$outHeader = @("employee_id","employee_number","employee_name","preferred_name","gender","nationality","date_of_birth","age","marital_status","employment_status","employee_type","full_time_part_time","hire_date","confirmation_date","termination_date","termination_reason","length_of_service","legal_entity","business_unit","department","division","section","cost_center","position_id","position_title","job_family","job_grade","job_level","line_manager_id","line_manager_name","location","country","city","employment_category","workforce_category")

$outRows = New-Object System.Collections.Generic.List[string]
$outRows.Add(($outHeader | ForEach-Object { CsvEscape $_ }) -join ",")

$countTotal = 0
$countInScope = 0
$countMissingPos = 0
$countMissingName = 0

for ($r = 4; $r -le $ml.rows; $r++) {
    $countTotal++
    $country = Norm $data[$r, $h["Country"]]
    if ($country -ne "Qatar" -and $country -ne "Egypt") { continue }
    $countInScope++

    $empId = ToIntStr $data[$r, $h["Employee Number"]]
    if (-not $empId) { $countMissingName++; continue }

    $posNo = ToIntStr $data[$r, $h["Position Number"]]
    $posInfo = $null
    if ($posNo -and $posIndex.ContainsKey($posNo)) { $posInfo = $posIndex[$posNo] } else { $countMissingPos++ }

    $gradeLabel = Norm $data[$r, $h["Grade"]]

    $hireDateStr = ToDateStr $data[$r, $h["Actual Date of Joining"]]
    $termDateStr = ToDateStr $data[$r, $h["Separation Date"]]

    $los = ""
    if ($hireDateStr) {
        $hireDt = [DateTime]::Parse($hireDateStr)
        $endDt = if ($termDateStr) { [DateTime]::Parse($termDateStr) } else { $TODAY }
        $los = [Math]::Round((($endDt - $hireDt).TotalDays) / 365.25, 1)
    }

    $row = @(
        $empId,
        (ToIntStr $data[$r, $h["Old Employee Number"]]),
        (Norm $data[$r, $h["Name"]]),
        "",
        (Norm $data[$r, $h["Gender"]]),
        (Norm $data[$r, $h["Nationality"]]),
        (ToDateStr $data[$r, $h["Date of Birth"]]),
        (ToIntStr $data[$r, $h["Age"]]),
        ($(if ($personalInfo.ContainsKey($empId)) { $personalInfo[$empId] } else { "" })),
        (Norm $data[$r, $h["Employee Status"]]),
        (Norm $data[$r, $h["Employment Type (Picklist Label)"]]),
        "Full Time",
        $hireDateStr,
        (ToDateStr $data[$r, $h["Probation End Date"]]),
        $termDateStr,
        (Norm $data[$r, $h["Reason For Separation"]]),
        $los,
        (Norm $data[$r, $h["Company"]]),
        (Norm $data[$r, $h["Cluster"]]),
        (Norm $data[$r, $h["Department"]]),
        (Norm $data[$r, $h["Division"]]),
        (Norm $data[$r, $h["Section (externalName)"]]),
        (ToIntStr $data[$r, $h["Cost Center Code"]]),
        $posNo,
        (Norm $data[$r, $h["Position"]]),
        ($(if ($posInfo) { $posInfo.jobFamily } else { "" })),
        (GradeToG $gradeLabel),
        (GradeTier $gradeLabel),
        (ToIntStr $data[$r, $h["Immediate Supervisor Employee Number"]]),
        (Norm $data[$r, $h["Immediate Supervisor"]]),
        ($(if ($posInfo) { $posInfo.location } else { "" })),
        $country,
        "",
        (Norm $data[$r, $h["Assignment Category"]]),
        (Norm $data[$r, $h["Employee Group"]])
    )
    $outRows.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",")
}

$outRows | Out-File -FilePath $OutPath -Encoding utf8

$log = @"
Master List total data rows: $countTotal
In-scope (Qatar+Egypt): $countInScope
Rows written: $($outRows.Count - 1)
Rows with no Position Number match in Position Data (job_family/location blank): $countMissingPos
"@
$log | Out-File -FilePath $LogPath -Encoding utf8
Write-Host $log

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
Write-Host "Done. Output: $OutPath"
