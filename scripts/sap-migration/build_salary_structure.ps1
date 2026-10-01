$ErrorActionPreference = "Stop"
$Dir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\HR Reports"
# Output goes next to the other SAP drafts (was an old session's temp folder).
# Writes salary_structure_rebuilt.csv -- compare it with
# salary_structure_draft.csv before replacing the draft.
$Scratch = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\scripts\sap-migration"

# Positions whose Sal. Min/Mid/Max are in US DOLLARS even though Position
# Data labels them QAR -- Syria-project roles in Group Finance (division
# Q.P.S.C). User-confirmed 2026-10-01. Their range read as QAR sat at ~27%
# (1/3.64) of a normal range for the grade, which made their holders look
# up to +258% above midpoint. Converted at the fixed QAR peg before grouping.
# Pay for these employees is recorded in QAR, so only the ranges convert.
# Add a position number here if Total Rewards confirms another USD range.
$UsdRangePositions = @("50203780", "50213777", "50192214", "50200332")
$QarPerUsd = 3.64

# Positions left out of range building entirely. 41201410 is a consultant
# role (GCEO Office, G17 SPECIAL DESIGNATION) whose recorded range,
# 940/1,130/1,320, isn't a real pay band -- user-confirmed 2026-10-01. It was
# the only position in that (grade, job family), so excluding it removes the
# band and its holder drops out of all band-based analysis.
$ExcludedPositions = @("41201410")

# Positions whose recorded range is a known SAP system error (user-confirmed
# 2026-10-01). Their range is ignored when voting, so their (grade, job
# family) takes the standard Qatar range from the other positions -- which it
# already did by majority (50195364: G12 SALES, 2,027-2,533 vs 7 positions
# on 5,700-7,130; 50189486: G6 MAINTENANCE, 1,500-1,730 vs 18 positions on
# 3,700-4,800). Listed so a future refresh can't let the bad range win a
# group where these become the only or tied position. Unlike
# $ExcludedPositions, the holders still get a band.
$SystemErrorRangePositions = @("50195364", "50189486")

function Norm($v) { if ($null -eq $v) { return "" }; return "$v".Trim() }
function GradeToG($gradeLabel) {
    if ("$gradeLabel" -match 'Grade-(\d+)') { return "G$($Matches[1])" }
    return Norm $gradeLabel
}
function GradeTier($gradeLabel) {
    if ("$gradeLabel" -notmatch 'Grade-(\d+)') { return "" }
    $n = [int]$Matches[1]
    if ($n -ge 1 -and $n -le 4) { return "Junior" }
    if ($n -ge 5 -and $n -le 8) { return "Mid" }
    if ($n -ge 9 -and $n -le 12) { return "Senior" }
    if ($n -ge 13 -and $n -le 14) { return "Executive" }
    if ($n -eq 15) { return "Specialist/Supervisor" }
    if ($n -ge 16 -and $n -le 18) { return "Managerial" }
    if ($n -ge 19 -and $n -le 20) { return "Director" }
    if ($n -ge 21 -and $n -le 22) { return "Chief" }
    if ($n -ge 23 -and $n -le 24) { return "CEO/Group CEO" }
    return ""
}
function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$path = Join-Path $Dir "Position_Data-Ever-Component1 (1).xlsx"
$wb = $excel.Workbooks.Open($path, $null, $true)
$ws = $wb.Worksheets.Item(1)
$used = $ws.UsedRange
$rows = $used.Rows.Count
$cols = $used.Columns.Count
$h = @{}
for ($c = 1; $c -le $cols; $c++) {
    $hh = "$($ws.Cells.Item(3, $c).Value2)".Trim()
    if ($hh -and -not $h.ContainsKey($hh)) { $h[$hh] = $c }
}
$data = $used.Value2

$countryToCurrency = @{ "Qatar" = "QAR"; "Egypt" = "EGP" }

# group (Currency, Grade, JobFamily) -> band -> count, Qatar+Egypt each keyed by their own currency
$groups = @{}
$usdConverted = 0
$excludedCount = 0
$ignoredCount = 0
$convertedBands = @{}
for ($r = 4; $r -le $rows; $r++) {
    $country = Norm $data[$r, $h["Country (Label)"]]
    if (-not $countryToCurrency.ContainsKey($country)) { continue }
    $currency = $countryToCurrency[$country]
    $grade = Norm $data[$r, $h["Grade (Label)"]]
    $jf = Norm $data[$r, $h["Jobfamily (Label)"]]
    if (-not $grade -or -not $jf) { continue }
    $key = "$currency|$grade|$jf"
    $min = $data[$r, $h["Sal. Min"]]; $mid = $data[$r, $h["Sal. Mid"]]; $max = $data[$r, $h["Sal. Max"]]
    if ($null -eq $min -or "$min" -eq "") { continue }
    $posNo = Norm $data[$r, $h["Position No."]]
    if ($ExcludedPositions -contains $posNo) { $excludedCount++; continue }
    if ($SystemErrorRangePositions -contains $posNo) { $ignoredCount++; continue }
    if ($UsdRangePositions -contains $posNo) {
        $min = [math]::Round([double]$min * $QarPerUsd); $mid = [math]::Round([double]$mid * $QarPerUsd); $max = [math]::Round([double]$max * $QarPerUsd)
        $usdConverted++
        $convertedBands["$min|$mid|$max"] = $true
    }
    $band = "$min|$mid|$max"
    if (-not $groups.ContainsKey($key)) { $groups[$key] = @{} }
    if (-not $groups[$key].ContainsKey($band)) { $groups[$key][$band] = 0 }
    $groups[$key][$band]++
}

$outRows = New-Object System.Collections.Generic.List[object]
$ambiguousRows = New-Object System.Collections.Generic.List[object]
foreach ($kv in $groups.GetEnumerator()) {
    $key = $kv.Key
    $parts = $key -split '\|', 3
    $currency = $parts[0]; $grade = $parts[1]; $jf = $parts[2]
    $bands = $kv.Value
    # pick the band with the most positions backing it (mode). On a tie,
    # prefer a band native to the currency over a USD-converted one (the
    # Syria-project ranges run ~10-15% above the standard QAR scale -- e.g.
    # G18 PROJECT DELIVERY: 1 USD position vs 1 standard position, whose
    # 36,200 mid matches every other G18 job family); then first-seen.
    $bestBand = $null; $bestCount = -1
    foreach ($b in $bands.GetEnumerator()) {
        $better = $b.Value -gt $bestCount -or
            ($b.Value -eq $bestCount -and $convertedBands.ContainsKey($bestBand) -and -not $convertedBands.ContainsKey($b.Key))
        if ($better) { $bestCount = $b.Value; $bestBand = $b.Key }
    }
    $bandParts = $bestBand -split '\|'
    $outRows.Add(@((GradeToG $grade), $jf, $currency, [double]$bandParts[0], [double]$bandParts[1], [double]$bandParts[2], (GradeTier $grade)))
    if ($bands.Count -gt 1) {
        $ambiguousRows.Add(@($currency, $grade, $jf, ($bands.Keys -join " | "), "used majority band: $bestBand ($bestCount positions)"))
    }
}

WriteCsv (Join-Path $Scratch "salary_structure_rebuilt.csv") @("grade","job_family","currency","salary_range_min","salary_midpoint","salary_range_max","grade_tier") $outRows
WriteCsv (Join-Path $Scratch "salary_structure_ambiguous_rebuilt.csv") @("currency","grade","job_family","all_bands_seen","resolution") $ambiguousRows

Write-Host "USD ranges converted at $QarPerUsd QAR/USD: $usdConverted of $($UsdRangePositions.Count) listed positions"
Write-Host "Positions excluded: $excludedCount of $($ExcludedPositions.Count) listed"
Write-Host "System-error ranges ignored: $ignoredCount of $($SystemErrorRangePositions.Count) listed"
Write-Host "salary_structure rows: $($outRows.Count)"
Write-Host "ambiguous combos (manual review): $($ambiguousRows.Count)"

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
