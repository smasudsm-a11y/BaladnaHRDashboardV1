$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"
$ci = [System.Globalization.CultureInfo]::InvariantCulture

# Adapted from scripts/probation-pip-data/generate_probation_pip_data.ps1,
# re-pointed at the new real employee_master + the freshly-regenerated
# performance draft. Same Parse-DMY -> Parse-ISO fix as build_payroll.ps1
# (the original assumed d/M/yyyy; both old and new employee_master.csv are
# actually ISO). The [array]::IndexOf bug the original script's own comment
# documents (collapses to a scalar for a 1-entry history) is preserved-fixed
# here too via the same @($hist) cast.
function Parse-ISO($s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  [datetime]::ParseExact($s, "yyyy-MM-dd", $ci)
}
function Fmt($d) { $d.ToString("yyyy-MM-dd") }
function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

Write-Output "Loading source CSVs..."
$employees = Import-Csv (Join-Path $Scratch "employee_master_new.csv")
$performanceRows = Import-Csv (Join-Path $Scratch "performance_new.csv")

$perfByEmp = @{}
foreach ($r in $performanceRows) {
  $d = Parse-ISO $r.rating_date
  if (-not $perfByEmp.ContainsKey($r.employee_id)) { $perfByEmp[$r.employee_id] = @() }
  $perfByEmp[$r.employee_id] += [PSCustomObject]@{ Date = $d; Rating = $r.overall_rating }
}
foreach ($k in @($perfByEmp.Keys)) { $perfByEmp[$k] = @($perfByEmp[$k] | Sort-Object Date) }

$probationRows = New-Object System.Collections.Generic.List[object]
foreach ($e in $employees) {
  $hireDate = Parse-ISO $e.hire_date
  if (-not $hireDate) { continue }
  $termDate = Parse-ISO $e.termination_date
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

  $probationRows.Add(@($e.employee_id, (Fmt $hireDate), (Fmt $reviewDate), $outcome))
}
WriteCsv (Join-Path $Scratch "probation_reviews_new.csv") @("employee_id","probation_start_date","review_date","outcome") $probationRows
Write-Output "Probation reviews: $($probationRows.Count)"

$pipRows = New-Object System.Collections.Generic.List[object]
foreach ($e in $employees) {
  $hist = if ($perfByEmp.ContainsKey($e.employee_id)) { $perfByEmp[$e.employee_id] } else { @() }
  if ($hist.Count -eq 0) { continue }

  $belowCycles = @($hist | Where-Object { $_.Rating -eq "Below Expectations" })
  if ($belowCycles.Count -eq 0) { continue }
  $trigger = $belowCycles[-1]

  $pipStart = $trigger.Date.AddDays(21)
  $termDate = Parse-ISO $e.termination_date

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

  $reason = "Below Expectations Performance Review ($($trigger.Date.ToString('yyyy-MM')))"
  $pipRows.Add(@($e.employee_id, (Fmt $pipStart), $reason, $month3, $month6))
}
WriteCsv (Join-Path $Scratch "pip_records_new.csv") @("employee_id","pip_start_date","reason","month3_status","month6_status") $pipRows
Write-Output "PIP records: $($pipRows.Count)"
