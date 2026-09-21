$ErrorActionPreference = "Stop"
$Dir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\HR Reports"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"

function ToIntStr($v) {
    if ($null -eq $v -or "$v" -eq "") { return "" }
    try { return ([int64][double]$v).ToString() } catch { return "$v".Trim() }
}
function ToNumStr($v) {
    if ($null -eq $v -or "$v" -eq "") { return "" }
    try { return ([double]$v).ToString([System.Globalization.CultureInfo]::InvariantCulture) } catch { return "" }
}
function Norm($v) { if ($null -eq $v) { return "" }; return "$v".Trim() }
function GradeToG($gradeLabel) {
    if ("$gradeLabel" -match 'Grade-(\d+)') { return "G$($Matches[1])" }
    return Norm $gradeLabel
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

# --- cost_centers ---
$ccSeen = @{}
$ccRows = New-Object System.Collections.Generic.List[object]
# --- budgeted_positions ---
$deptCount = @{}
# --- critical_positions / incumbents / successors ---
$cpRows = New-Object System.Collections.Generic.List[object]
$incRows = New-Object System.Collections.Generic.List[object]

for ($r = 4; $r -le $rows; $r++) {
    $country = Norm $data[$r, $h["Country (Label)"]]
    if ($country -ne "Qatar" -and $country -ne "Egypt") { continue }

    $dept = Norm $data[$r, $h["department (Label)"]]
    if ($dept) {
        if (-not $deptCount.ContainsKey($dept)) { $deptCount[$dept] = 0 }
        $deptCount[$dept]++
    }

    $ccId = Norm $data[$r, $h["costCenter (Cost Center ID)"]]
    if ($ccId -and -not $ccSeen.ContainsKey($ccId)) {
        $ccSeen[$ccId] = $true
        $ccRows.Add(@($ccId, (Norm $data[$r, $h["division (Label)"]]), $dept))
    }

    $posNo = ToIntStr $data[$r, $h["Position No."]]
    $criticality = Norm $data[$r, $h["positionCriticality (Picklist Label)"]]
    if ($criticality -eq "Critical") {
        $cpRows.Add(@(
            $posNo,
            (Norm $data[$r, $h["Position Name (Label)"]]),
            $dept,
            (Norm $data[$r, $h["division (Label)"]]),
            (Norm $data[$r, $h["Cluster (Cluster)"]]),
            (GradeToG (Norm $data[$r, $h["Grade (Label)"]])),
            "Critical"
        ))
        $vacant = Norm $data[$r, $h["vacant"]]
        $empNo = ToIntStr $data[$r, $h["Emp No."]]
        $incRows.Add(@($posNo, $(if ($vacant -eq "True") { "" } else { $empNo })))
    }
}

WriteCsv (Join-Path $Scratch "cost_centers_new.csv") @("cost_center","division","department") $ccRows

$bpRows = New-Object System.Collections.Generic.List[object]
foreach ($kv in $deptCount.GetEnumerator()) { $bpRows.Add(@($kv.Key, $kv.Value)) }
WriteCsv (Join-Path $Scratch "budgeted_positions_new.csv") @("department","budgeted_headcount") $bpRows

WriteCsv (Join-Path $Scratch "critical_positions_new.csv") @("position_id","position_title","department","division","business_unit","job_grade","criticality") $cpRows
WriteCsv (Join-Path $Scratch "incumbents_partial_new.csv") @("position_id","employee_id_raw_placeholder") $incRows

Write-Host "cost_centers rows: $($ccRows.Count)"
Write-Host "budgeted_positions rows (departments): $($bpRows.Count)"
Write-Host "critical_positions rows (Qatar+Egypt, Critical only): $($cpRows.Count)"
Write-Host "incumbents partial rows: $($incRows.Count)  (vacant: $(($incRows | Where-Object { $_[1] -eq '' }).Count))"

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
