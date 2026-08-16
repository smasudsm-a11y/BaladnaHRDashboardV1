# One-time synthetic data generation for the Probation & PIP module (see
# CLAUDE.md "Power BI Parity — Round 2", Phase I). No real probation/PIP
# roster exists to reconcile against here — same "synthetic from day one"
# philosophy as Payroll/Attendance Violations/Succession Planning. Writes 2
# CSVs for review; build_probation_pip_workbook.ps1 turns them into
# Database/16_Probation_PIP.xlsx.
#
# Deterministic (no Get-Random), like Succession Planning's generator —
# every outcome here is derived from a real existing field (termination
# timing, performance ratings), not a dice roll, so re-running reproduces
# the exact same rosters.
#
# Run from anywhere; paths are relative to this script's own location.

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
function Fmt($d) { $d.ToString("yyyy-MM-dd") }

Write-Output "Loading source CSVs..."
$employees = Import-Csv "$csvDir\employee_master.csv"
$performanceRows = Import-Csv "$csvDir\performance.csv"

# Performance history per employee, sorted chronologically — used both for
# Probation's "Extended" signal (a poor first review) and PIP's milestone
# outcomes (did a later review show improvement?).
$perfByEmp = @{}
foreach ($r in $performanceRows) {
  $d = Parse-ISO $r.rating_date
  if (-not $perfByEmp.ContainsKey($r.employee_id)) { $perfByEmp[$r.employee_id] = @() }
  $perfByEmp[$r.employee_id] += [PSCustomObject]@{ Date = $d; Rating = $r.overall_rating }
}
foreach ($k in @($perfByEmp.Keys)) { $perfByEmp[$k] = @($perfByEmp[$k] | Sort-Object Date) }

# ---------------------------------------------------------------------------
# Probation reviews — one row per employee (the full 1,510-employee
# population, matching this app's other historical tables like attrition/
# leave rather than a narrow "currently onboarding" slice). Outcome is
# derived from real signals, not assigned arbitrarily:
#   - terminated within the 90-day probation window -> Not Confirmed
#   - not terminated early, but their EARLIEST recorded performance rating
#     was Below Expectations -> Extended (struggled early, given more time)
#   - otherwise -> Confirmed
# ---------------------------------------------------------------------------
$probationRows = New-Object System.Collections.Generic.List[object]
foreach ($e in $employees) {
  $hireDate = Parse-DMY $e.hire_date
  if (-not $hireDate) { continue }
  $termDate = Parse-DMY $e.termination_date
  $reviewDate = $hireDate.AddDays(90)

  $outcome = "Confirmed"
  if ($termDate -and $termDate -le $reviewDate) {
    $outcome = "Not Confirmed"
  } else {
    $hist = if ($perfByEmp.ContainsKey($e.employee_id)) { $perfByEmp[$e.employee_id] } else { @() }
    if ($hist.Count -gt 0 -and $hist[0].Rating -eq "Below Expectations") {
      $outcome = "Extended"
    }
  }

  $probationRows.Add([PSCustomObject]@{
    EmployeeID          = $e.employee_id
    ProbationStartDate  = Fmt $hireDate
    ReviewDate          = Fmt $reviewDate
    Outcome             = $outcome
  })
}

Write-Output "Probation reviews: $($probationRows.Count)"
$probationRows | Export-Csv "$dir\probation_reviews.csv" -NoTypeInformation -Force

# ---------------------------------------------------------------------------
# PIP records — one row per employee whose most recent recorded performance
# rating was Below Expectations (127 employees). pip_start_date is set 3
# weeks after that review (typical HR processing lag). Milestone outcomes
# are derived from whatever REAL signal follows: a later performance cycle's
# rating, or an early termination.
# ---------------------------------------------------------------------------
$pipRows = New-Object System.Collections.Generic.List[object]
foreach ($e in $employees) {
  $hist = if ($perfByEmp.ContainsKey($e.employee_id)) { $perfByEmp[$e.employee_id] } else { @() }
  if ($hist.Count -eq 0) { continue }

  # Trigger: the LATEST cycle where this employee was rated Below Expectations.
  $belowCycles = @($hist | Where-Object { $_.Rating -eq "Below Expectations" })
  if ($belowCycles.Count -eq 0) { continue }
  $trigger = $belowCycles[-1]

  $pipStart = $trigger.Date.AddDays(21)
  $termDate = Parse-DMY $e.termination_date

  # $hist collapses to a scalar (not a 1-element array) when it only has one
  # entry, so [array]::IndexOf($hist, ...) throws — force it to an array first.
  $triggerIdx = [array]::IndexOf(@($hist), $trigger)
  $nextCycle = if ($triggerIdx -ge 0 -and $triggerIdx -lt ($hist.Count - 1)) { $hist[$triggerIdx + 1] } else { $null }

  $month3 = "Improved"
  $month6 = "Completed Successfully"

  if ($termDate -and $termDate -le $pipStart.AddDays(90)) {
    $month3 = "Terminated"; $month6 = "Terminated"
  } elseif ($termDate -and $termDate -le $pipStart.AddDays(180)) {
    $month3 = "Not Improved"; $month6 = "Terminated"
  } elseif ($nextCycle) {
    if ($nextCycle.Rating -eq "Below Expectations") {
      $month3 = "Not Improved"; $month6 = "Not Improved"
    } else {
      $month3 = "Improved"; $month6 = "Completed Successfully"
    }
  }
  # else: no later cycle and no qualifying termination -> still employed with
  # no further negative signal, so both milestones default to a positive
  # outcome (benefit of the doubt — the only fallback this schema supports).

  $pipRows.Add([PSCustomObject]@{
    EmployeeID    = $e.employee_id
    PIPStartDate  = Fmt $pipStart
    Reason        = "Below Expectations Performance Review ($($trigger.Date.ToString('yyyy-MM')))"
    Month3Status  = $month3
    Month6Status  = $month6
  })
}

Write-Output "PIP records: $($pipRows.Count)"
$pipRows | Export-Csv "$dir\pip_records.csv" -NoTypeInformation -Force

Write-Output "Saved CSVs to $dir"
