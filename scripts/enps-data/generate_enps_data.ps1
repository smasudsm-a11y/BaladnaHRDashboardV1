# One-time synthetic data generation for the Employee Satisfaction / eNPS
# module (see CLAUDE.md "Power BI Parity — Round 2", Phase J). No real
# exit-survey or lifecycle-score data exists to reconcile against here —
# same "synthetic from day one" philosophy as Succession Planning/
# Probation & PIP. Writes 2 CSVs for review; build_enps_workbook.ps1 turns
# them into Database/17_Employee_Satisfaction.xlsx.
#
# Deterministic (no Get-Random), like the other Round 2 generators — every
# score here is derived from a real existing field (termination reason,
# Phase I's probation outcome), not a dice roll.
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
# attrition.csv's dates are already ISO (yyyy-MM-dd), unlike employee_master.csv's d/M/yyyy.
function Parse-ISO($s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  [datetime]::ParseExact($s, "yyyy-MM-dd", $ci)
}
function Fmt($d) { $d.ToString("yyyy-MM-dd") }
function Clamp($v) { [Math]::Max(0, [Math]::Min(10, $v)) }

Write-Output "Loading source CSVs..."
$employees = Import-Csv "$csvDir\employee_master.csv"
$attritionRows = Import-Csv "$csvDir\attrition.csv"

# Termination-within-90-days lookup, keyed by employee — deliberately NOT a
# dependency on Phase I's probation_reviews.csv (a separate module built in
# its own parallel branch/session; reading its generated output here would
# make this script's result depend on merge order between the two phases).
# This reproduces just the early-termination half of Phase I's own
# Confirmed/Extended/Not Confirmed rule directly from employee_master/
# attrition, which is all the stage-gate formula below actually needs.
$termByEmp = @{}
foreach ($a in $attritionRows) { $termByEmp[$a.employee_id] = Parse-ISO $a.termination_date }

# ---------------------------------------------------------------------------
# Exit surveys — one row per attrition record (588). eNPS score (0-10) is
# read off termination_reason, not assigned arbitrarily: voluntary,
# growth-motivated exits score highest; involuntary/disciplinary exits
# score lowest. This is the standard NPS 0-10 scale, bucketed the usual way
# (9-10 Promoter, 7-8 Passive, 0-6 Detractor).
# ---------------------------------------------------------------------------
$reasonScore = @{
  "Resignation - Better Opportunity"           = 9
  "Resignation - Relocation"                   = 8
  "Resignation - Personal Reasons"              = 7
  "End of Contract - Not Renewed by Employee"   = 6
  "Contract Non-Renewal - Company Decision"     = 4
  "Termination - Redundancy"                    = 4
  "Termination - Performance"                   = 2
  "Termination - Disciplinary"                  = 1
}

function Enps-Category($score) {
  if ($score -ge 9) { return "Promoter" }
  if ($score -ge 7) { return "Passive" }
  return "Detractor"
}

$exitSurveys = New-Object System.Collections.Generic.List[object]
foreach ($a in $attritionRows) {
  $termDate = Parse-ISO $a.termination_date
  if (-not $termDate) { continue }
  $score = if ($reasonScore.ContainsKey($a.termination_reason)) { $reasonScore[$a.termination_reason] } else { 5 }

  $exitSurveys.Add([PSCustomObject]@{
    EmployeeID    = $a.employee_id
    SurveyDate    = Fmt ($termDate.AddDays(14))
    EnpsScore     = $score
    EnpsCategory  = Enps-Category $score
    WouldRecommend = if ($score -ge 7) { "TRUE" } else { "FALSE" }
  })
}
Write-Output "Exit surveys: $($exitSurveys.Count)"
$exitSurveys | Export-Csv "$dir\exit_surveys.csv" -NoTypeInformation -Force

# ---------------------------------------------------------------------------
# Stage-gate scores — 4 rows per employee (Interview/Recruiting/Onboarding/
# Probation), all 4 derived from the SAME base signal: whether this
# employee was terminated within their own 90-day probation window (the
# early-termination half of Phase I's Confirmed/Not Confirmed rule — see
# note above on why this is reproduced here rather than imported). Per-
# stage offsets model a real, well-documented HR pattern — early-lifecycle
# sentiment starts high (interview honeymoon) and cools toward probation as
# the role's reality sets in — rather than 4 independent random draws.
# ---------------------------------------------------------------------------
$stageOffset = @{ "Interview" = 1.5; "Recruiting" = 1.0; "Onboarding" = 0.5; "Probation" = 0 }
$stages = @("Interview", "Recruiting", "Onboarding", "Probation")

$stageScores = New-Object System.Collections.Generic.List[object]
foreach ($e in $employees) {
  $hireDate = Parse-DMY $e.hire_date
  if (-not $hireDate) { continue }
  $reviewDate = $hireDate.AddDays(90)
  $termDate = $termByEmp[$e.employee_id]

  $base = 8
  if ($termDate -and $termDate -le $reviewDate) { $base = 3 }

  foreach ($stage in $stages) {
    $stageScores.Add([PSCustomObject]@{
      EmployeeID = $e.employee_id
      Stage      = $stage
      Score      = [Math]::Round((Clamp ($base + $stageOffset[$stage])), 1)
      ScoreDate  = Fmt $hireDate
    })
  }
}
Write-Output "Stage-gate scores: $($stageScores.Count) ($($employees.Count) employees x 4 stages)"
$stageScores | Export-Csv "$dir\stage_gate_scores.csv" -NoTypeInformation -Force

Write-Output "Saved CSVs to $dir"
