$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"
$ci = [System.Globalization.CultureInfo]::InvariantCulture

# Adapted from scripts/enps-data/generate_enps_data.ps1, re-pointed at the
# new real employee_master + attrition drafts. Same Parse-DMY -> Parse-ISO
# fix as build_payroll.ps1/build_probation_pip.ps1 for hire_date.
function Parse-ISO($s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  [datetime]::ParseExact($s, "yyyy-MM-dd", $ci)
}
function Fmt($d) { $d.ToString("yyyy-MM-dd") }
function Clamp($v) { [Math]::Max(0, [Math]::Min(10, $v)) }
function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

Write-Output "Loading source CSVs..."
$employees = Import-Csv (Join-Path $Scratch "employee_master_new.csv")
$attritionRows = Import-Csv (Join-Path $Scratch "attrition_new.csv")

$termByEmp = @{}
foreach ($a in $attritionRows) { $termByEmp[$a.employee_id] = Parse-ISO $a.termination_date }

# Reason-code list rebuilt against the REAL SAP termination_reason
# vocabulary this batch actually produced (checked directly against
# attrition_draft.csv's distinct values -- very different labels from the
# old synthetic reason-code list). Same design intent as the original:
# voluntary/growth-motivated scores highest, involuntary/disciplinary
# scores lowest.
$reasonScore = @{
  "RESG-Better Career Opportunity"     = 9
  "RESG-Work-Life Balance"              = 8
  "RESG-Personal Reason"                = 7
  "RESG-Job Security"                   = 6
  "RESG-Manager style"                  = 6
  "RESG-Lack of Growth"                 = 6
  "Medically unfit"                     = 5
  "End of contract"                     = 5
  "Company Restructuring"               = 4
  "A49 - Termination Others"            = 4
  "Termination Others"                  = 3
  "Unsuccessful Probation"               = 3
  "Poor Performance"                     = 2
  "A61-Absenteeism"                       = 2
  "Gross Misconduct"                      = 1
  "Absconded"                             = 1
  "A61-Written Instructions Voilat"       = 1
  "A61 - Drunk at Work/ Under Influ"      = 1
  "A61 - Falsification"                   = 1
  "CID Case"                              = 1
  "Insubordination"                       = 1
  "A61 - Crime Conviction"                = 1
}
# Not a real "exit" in the eNPS sense -- can't survey someone who died, and
# a transfer isn't a departure from the company at all. Excluded from
# exit_surveys entirely rather than forced into a score.
$excludeFromSurvey = @("Deceased", "Transfer To Other Group Company", "Transfer to other Group Co")

function Enps-Category($score) {
  if ($score -ge 9) { return "Promoter" }
  if ($score -ge 7) { return "Passive" }
  return "Detractor"
}

$exitSurveys = New-Object System.Collections.Generic.List[object]
$unmatchedReasons = @{}
foreach ($a in $attritionRows) {
  $termDate = Parse-ISO $a.termination_date
  if (-not $termDate) { continue }
  $reason = $a.termination_reason
  if ($excludeFromSurvey -contains $reason) { continue }
  if ($reasonScore.ContainsKey($reason)) {
    $score = $reasonScore[$reason]
  } else {
    $score = 5
    if ($reason) { $unmatchedReasons[$reason] = $(if ($unmatchedReasons.ContainsKey($reason)) { $unmatchedReasons[$reason] + 1 } else { 1 }) }
  }
  $would = $(if ($score -ge 7) { "true" } else { "false" })
  $exitSurveys.Add(@($a.employee_id, (Fmt ($termDate.AddDays(14))), $score, (Enps-Category $score), $would))
}
WriteCsv (Join-Path $Scratch "exit_surveys_new.csv") @("employee_id","survey_date","enps_score","enps_category","would_recommend") $exitSurveys
Write-Output "Exit surveys: $($exitSurveys.Count)"
if ($unmatchedReasons.Count -gt 0) {
  Write-Output "Termination reasons with no score mapping (defaulted to 5):"
  $unmatchedReasons.GetEnumerator() | Sort-Object -Property Value -Descending | ForEach-Object { Write-Output "  $($_.Key): $($_.Value)" }
}

$stageOffset = @{ "Interview" = 1.5; "Recruiting" = 1.0; "Onboarding" = 0.5; "Probation" = 0 }
$stages = @("Interview", "Recruiting", "Onboarding", "Probation")

$stageScores = New-Object System.Collections.Generic.List[object]
foreach ($e in $employees) {
  $hireDate = Parse-ISO $e.hire_date
  if (-not $hireDate) { continue }
  $reviewDate = $hireDate.AddDays(90)
  $termDate = $termByEmp[$e.employee_id]

  $base = 8
  if ($termDate -and $termDate -le $reviewDate) { $base = 3 }

  foreach ($stage in $stages) {
    $score = [Math]::Round((Clamp ($base + $stageOffset[$stage])), 1)
    $stageScores.Add(@($e.employee_id, $stage, $score, (Fmt $hireDate)))
  }
}
WriteCsv (Join-Path $Scratch "stage_gate_scores_new.csv") @("employee_id","stage","score","score_date") $stageScores
Write-Output "Stage-gate scores: $($stageScores.Count) ($($employees.Count) employees x 4 stages)"
