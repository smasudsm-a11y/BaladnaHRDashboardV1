$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"

# Adapted from scripts/succession-data/generate_succession_data.ps1's
# successor-selection logic -- critical_positions/incumbents are now real
# (from SAP Position Data), so this only regenerates `successors`, which has
# no source anywhere in the SAP batch. Deterministic, same as the original
# (no Get-Random), for the same reason: a succession roster reads better as
# a stable, explainable selection than dice rolls.

function GradeNum($g) {
    if ("$g" -match 'G(\d+)') { return [int]$Matches[1] }
    return 0
}
function Readiness-Of($tenureYears) {
    if ($tenureYears -ge 3) { return "Ready Now" }
    if ($tenureYears -ge 1.5) { return "Ready 1-2 Years" }
    if ($tenureYears -ge 0.5) { return "Ready 3-5 Years" }
    return "Not Ready"
}
function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

$LEADERSHIP_LEVELS = @("Specialist/Supervisor", "Managerial", "Director", "Chief", "CEO/Group CEO")

$employees = Import-Csv (Join-Path $Scratch "employee_master_new.csv")
$active = $employees | Where-Object { $_.employment_status -eq "Active" }
$empIndex = @{}
foreach ($e in $employees) { $empIndex[$e.employee_id] = $e }

$positions = Import-Csv (Join-Path $Scratch "critical_positions_new.csv")
$incumbents = Import-Csv (Join-Path $Scratch "incumbents_new.csv")
$incByPos = @{}
foreach ($i in $incumbents) { $incByPos[$i.position_id] = $i }

$successors = New-Object System.Collections.Generic.List[object]
$posIndex = 0

foreach ($pos in $positions) {
    $posIndex++
    $inc = $incByPos[$pos.position_id]
    $incEmpId = $inc.employee_id
    $incGradeNum = $(if ($incEmpId -and $empIndex.ContainsKey($incEmpId)) { GradeNum $empIndex[$incEmpId].job_grade } else { GradeNum $pos.job_grade })

    $pool = $active | Where-Object {
        $_.department -eq $pos.department -and
        ($LEADERSHIP_LEVELS -contains $_.job_level) -and
        $_.employee_id -ne $incEmpId -and
        (GradeNum $_.job_grade) -lt $incGradeNum
    } | Sort-Object { [double]$_.length_of_service } -Descending

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
        $successors.Add(@($pos.position_id, $p.employee_id, (Readiness-Of ([double]$p.length_of_service)), $(if ($rank -eq 1) { "true" } else { "false" })))
    }
}

WriteCsv (Join-Path $Scratch "successors_new.csv") @("position_id","successor_employee_id","readiness","is_high_potential") $successors
$posWithAny = ($successors | ForEach-Object { $_[0] } | Sort-Object -Unique).Count
Write-Host "successors rows: $($successors.Count)"
Write-Host "positions with >=1 successor: $posWithAny of $($positions.Count)"
