# One-time transform: replaces the real CTC $ amounts with fabricated ones,
# in place, so the CTC Report module can finally be committed (see CLAUDE.md's
# CTC Report gotcha / build history #11 for why the real data was withheld).
#
# Structure is preserved exactly (same periods, GL codes/names, cost centers,
# division/department taxonomy, row counts) — only Amount / ActualRevenue /
# BudgetRevenue values change. Cost Centers Data is untouched (no $ in it).
#
# Method: each cost center gets its own random multiplier — drawn
# independently for Actuals vs. Budget, so the two aren't a simple rescale of
# each other — plus small per-row jitter, so month-to-month shape isn't a pure
# linear rescale of the real trend either. Revenue gets one multiplier for its
# Actual series and another for its Budget series, same reasoning.
#
# Run once from anywhere; paths are relative to this script's own location.
# Re-running reshuffles the numbers again (multipliers aren't seeded), so only
# run this again deliberately, not as part of a routine build step.

$dir = $PSScriptRoot

function New-Multiplier { 0.65 + (Get-Random -Minimum 0 -Maximum 8001) / 10000.0 }  # 0.65 - 1.45
function New-Jitter { (Get-Random -Minimum -600 -Maximum 601) / 10000.0 }           # -0.06 - +0.06

# ---- Actuals + Budget: per-cost-center multiplier, independent for each table ----
function Sync-CtcTable($csvName) {
  $path = "$dir\$csvName"
  $rows = Import-Csv $path
  $multByCC = @{}
  foreach ($r in $rows) {
    $cc = $r.CostCenter
    if (-not $multByCC.ContainsKey($cc)) { $multByCC[$cc] = New-Multiplier }
    $orig = [double]$r.Amount
    $mult = $multByCC[$cc]
    $jitter = New-Jitter
    $r.Amount = [Math]::Round($orig * $mult * (1 + $jitter), 2)
  }
  $rows | Export-Csv $path -NoTypeInformation -Force
  Write-Output "$csvName -> $($rows.Count) rows rewritten, $($multByCC.Count) cost centers"
}

Sync-CtcTable "ctc_actuals.csv"
Sync-CtcTable "ctc_budget.csv"

# ---- Revenue: company-wide, one multiplier per series ----
$revPath = "$dir\ctc_revenue.csv"
$revRows = Import-Csv $revPath
$actualMult = New-Multiplier
$budgetMult = New-Multiplier
foreach ($r in $revRows) {
  if ($r.ActualRevenue -ne "" -and $r.ActualRevenue -ne $null) {
    $r.ActualRevenue = [Math]::Round([double]$r.ActualRevenue * $actualMult * (1 + (New-Jitter)), 2)
  }
  if ($r.BudgetRevenue -ne "" -and $r.BudgetRevenue -ne $null) {
    $r.BudgetRevenue = [Math]::Round([double]$r.BudgetRevenue * $budgetMult * (1 + (New-Jitter)), 2)
  }
}
$revRows | Export-Csv $revPath -NoTypeInformation -Force
Write-Output "ctc_revenue.csv -> $($revRows.Count) rows rewritten"

Write-Output "Cost Centers Data left untouched (no dollar figures)."
