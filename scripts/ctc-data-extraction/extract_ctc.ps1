# Run from anywhere; paths are relative to this script's own location.
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$root = $repoRoot
$actualDir = "$root\CTC\2024 Actual"
$revenuePath = "$root\CTC\2024 Revenue\2024 Revenue.xlsx"
# Outside the repo — a separate Finance working file. Update this path if it moves.
$budgetWorkingsPath = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Monthly CTC Dashboard 2026\APR-06\Apr 2026 CTC ppt workings.xlsx"
$outDir = $PSScriptRoot

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$monthNameToNum = @{ Jan=1; Feb=2; Mar=3; Apr=4; May=5; Jun=6; Jul=7; Aug=8; Sep=9; Oct=10; Nov=11; Dec=12 }

# ===== 1. Cost Centers mapping =====
$costCenters = New-Object System.Collections.Generic.List[object]
$wb = $excel.Workbooks.Open($budgetWorkingsPath, $true, $true)
$ws = $wb.Worksheets.Item("CC Comparison")
$ur = $ws.UsedRange
$rowsCC = $ur.Rows.Count
for ($r=4; $r -le $rowsCC; $r++) {
  $cc = $ws.Cells.Item($r,1).Text.Trim()
  if (-not $cc -or $cc -eq "Grand Total") { continue }
  $div = $ws.Cells.Item($r,13).Text.Trim()
  $dept = $ws.Cells.Item($r,14).Text.Trim()
  if ($cc -eq "COM-155" -and -not $div) { $div = "Corporate" }
  $costCenters.Add([PSCustomObject]@{ CostCenter=$cc; Division=$div; Department=$dept })
}
# Present in the real Actuals data but not found in any mapping sheet in the source
# workbook. Reconciliation against the known real Commercial total confirms Division:
# Commercial(mapped CCs)=3,824,493.38 + these three=10,870.17 = 3,835,363.55, exactly
# the real Jan-2026 Commercial figure — so Division is confirmed, Department is not.
foreach ($cc in @("COM-103","COF-108","COM-130")) {
  $costCenters.Add([PSCustomObject]@{ CostCenter=$cc; Division="Commercial"; Department="Unclassified" })
}

# ===== 2. Budget CTC (2026, from Detailed Budget sheet) =====
$budgetRows = New-Object System.Collections.Generic.List[object]
$wsB = $wb.Worksheets.Item("Detailed Budget")
$urB = $wsB.UsedRange
$dataB = $urB.Value2
$rowsB = $urB.Rows.Count
for ($r=2; $r -le $rowsB; $r++) {
  $glCode = $dataB[$r,1]
  $glName = $dataB[$r,2]
  $cc = $dataB[$r,3]
  $fs = "Employee Cost"
  if (-not $glCode -or -not $cc) { continue }
  # "Shared expenses (Employee Cost)" is an overhead allocation, not part of Finance's
  # own CTC definition — confirmed by reconciliation: including it overstates every
  # known month's Budget CTC by ~exactly this line's amount vs. CTC Summary.xlsx's totals.
  if (([string]$glName).Trim() -eq "Shared expenses (Employee Cost)") { continue }
  for ($m=0; $m -lt 12; $m++) {
    $col = 7 + $m
    $val = $dataB[$r,$col]
    if ($null -eq $val -or $val -eq 0) { continue }
    $amount = [Math]::Round([Math]::Abs([double]$val), 2)
    $period = "2026-{0:D2}-01" -f ($m+1)
    $budgetRows.Add([PSCustomObject]@{ Period=$period; GLCode=([string]$glCode).Trim(); GLName=([string]$glName).Trim(); FSCategory=([string]$fs).Trim(); CostCenter=([string]$cc).Trim(); Amount=$amount })
  }
}
$wb.Close($false)

# ===== 3. Actuals CTC (30 monthly files) =====
$actualRows = New-Object System.Collections.Generic.List[object]
$files = Get-ChildItem -Path $actualDir -Filter "*.xlsx"
foreach ($f in $files) {
  if ($f.Name -match '^(\w{3})\s+(\d{4})\.xlsx$') {
    $mon = $monthNameToNum[$Matches[1]]
    $yr = $Matches[2]
    $period = "{0}-{1:D2}-01" -f $yr, $mon
  } else {
    Write-Warning "Filename doesn't match pattern: $($f.Name)"
    continue
  }
  $wbA = $excel.Workbooks.Open($f.FullName, $true, $true)
  $wsA = $wbA.Worksheets.Item(1)
  $urA = $wsA.UsedRange
  $dataA = $urA.Value2
  $rowsA = $urA.Rows.Count
  $colsA = $urA.Columns.Count
  $ccHeaders = @()
  for ($c=5; $c -le $colsA; $c++) { $ccHeaders += ([string]$dataA[1,$c]).Trim() }
  for ($r=2; $r -le $rowsA; $r++) {
    $glName = $dataA[$r,1]
    if (-not $glName -or ([string]$glName).Trim() -eq "") { continue }
    $glNameStr = ([string]$glName).Trim()
    $glCode = $dataA[$r,2]
    $glCodeStr = ([string]$glCode).Trim()
    if (-not $glCodeStr) { $glCodeStr = "CAMP" }
    # FS Category is "Employee Cost" for every row in this CTC-only extract by
    # design — hardcoded rather than read from the file, since at least one
    # month (Apr 2024) has a data-entry glitch duplicating GL Name into this column.
    $fs = "Employee Cost"
    for ($ci=0; $ci -lt $ccHeaders.Count; $ci++) {
      $col = 5 + $ci
      $val = $dataA[$r,$col]
      if ($null -eq $val -or $val -eq 0) { continue }
      $actualRows.Add([PSCustomObject]@{ Period=$period; GLCode=$glCodeStr; GLName=$glNameStr; FSCategory=$fs; CostCenter=$ccHeaders[$ci]; Amount=[Math]::Round([double]$val,2) })
    }
  }
  $wbA.Close($false)
}

# ===== 4. Revenue =====
$revenueRows = New-Object System.Collections.Generic.List[object]
$wbR = $excel.Workbooks.Open($revenuePath, $true, $true)
$wsR = $wbR.Worksheets.Item(1)
$urR = $wsR.UsedRange
$rowsR = $urR.Rows.Count
for ($r=2; $r -le $rowsR; $r++) {
  $label = $wsR.Cells.Item($r,1).Text.Trim()
  if (-not $label) { continue }
  if ($label -match '^(\w{3})-(\d{2})$') {
    $mon = $monthNameToNum[$Matches[1]]
    $yr = "20" + $Matches[2]
    $period = "{0}-{1:D2}-01" -f $yr, $mon
  } else { continue }
  $actualRev = $wsR.Cells.Item($r,2).Value2
  $budgetRev = $wsR.Cells.Item($r,3).Value2
  $revenueRows.Add([PSCustomObject]@{ Period=$period; ActualRevenue=$actualRev; BudgetRevenue=$budgetRev })
}
$wbR.Close($false)

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output "CostCenters: $($costCenters.Count)"
Write-Output "BudgetRows: $($budgetRows.Count)"
Write-Output "ActualRows: $($actualRows.Count)"
Write-Output "RevenueRows: $($revenueRows.Count)"

$costCenters | Export-Csv -Path "$outDir\cost_centers.csv" -NoTypeInformation
$budgetRows | Export-Csv -Path "$outDir\ctc_budget.csv" -NoTypeInformation
$actualRows | Export-Csv -Path "$outDir\ctc_actuals.csv" -NoTypeInformation
$revenueRows | Export-Csv -Path "$outDir\ctc_revenue.csv" -NoTypeInformation
Write-Output "Done."
