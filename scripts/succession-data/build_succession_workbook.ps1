# CSVs -> Database/15_Succession_Planning.xlsx (3 sheets: Critical Positions
# Data, Incumbents Data, Successors Data). Reuses build_ctc_workbook.ps1's
# Write-SheetFromRows helper verbatim, including its multi-dim array indexer
# gotcha (see CLAUDE.md's CTC Report gotcha): $arr[($r+1),$c], not $arr[$r+1,$c].
#
# Unlike Payroll/CTC, no column here needs the Text-format-before-assignment
# date workaround — none of these 3 sheets carry a date column.
#
# Run from anywhere; paths are relative to this script's own location.

$dir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outPath = "$repoRoot\Database\15_Succession_Planning.xlsx"

$positions = Import-Csv "$dir\critical_positions.csv"
$incumbents = Import-Csv "$dir\incumbents.csv"
$successors = Import-Csv "$dir\successors.csv"

function Write-SheetFromRows($ws, $headers, $rows, $propNames, $textColumns) {
  $rowCount = $rows.Count
  $colCount = $headers.Count
  if ($null -ne $textColumns) {
    foreach ($colIdx in $textColumns) {
      $ws.Columns.Item($colIdx + 1).NumberFormat = "@"
    }
  }
  $arr = New-Object 'object[,]' ($rowCount + 1), $colCount
  for ($c = 0; $c -lt $colCount; $c++) { $arr[0, $c] = $headers[$c] }
  for ($r = 0; $r -lt $rowCount; $r++) {
    for ($c = 0; $c -lt $colCount; $c++) {
      $val = $rows[$r].($propNames[$c])
      $isTextCol = ($null -ne $textColumns) -and ($textColumns -contains $c)
      if (-not $isTextCol -and $val -match '^-?\d+(\.\d+)?$') { $arr[($r + 1), $c] = [double]$val } else { $arr[($r + 1), $c] = $val }
    }
  }
  $range = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($rowCount + 1, $colCount))
  $range.Value2 = $arr
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Add()

$ws1 = $wb.Worksheets.Item(1)
$ws1.Name = "Critical Positions Data"
Write-SheetFromRows $ws1 @("Position ID", "Position Title", "Department", "Division", "Business Unit", "Job Grade", "Criticality") $positions @("PositionID", "PositionTitle", "Department", "Division", "BusinessUnit", "JobGrade", "Criticality") @(0)

$ws2 = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $ws1)
$ws2.Name = "Incumbents Data"
Write-SheetFromRows $ws2 @("Position ID", "Employee ID", "Time in Role (Years)", "Retirement Risk") $incumbents @("PositionID", "EmployeeID", "TimeInRoleYears", "RetirementRisk") @(0, 1)

$ws3 = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $ws2)
$ws3.Name = "Successors Data"
Write-SheetFromRows $ws3 @("Position ID", "Successor Employee ID", "Readiness", "Is High Potential") $successors @("PositionID", "SuccessorEmployeeID", "Readiness", "IsHighPotential") @(0, 1)

# Drop any extra blank default sheets Workbooks.Add() may have created beyond our 3.
while ($wb.Worksheets.Count -gt 3) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }

$wb.SaveAs($outPath, 51)  # 51 = xlOpenXMLWorkbook (.xlsx)
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output "Saved: $outPath"
