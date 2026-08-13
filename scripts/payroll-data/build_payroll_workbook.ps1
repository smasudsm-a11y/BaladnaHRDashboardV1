# CSV -> Database/14_Payroll_Report.xlsx (sheet "Payroll Data"). Reuses
# build_ctc_workbook.ps1's Write-SheetFromRows helper verbatim, including its
# two documented gotchas (see CLAUDE.md's CTC Report gotcha):
#   - PowerShell's multi-dim array indexer needs the row expression
#     parenthesized: $arr[($r+1),$c], not $arr[$r+1,$c].
#   - The Period column must be set to Text format BEFORE assignment, or
#     Excel auto-converts "2024-01-01" to a date serial, and SheetJS's
#     cellDates round-trip through this environment's timezone shifts it
#     back a day on read-back.
#
# Run from anywhere; paths are relative to this script's own location.

$dir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outPath = "$repoRoot\Database\14_Payroll_Report.xlsx"

$payroll = Import-Csv "$dir\payroll.csv"

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
$ws1.Name = "Payroll Data"
Write-SheetFromRows $ws1 @("Employee ID", "Period", "Gross Salary", "Overtime Amount", "Total Deductions", "Air Ticket Cost", "Net Pay") $payroll @("EmployeeID", "Period", "GrossSalary", "OvertimeAmount", "TotalDeductions", "AirTicketCost", "NetPay") @(1)

# Only 1 sheet is needed here (unlike the 4-sheet CTC workbook) — drop any
# extra blank default sheets Workbooks.Add() may have created.
while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }

$wb.SaveAs($outPath, 51)  # 51 = xlOpenXMLWorkbook (.xlsx)
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output "Saved: $outPath"
