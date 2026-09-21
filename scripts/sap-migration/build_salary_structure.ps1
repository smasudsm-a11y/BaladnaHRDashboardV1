$ErrorActionPreference = "Stop"
$Dir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\HR Reports"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"

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
    # pick the band with the most positions backing it (mode); ties broken by first-seen
    $bestBand = $null; $bestCount = -1
    foreach ($b in $bands.GetEnumerator()) {
        if ($b.Value -gt $bestCount) { $bestCount = $b.Value; $bestBand = $b.Key }
    }
    $bandParts = $bestBand -split '\|'
    $outRows.Add(@((GradeToG $grade), $jf, $currency, [double]$bandParts[0], [double]$bandParts[1], [double]$bandParts[2], (GradeTier $grade)))
    if ($bands.Count -gt 1) {
        $ambiguousRows.Add(@($currency, $grade, $jf, ($bands.Keys -join " | "), "used majority band: $bestBand ($bestCount positions)"))
    }
}

WriteCsv (Join-Path $Scratch "salary_structure_new.csv") @("grade","job_family","currency","salary_range_min","salary_midpoint","salary_range_max","grade_tier") $outRows
WriteCsv (Join-Path $Scratch "salary_structure_ambiguous_new.csv") @("currency","grade","job_family","all_bands_seen","resolution") $ambiguousRows

Write-Host "salary_structure rows: $($outRows.Count)"
Write-Host "ambiguous combos (manual review): $($ambiguousRows.Count)"

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
