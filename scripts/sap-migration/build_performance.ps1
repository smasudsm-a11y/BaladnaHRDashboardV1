$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"
$Get_Random_Seed = 20260917
$rng = New-Object System.Random($Get_Random_Seed)

$RATING_ORDER = @("Below Expectations", "Meets Some Expectations", "Meets Expectations", "Exceeds Expectations", "Exceptional")
# weights matching the old table's own real distribution (4.7/12.3/56.3/18.9/7.8%)
$WEIGHTS = @(5, 12, 56, 19, 8)

function WeightedRating() {
    $total = ($WEIGHTS | Measure-Object -Sum).Sum
    $roll = $rng.Next(0, $total)
    $acc = 0
    for ($i = 0; $i -lt $WEIGHTS.Count; $i++) {
        $acc += $WEIGHTS[$i]
        if ($roll -lt $acc) { return $RATING_ORDER[$i] }
    }
    return $RATING_ORDER[-1]
}

function ScoreFor($ratingIndex) {
    # ratingIndex: 1..5. mean loosely tied to tier, generous overlap noise --
    # matches the old table's own pattern (categorical rating and the two
    # numeric scores were noisy/loosely correlated, not a strict formula).
    $mean = 2.0 + 0.5 * $ratingIndex
    $noise = ($rng.NextDouble() * 1.6) - 0.8
    $v = $mean + $noise
    if ($v -lt 1.0) { $v = 1.0 }
    if ($v -gt 5.0) { $v = 5.0 }
    return [Math]::Round($v, 1)
}

function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

$employees = Import-Csv (Join-Path $Scratch "employee_master_new.csv")
Write-Host "employees: $($employees.Count)"

$CYCLES = @(
    @{ label = "2023 Annual"; cutoff = [DateTime]"2023-12-01"; dateMin = [DateTime]"2023-12-10"; dateMax = [DateTime]"2023-12-28" },
    @{ label = "2024 Annual"; cutoff = [DateTime]"2024-12-01"; dateMin = [DateTime]"2024-12-10"; dateMax = [DateTime]"2024-12-28" },
    @{ label = "2025 Annual"; cutoff = [DateTime]"2025-12-01"; dateMin = [DateTime]"2025-12-10"; dateMax = [DateTime]"2025-12-28" }
)

$rows = New-Object System.Collections.Generic.List[object]
$ratingCounts = @{}

foreach ($e in $employees) {
    if (-not $e.hire_date) { continue }
    $hireDate = [DateTime]::Parse($e.hire_date)
    $termDate = $null
    if ($e.termination_date) { $termDate = [DateTime]::Parse($e.termination_date) }

    foreach ($cycle in $CYCLES) {
        if ($hireDate -gt $cycle.cutoff) { continue }
        if ($termDate -and $termDate -le $cycle.cutoff) { continue }

        $overall = WeightedRating
        $overallIdx = $RATING_ORDER.IndexOf($overall) + 1
        $goal = ScoreFor $overallIdx
        $comp = ScoreFor $overallIdx

        # manager (pre-calibration) rating: ~8% of the time nudged one band
        # from the post-calibration (overall/calibration) rating -- matches
        # how rare an "adjusted in calibration" row was in the old table.
        $managerIdx = $overallIdx
        if ($rng.Next(0, 100) -lt 8) {
            $managerIdx = $overallIdx + ($(if ($rng.Next(0,2) -eq 0) { -1 } else { 1 }))
            if ($managerIdx -lt 1) { $managerIdx = 1 }
            if ($managerIdx -gt 5) { $managerIdx = 5 }
        }
        $managerRating = $RATING_ORDER[$managerIdx - 1]

        # promotion recommendation: only ever "Yes" for Exceeds/Exceptional,
        # ~36% of the time -- matches the old table's own ratio exactly
        # (194/531 Exceeds, 78/219 Exceptional).
        $promo = "No"
        if (($overall -eq "Exceeds Expectations" -or $overall -eq "Exceptional") -and $rng.Next(0, 100) -lt 36) { $promo = "Yes" }

        $days = ($cycle.dateMax - $cycle.dateMin).Days
        $ratingDate = $cycle.dateMin.AddDays($rng.Next(0, $days + 1))

        $rows.Add(@(
            $e.employee_id, $cycle.label, $goal, $comp, $overall,
            $ratingDate.ToString("yyyy-MM-dd"), $managerRating, $overall, $promo
        ))
        if (-not $ratingCounts.ContainsKey($overall)) { $ratingCounts[$overall] = 0 }
        $ratingCounts[$overall]++
    }
}

WriteCsv (Join-Path $Scratch "performance_new.csv") @("employee_id","performance_cycle","goal_score","competency_score","overall_rating","rating_date","manager_rating","calibration_rating","promotion_recommendation") $rows

Write-Host "performance rows: $($rows.Count)"
$ratingCounts.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
