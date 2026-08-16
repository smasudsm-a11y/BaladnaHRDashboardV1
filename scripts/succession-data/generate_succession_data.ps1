# One-time synthetic data generation for the Succession Planning module (see
# CLAUDE.md "Power BI Parity — Round 2", Phase H). No real succession-planning
# roster exists to reconcile against here — same "synthetic from day one"
# philosophy as Payroll/Attendance Violations, not the CTC Report module's
# real-data-then-resynthesize approach. Writes 3 CSVs for review;
# build_succession_workbook.ps1 turns them into
# Database/15_Succession_Planning.xlsx.
#
# Deterministic (no Get-Random) so re-running reproduces the same roster —
# unlike generate_payroll_data.ps1, which is fine to reshuffle since payroll
# is pure $ noise; a succession roster reads better as a stable, explainable
# selection (see the per-position rules below) than as one-off dice rolls.
#
# Run from anywhere; paths are relative to this script's own location.

$dir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$csvDir = "$repoRoot\supabase\csv"

Write-Output "Loading source CSV..."
$employees = Import-Csv "$csvDir\employee_master.csv"
$active = $employees | Where-Object { $_.employment_status -eq "Active" }

# Criticality is derived from the position_title itself (this schema's
# existing "{Level} - {Department}" naming, e.g. "Chief Officer - Production",
# "Senior Manager - IT & Digital") rather than assigned arbitrarily — a
# defensible, explainable rule instead of a random label.
function Criticality-Of($title) {
  if ($title -match "^(Chief Officer|Head of Department)") { return "Critical" }
  if ($title -match "^Senior Manager") { return "High" }
  return "Medium"
}

# Retirement risk proxy: age is the only field this schema has that's close
# to a real retirement-risk signal (no tenure-at-grade or succession-flag
# field exists) — same reasoning as workforce_category's job_level proxy.
function Retirement-Risk-Of($age) {
  if ([int]$age -ge 55) { return "High" }
  if ([int]$age -ge 45) { return "Medium" }
  return "Low"
}

# Readiness is derived from the candidate's own tenure (length_of_service) —
# again, the closest existing field to a real "development stage" signal.
function Readiness-Of($tenureYears) {
  if ($tenureYears -ge 3) { return "Ready Now" }
  if ($tenureYears -ge 1.5) { return "Ready 1-2 Years" }
  if ($tenureYears -ge 0.5) { return "Ready 3-5 Years" }
  return "Not Ready"
}

# Critical positions are sampled from active Managerial/Executive employees
# (174 of them) — step-sampled down to ~45 so the roster spans every
# department without just being "every single manager," matching how a real
# succession plan names specific key seats rather than every leadership role.
$seniorLeaders = $active | Where-Object { $_.job_level -in @("Managerial", "Executive") } | Sort-Object employee_id
$targetCount = 45
$step = [Math]::Max(1, [Math]::Floor($seniorLeaders.Count / $targetCount))
$seeds = New-Object System.Collections.Generic.List[object]
for ($i = 0; $i -lt $seniorLeaders.Count; $i += $step) { $seeds.Add($seniorLeaders[$i]) }
if ($seeds.Count -gt $targetCount) { $seeds = $seeds.GetRange(0, $targetCount) }

Write-Output "Senior leaders available: $($seniorLeaders.Count); positions sampled: $($seeds.Count)"

$positions = New-Object System.Collections.Generic.List[object]
$incumbents = New-Object System.Collections.Generic.List[object]
$successors = New-Object System.Collections.Generic.List[object]
$posIndex = 0

foreach ($seed in $seeds) {
  $posIndex++
  $positionId = "CP-{0:D3}" -f $posIndex

  $positions.Add([PSCustomObject]@{
    PositionID     = $positionId
    PositionTitle  = $seed.position_title
    Department     = $seed.department
    Division       = $seed.division
    BusinessUnit   = $seed.business_unit
    JobGrade       = $seed.job_grade
    Criticality    = Criticality-Of $seed.position_title
  })

  # Every 7th sampled position is left vacant (~14%) — a deliberate, fixed
  # pattern rather than random, so "Vacancies" always comes out to a
  # reproducible, explainable count.
  $isVacant = ($posIndex % 7 -eq 0)
  if ($isVacant) {
    $incumbents.Add([PSCustomObject]@{
      PositionID       = $positionId
      EmployeeID       = $null
      TimeInRoleYears  = $null
      RetirementRisk   = $null
    })
  } else {
    $incumbents.Add([PSCustomObject]@{
      PositionID       = $positionId
      EmployeeID       = $seed.employee_id
      TimeInRoleYears  = [Math]::Round([double]$seed.length_of_service, 1)
      RetirementRisk   = Retirement-Risk-Of $seed.age
    })
  }

  # Successor pool: active Supervisory/Managerial employees in the SAME
  # department, excluding the incumbent, longest-tenured first (a
  # "next-in-line by experience" heuristic, not random selection).
  $pool = $active | Where-Object {
    $_.department -eq $seed.department -and
    $_.job_level -in @("Supervisory", "Managerial") -and
    $_.employee_id -ne $seed.employee_id
  } | Sort-Object { [double]$_.length_of_service } -Descending

  # Coverage deliberately varies 0/1/2/1 per position in rotation, so roughly
  # a quarter of positions have NO identified successor — a real succession
  # plan always has gaps; 100% coverage wouldn't be a believable roster.
  # When 2 successors are named, the 1st is always the longest-tenured
  # candidate (the "ready now" primary pick, as a real succession plan's top
  # choice usually is) and the 2nd is drawn from a rotating depth into the
  # rest of the pool (30/55/80/95% of the way down, cycling by position) —
  # this department's Supervisory/Managerial tenure skews long, so a fixed
  # depth landed almost every pick in either "Ready Now" or "Not Ready" with
  # nothing in between; rotating the depth spreads the 2nd pick across all
  # 4 Readiness bands instead.
  $successorCount = @(0, 1, 2, 1)[$posIndex % 4]
  $depthOptions = @(0.3, 0.55, 0.8, 0.95)
  $picked = New-Object System.Collections.Generic.List[object]
  if ($successorCount -ge 1 -and $pool.Count -ge 1) { $picked.Add($pool[0]) }
  if ($successorCount -ge 2 -and $pool.Count -ge 2) {
    $depthIdx = [Math]::Min($pool.Count - 1, [Math]::Floor($pool.Count * $depthOptions[$posIndex % 4]))
    $picked.Add($pool[$depthIdx])
  }
  $rank = 0
  foreach ($p in $picked) {
    $rank++
    $successors.Add([PSCustomObject]@{
      PositionID           = $positionId
      SuccessorEmployeeID  = $p.employee_id
      Readiness            = Readiness-Of ([double]$p.length_of_service)
      IsHighPotential      = if ($rank -eq 1) { "TRUE" } else { "FALSE" }
    })
  }
}

Write-Output "Critical positions: $($positions.Count)"
Write-Output "Incumbents: $($incumbents.Count) ($(($incumbents | Where-Object { -not $_.EmployeeID }).Count) vacant)"
Write-Output "Successors: $($successors.Count)"

$positions  | Export-Csv "$dir\critical_positions.csv" -NoTypeInformation -Force
$incumbents | Export-Csv "$dir\incumbents.csv" -NoTypeInformation -Force
$successors | Export-Csv "$dir\successors.csv" -NoTypeInformation -Force
Write-Output "Saved CSVs to $dir"
