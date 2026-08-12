# Run from anywhere; paths are relative to this script's own location.
$dir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outPath = "$repoRoot\Database\13_CTC_Report.xlsx"

$costCenters = Import-Csv "$dir\cost_centers.csv"
$actuals = Import-Csv "$dir\ctc_actuals.csv"
$budget = Import-Csv "$dir\ctc_budget.csv"
$revenue = Import-Csv "$dir\ctc_revenue.csv"

function Write-SheetFromRows($ws, $headers, $rows, $propNames, $textColumns) {
  $rowCount = $rows.Count
  $colCount = $headers.Count
  # Format Period (or any date-lookalike) columns as Text BEFORE writing —
  # otherwise Excel auto-converts "2024-04-01" to a date serial on assignment,
  # and SheetJS's cellDates round-trip through this environment's timezone
  # shifts it back a day (Date.UTC-anchored construction read via local
  # getters). Writing it as literal text sidesteps the whole date-object path;
  # toIsoDate's string fallback returns it completely unchanged.
  if ($null -ne $textColumns) {
    foreach ($colIdx in $textColumns) {
      $ws.Columns.Item($colIdx + 1).NumberFormat = "@"
    }
  }
  $arr = New-Object 'object[,]' ($rowCount + 1), $colCount
  for ($c=0; $c -lt $colCount; $c++) { $arr[0,$c] = $headers[$c] }
  for ($r=0; $r -lt $rowCount; $r++) {
    for ($c=0; $c -lt $colCount; $c++) {
      $val = $rows[$r].($propNames[$c])
      $isTextCol = ($null -ne $textColumns) -and ($textColumns -contains $c)
      if (-not $isTextCol -and $val -match '^-?\d+(\.\d+)?$') { $arr[($r+1),$c] = [double]$val } else { $arr[($r+1),$c] = $val }
    }
  }
  $range = $ws.Range($ws.Cells.Item(1,1), $ws.Cells.Item($rowCount+1, $colCount))
  $range.Value2 = $arr
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Add()

# Sheet 1: Cost Centers Data
$ws1 = $wb.Worksheets.Item(1)
$ws1.Name = "Cost Centers Data"
Write-SheetFromRows $ws1 @("Cost Center","Division","Department") $costCenters @("CostCenter","Division","Department")

# Sheet 2: CTC Actuals Data
$ws2 = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $wb.Worksheets.Item($wb.Worksheets.Count))
$ws2.Name = "CTC Actuals Data"
Write-SheetFromRows $ws2 @("Period","GL Code","GL Name","FS Category","Cost Center","Amount") $actuals @("Period","GLCode","GLName","FSCategory","CostCenter","Amount") @(0)

# Sheet 3: CTC Budget Data
$ws3 = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $wb.Worksheets.Item($wb.Worksheets.Count))
$ws3.Name = "CTC Budget Data"
Write-SheetFromRows $ws3 @("Period","GL Code","GL Name","FS Category","Cost Center","Amount") $budget @("Period","GLCode","GLName","FSCategory","CostCenter","Amount") @(0)

# Sheet 4: CTC Revenue Data
$ws4 = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $wb.Worksheets.Item($wb.Worksheets.Count))
$ws4.Name = "CTC Revenue Data"
Write-SheetFromRows $ws4 @("Period","Actual Revenue","Budget Revenue") $revenue @("Period","ActualRevenue","BudgetRevenue") @(0)

$wb.SaveAs($outPath, 51)  # 51 = xlOpenXMLWorkbook (.xlsx)
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output "Saved: $outPath"
