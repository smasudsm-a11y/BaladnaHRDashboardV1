$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"
$ci = [System.Globalization.CultureInfo]::InvariantCulture
$rng = New-Object System.Random(20260917)

# Adapted from scripts/payroll-data/generate_payroll_data.ps1, re-pointed at
# the new real employee_master/base_salary/total_rewards/leave drafts.
# Two real bugs fixed along the way, not introduced by this re-point:
# 1. The original used Parse-DMY ("d/M/yyyy") for hire_date/termination_date,
#    but employee_master.csv (old AND new) actually stores ISO
#    ("yyyy-MM-dd") -- Parse-DMY would throw on real data. Using Parse-ISO
#    for both, matching every other date field in that same file.
# 2. workforce_category was derived from the OLD job_level scheme
#    (Staff/Supervisory -> Labor) -- job_level is now a 9-tier real Grade
#    banding, and workforce_category is a real column on employee_master
#    now anyway (sourced directly from Employee Group, see
#    project_sap_real_data_migration). Reading e.workforce_category
#    directly instead of re-deriving it.
function Parse-ISO($s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  [datetime]::ParseExact($s, "yyyy-MM-dd", $ci)
}

Write-Output "Loading source CSVs..."
$employees = Import-Csv (Join-Path $Scratch "employee_master_new.csv")
$baseSalaryRows = Import-Csv (Join-Path $Scratch "base_salary_new.csv")
$totalRewardsRows = Import-Csv (Join-Path $Scratch "total_rewards_new.csv")
$leaveRows = Import-Csv (Join-Path $Scratch "leave_new.csv")

$salaryByEmp = @{}
foreach ($r in $baseSalaryRows) {
  $d = Parse-ISO $r.salary_effective_date
  if (-not $d) { continue }
  if (-not $salaryByEmp.ContainsKey($r.employee_id)) { $salaryByEmp[$r.employee_id] = @() }
  $salaryByEmp[$r.employee_id] += [PSCustomObject]@{ Date = $d; BaseSalary = [double]$r.base_salary }
}
foreach ($k in @($salaryByEmp.Keys)) { $salaryByEmp[$k] = @($salaryByEmp[$k] | Sort-Object Date) }

$rewardsByEmp = @{}
foreach ($r in $totalRewardsRows) {
  $d = Parse-ISO $r.salary_effective_date
  if (-not $d) { continue }
  $housing = $(if ($r.housing_allowance) { [double]$r.housing_allowance } else { 0 })
  $transport = $(if ($r.transport_allowance) { [double]$r.transport_allowance } else { 0 })
  $education = $(if ($r.education_allowance) { [double]$r.education_allowance } else { 0 })
  $other = $(if ($r.other_allowances) { [double]$r.other_allowances } else { 0 })
  $allowances = $housing + $transport + $education + $other
  if (-not $rewardsByEmp.ContainsKey($r.employee_id)) { $rewardsByEmp[$r.employee_id] = @() }
  $rewardsByEmp[$r.employee_id] += [PSCustomObject]@{ Date = $d; Allowances = $allowances }
}
foreach ($k in @($rewardsByEmp.Keys)) { $rewardsByEmp[$k] = @($rewardsByEmp[$k] | Sort-Object Date) }

$leaveByEmp = @{}
foreach ($r in $leaveRows) {
  if ($r.leave_type -ne "Annual") { continue }
  $d = Parse-ISO $r.leave_start_date
  if (-not $d) { continue }
  $bal = $(if ($r.leave_balance) { [double]$r.leave_balance } else { 0 })
  if (-not $leaveByEmp.ContainsKey($r.employee_id)) { $leaveByEmp[$r.employee_id] = @() }
  $leaveByEmp[$r.employee_id] += [PSCustomObject]@{ Date = $d; LeaveBalance = $bal }
}
foreach ($k in @($leaveByEmp.Keys)) { $leaveByEmp[$k] = @($leaveByEmp[$k] | Sort-Object Date) }

function Get-AsOf($history, $period) {
  $best = $null
  foreach ($h in $history) {
    if ($h.Date -le $period) { $best = $h } else { break }
  }
  return $best
}

$periods = @()
for ($y = 2024; $y -le 2026; $y++) {
  $mEnd = if ($y -eq 2026) { 6 } else { 12 }
  for ($m = 1; $m -le $mEnd; $m++) { $periods += [datetime]::new($y, $m, 1) }
}

function New-OvertimeAmount($workforceCategory) {
  $r = $rng.Next(0, 100)
  if ($workforceCategory -eq "Labor") {
    if ($r -lt 40) { return [Math]::Round(($rng.Next(500, 3001)), 2) }
  } else {
    if ($r -lt 5) { return [Math]::Round(($rng.Next(200, 801)), 2) }
  }
  return 0
}

function New-Deductions($grossSalary) {
  $base = $grossSalary * ($rng.Next(100, 401) / 10000.0)
  $loanSpike = 0
  if ($rng.Next(0, 100) -lt 10) {
    $loanSpike = $grossSalary * ($rng.Next(500, 1001) / 10000.0)
  }
  return [Math]::Round($base + $loanSpike, 2)
}

function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

$rows = New-Object System.Collections.Generic.List[object]
$empCount = 0
$skipped = 0

foreach ($e in $employees) {
  $empCount++
  $empId = $e.employee_id
  $hireDate = Parse-ISO $e.hire_date
  $termDate = Parse-ISO $e.termination_date
  $nationality = $e.nationality
  $workforceCategory = $e.workforce_category
  $hireMonth = if ($hireDate) { $hireDate.Month } else { 0 }
  $isExpat = $nationality -ne "Qatari"

  if (-not $salaryByEmp.ContainsKey($empId)) { $skipped++; continue }
  $salHist = $salaryByEmp[$empId]
  $rewHist = if ($rewardsByEmp.ContainsKey($empId)) { $rewardsByEmp[$empId] } else { @() }
  $leaveHist = if ($leaveByEmp.ContainsKey($empId)) { $leaveByEmp[$empId] } else { @() }

  foreach ($period in $periods) {
    if (-not $hireDate -or $hireDate -gt $period) { continue }
    if ($termDate -and $termDate -le $period) { continue }

    $sal = Get-AsOf $salHist $period
    if (-not $sal) { continue }
    $rew = Get-AsOf $rewHist $period
    $allowances = if ($rew) { $rew.Allowances } else { 0 }

    $jitter = 1 + (($rng.Next(-200, 201)) / 10000.0)
    $grossSalary = [Math]::Round(($sal.BaseSalary + $allowances) * $jitter, 2)

    $overtimeAmount = New-OvertimeAmount $workforceCategory
    $totalDeductions = New-Deductions $grossSalary

    $airTicketCost = 0
    if ($isExpat -and $period.Month -eq $hireMonth) {
      $airTicketCost = [Math]::Round(($rng.Next(1500, 4001)), 2)
    }

    $netPay = [Math]::Round($grossSalary + $overtimeAmount - $totalDeductions, 2)

    $leave = Get-AsOf $leaveHist $period
    $leaveBalance = if ($leave) { $leave.LeaveBalance } else { 0 }
    $annualLeaveCost = [Math]::Round($leaveBalance * $sal.BaseSalary / 30, 2)

    $rows.Add(@(
      $empId, $period.ToString("yyyy-MM-dd"), $grossSalary, $overtimeAmount,
      $totalDeductions, $airTicketCost, $netPay, $annualLeaveCost
    ))
  }
}

Write-Output "Employees processed: $empCount ($skipped skipped - no base_salary row)"
WriteCsv (Join-Path $Scratch "payroll_new.csv") @("employee_id","period","gross_salary","overtime_amount","total_deductions","air_ticket_cost","net_pay","annual_leave_cost") $rows
Write-Output "Payroll rows generated: $($rows.Count)"
