# One-time addition: enrolls every active employee hired in the trailing 12
# months (relative to data.js's REFERENCE_TODAY) into a synthetic "New Hire
# Program" — one row per participant in the existing `training` table
# (training_category: "New Hire Program"), matching Power BI's NHP report at
# the participant/status level (not its per-curriculum-item granularity, which
# this schema has no field for). Appends to the existing "Training Data" sheet
# without touching any of its current rows.
#
# Status is assigned by weighted random draw (60% Completed / 33% In Progress
# / 7% Overdue), not a fixed days-since-hire cutoff — the newest hire in this
# dataset is already ~7 months old, so no fixed onboarding window (e.g. 90
# days) would ever produce an "In Progress" row. The weights approximate Power
# BI's real ratio (58.3% / 37.5% / 4.2%) instead.

$repoRoot = Split-Path -Parent $PSScriptRoot
$xlsxPath = "$repoRoot\Database\11_Learning_Training_Dashboard.xlsx"
$refDate = Get-Date "2026-08-02"   # data.js's REFERENCE_TODAY
$cutoff = $refDate.AddDays(-365)
$ci = [System.Globalization.CultureInfo]::InvariantCulture

$empRows = Import-Csv "$repoRoot\supabase\csv\employee_master.csv"
$candidates = $empRows | Where-Object {
  $_.employment_status -eq "Active" -and
  ([datetime]::ParseExact($_.hire_date, "d/M/yyyy", $ci)) -ge $cutoff
}
Write-Output "New Hire Program candidates (active, hired since $($cutoff.ToString('yyyy-MM-dd'))): $($candidates.Count)"

function New-Status {
  $r = Get-Random -Minimum 0 -Maximum 100
  if ($r -lt 60) { "Completed" } elseif ($r -lt 93) { "In Progress" } else { "Overdue" }
}

$newRows = foreach ($c in $candidates) {
  $hireDate = [datetime]::ParseExact($c.hire_date, "d/M/yyyy", $ci)
  $status = New-Status
  $completionDate = ""
  if ($status -eq "Completed") {
    $offsetDays = Get-Random -Minimum 30 -Maximum 90
    $cd = $hireDate.AddDays($offsetDays)
    if ($cd -gt $refDate) { $cd = $refDate }
    $completionDate = $cd.ToString("yyyy-MM-dd")
  }
  [PSCustomObject]@{
    EmployeeID = $c.employee_id
    CourseName = "New Hire Program"
    TrainingCategory = "New Hire Program"
    TrainingHours = 12
    TrainingCost = 0
    CompletionStatus = $status
    CompletionDate = $completionDate
    CertificationAchieved = "No"
  }
}

Write-Output "Status breakdown:"
$newRows | Group-Object CompletionStatus | Select-Object Name, Count

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($xlsxPath)
$ws = $wb.Worksheets.Item("Training Data")

$lastRow = $ws.Cells(1,1).End(4).Row  # xlDown-from-header-row equivalent isn't right; use UsedRange instead
$lastRow = $ws.UsedRange.Rows.Count
$startRow = $lastRow + 1

$colCount = 8
$arr = New-Object 'object[,]' $newRows.Count, $colCount
for ($r = 0; $r -lt $newRows.Count; $r++) {
  $row = $newRows[$r]
  $arr[$r,0] = $row.EmployeeID
  $arr[$r,1] = $row.CourseName
  $arr[$r,2] = $row.TrainingCategory
  $arr[$r,3] = $row.TrainingHours
  $arr[$r,4] = $row.TrainingCost
  $arr[$r,5] = $row.CompletionStatus
  $arr[$r,6] = $row.CompletionDate
  $arr[$r,7] = $row.CertificationAchieved
}
$range = $ws.Range($ws.Cells.Item($startRow,1), $ws.Cells.Item($startRow + $newRows.Count - 1, $colCount))
$range.Value2 = $arr

$wb.Save()
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output "Appended $($newRows.Count) rows to 'Training Data' starting at row $startRow. Saved: $xlsxPath"

$newRows | Export-Csv "$repoRoot\scripts\new_hire_program_rows.csv" -NoTypeInformation
Write-Output "Also saved a copy to scripts\new_hire_program_rows.csv for generating the Supabase INSERT."
