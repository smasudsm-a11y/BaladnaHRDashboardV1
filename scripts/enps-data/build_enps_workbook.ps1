# CSVs -> Database/17_Employee_Satisfaction.xlsx (2 sheets: Exit Surveys
# Data, Stage Gate Scores Data). Reuses build_ctc_workbook.ps1's
# Write-SheetFromRows helper verbatim, including its multi-dim array
# indexer gotcha (see CLAUDE.md's CTC Report gotcha): $arr[($r+1),$c], not
# $arr[$r+1,$c].
#
# Date columns are text format before assignment, same as every other
# workbook builder in this app — dodges the same one-day-shift-on-read-back
# bug documented under CTC Report.
#
# Run from anywhere; paths are relative to this script's own location.

$dir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outPath = "$repoRoot\Database\17_Employee_Satisfaction.xlsx"

$exitSurveys = Import-Csv "$dir\exit_surveys.csv"
$stageScores = Import-Csv "$dir\stage_gate_scores.csv"

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
$ws1.Name = "Exit Surveys Data"
Write-SheetFromRows $ws1 @("Employee ID", "Survey Date", "eNPS Score", "eNPS Category", "Would Recommend") $exitSurveys @("EmployeeID", "SurveyDate", "EnpsScore", "EnpsCategory", "WouldRecommend") @(0, 1)

$ws2 = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $ws1)
$ws2.Name = "Stage Gate Scores Data"
Write-SheetFromRows $ws2 @("Employee ID", "Stage", "Score", "Score Date") $stageScores @("EmployeeID", "Stage", "Score", "ScoreDate") @(0, 3)

while ($wb.Worksheets.Count -gt 2) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }

$wb.SaveAs($outPath, 51)  # 51 = xlOpenXMLWorkbook (.xlsx)
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output "Saved: $outPath"
