# One-time synthetic data generation for the Payroll Report module (see
# CLAUDE.md "Current status" — the last deferred phase of the Power BI-parity
# project). No real payroll source exists to reconcile against here — same
# philosophy as workforce_category/New Hire Program, not the CTC Report
# module's real-data-then-resynthesize approach. Writes payroll.csv for
# review; build_payroll_workbook.ps1 turns that into
# Database/14_Payroll_Report.xlsx.
#
# Grain: one row per employee per active calendar month, Jan 2024 - Jun 2026
# (matches ctc_actuals' existing upper bound, keeping every monthly-grain
# financial module in this app on the same timeline).
#
# Run from anywhere; paths are relative to this script's own location.
# Re-running reshuffles the random draws (not seeded) — only intended to run
# once for the initial load.

$dir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$csvDir = "$repoRoot\supabase\csv"
$ci = [System.Globalization.CultureInfo]::InvariantCulture

function Parse-DMY($s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  [datetime]::ParseExact($s, "d/M/yyyy", $ci)
}
function Parse-ISO($s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  [datetime]::ParseExact($s, "yyyy-MM-dd", $ci)
}

Write-Output "Loading source CSVs..."
$employees = Import-Csv "$csvDir\employee_master.csv"
$baseSalaryRows = Import-Csv "$csvDir\base_salary.csv"
$totalRewardsRows = Import-Csv "$csvDir\total_rewards.csv"

# Index base_salary / total_rewards by employee, each entry's date pre-parsed
# and sorted ascending so "latest effective <= period" is a simple scan —
# each employee only has a handful of salary_effective_date rows (one per
# raise), so this stays cheap even scanned fresh per period.
$salaryByEmp = @{}
foreach ($r in $baseSalaryRows) {
  $d = Parse-ISO $r.salary_effective_date
  if (-not $salaryByEmp.ContainsKey($r.employee_id)) { $salaryByEmp[$r.employee_id] = @() }
  $salaryByEmp[$r.employee_id] += [PSCustomObject]@{ Date = $d; BaseSalary = [double]$r.base_salary }
}
foreach ($k in @($salaryByEmp.Keys)) { $salaryByEmp[$k] = @($salaryByEmp[$k] | Sort-Object Date) }

$rewardsByEmp = @{}
foreach ($r in $totalRewardsRows) {
  $d = Parse-ISO $r.salary_effective_date
  $allowances = [double]$r.housing_allowance + [double]$r.transport_allowance + [double]$r.education_allowance + [double]$r.other_allowances
  if (-not $rewardsByEmp.ContainsKey($r.employee_id)) { $rewardsByEmp[$r.employee_id] = @() }
  $rewardsByEmp[$r.employee_id] += [PSCustomObject]@{ Date = $d; Allowances = $allowances }
}
foreach ($k in @($rewardsByEmp.Keys)) { $rewardsByEmp[$k] = @($rewardsByEmp[$k] | Sort-Object Date) }

function Get-AsOf($history, $period) {
  $best = $null
  foreach ($h in $history) {
    if ($h.Date -le $period) { $best = $h } else { break }
  }
  return $best
}

# Jan 2024 - Jun 2026, matching ctc_actuals' upper bound. Midnight-anchored
# (not Get-Date's current-time-of-day default) so date comparisons against
# the parsed hire/termination dates are clean.
$periods = @()
for ($y = 2024; $y -le 2026; $y++) {
  $mEnd = if ($y -eq 2026) { 6 } else { 12 }
  for ($m = 1; $m -le $mEnd; $m++) { $periods += [datetime]::new($y, $m, 1) }
}

# Overtime is tied to workforce_category (the Staff/Labor split from
# 14_workforce_category.sql) — Labor gets a much higher hit rate and range
# than Staff, a deliberate use of a distinction this app already tracks.
function New-OvertimeAmount($workforceCategory) {
  $r = Get-Random -Minimum 0 -Maximum 100
  if ($workforceCategory -eq "Labor") {
    if ($r -lt 40) { return [Math]::Round((Get-Random -Minimum 500 -Maximum 3001), 2) }
  } else {
    if ($r -lt 5) { return [Math]::Round((Get-Random -Minimum 200 -Maximum 801), 2) }
  }
  return 0
}

# Routine minor deduction every month (1-4% of gross) plus an occasional
# (~10% of months) extra "loan deduction" spike (5-10% of gross).
function New-Deductions($grossSalary) {
  $base = $grossSalary * ((Get-Random -Minimum 100 -Maximum 401) / 10000.0)
  $loanSpike = 0
  if ((Get-Random -Minimum 0 -Maximum 100) -lt 10) {
    $loanSpike = $grossSalary * ((Get-Random -Minimum 500 -Maximum 1001) / 10000.0)
  }
  return [Math]::Round($base + $loanSpike, 2)
}

$rows = New-Object System.Collections.Generic.List[object]
$empCount = 0
$skipped = 0

foreach ($e in $employees) {
  $empCount++
  $empId = $e.employee_id
  $hireDate = Parse-DMY $e.hire_date
  $termDate = Parse-DMY $e.termination_date
  $nationality = $e.nationality
  # Same rule as 14_workforce_category.sql's backfill.
  $workforceCategory = if ($e.job_level -in @("Staff", "Supervisory")) { "Labor" } else { "Staff" }
  $hireMonth = if ($hireDate) { $hireDate.Month } else { 0 }
  $isExpat = $nationality -ne "Qatari"

  if (-not $salaryByEmp.ContainsKey($empId)) { $skipped++; continue }
  $salHist = $salaryByEmp[$empId]
  $rewHist = if ($rewardsByEmp.ContainsKey($empId)) { $rewardsByEmp[$empId] } else { @() }

  foreach ($period in $periods) {
    if (-not $hireDate -or $hireDate -gt $period) { continue }
    if ($termDate -and $termDate -le $period) { continue }

    $sal = Get-AsOf $salHist $period
    if (-not $sal) { continue }
    $rew = Get-AsOf $rewHist $period
    $allowances = if ($rew) { $rew.Allowances } else { 0 }

    $jitter = 1 + ((Get-Random -Minimum -200 -Maximum 201) / 10000.0)  # +/-2%
    $grossSalary = [Math]::Round(($sal.BaseSalary + $allowances) * $jitter, 2)

    $overtimeAmount = New-OvertimeAmount $workforceCategory
    $totalDeductions = New-Deductions $grossSalary

    # Air ticket: expat employees only, one nonzero month per year (their
    # hire-anniversary month — deterministic per employee, not fully random),
    # matching the real-world benefit this line item represents.
    $airTicketCost = 0
    if ($isExpat -and $period.Month -eq $hireMonth) {
      $airTicketCost = [Math]::Round((Get-Random -Minimum 1500 -Maximum 4001), 2)
    }

    # Air ticket cost is a separate employer cost line, not netted into pay.
    $netPay = [Math]::Round($grossSalary + $overtimeAmount - $totalDeductions, 2)

    $rows.Add([PSCustomObject]@{
      EmployeeID       = $empId
      Period           = $period.ToString("yyyy-MM-dd")
      GrossSalary      = $grossSalary
      OvertimeAmount   = $overtimeAmount
      TotalDeductions  = $totalDeductions
      AirTicketCost    = $airTicketCost
      NetPay           = $netPay
    })
  }
}

Write-Output "Employees processed: $empCount ($skipped skipped - no base_salary row)"
Write-Output "Payroll rows generated: $($rows.Count)"

$outPath = "$dir\payroll.csv"
$rows | Export-Csv $outPath -NoTypeInformation -Force
Write-Output "Saved: $outPath"
