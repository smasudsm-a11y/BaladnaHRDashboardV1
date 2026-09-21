$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"
$rng = New-Object System.Random(20260917)

$WINDOW_START = [DateTime]"2023-01-01"
$WINDOW_END = [DateTime]"2025-12-31"

function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

function AbsenceType() {
    $r = $rng.Next(0, 100)
    if ($r -lt 20) { return "Late" }
    if ($r -lt 25) { return "Other" }
    if ($r -lt 70) { return "Sick" }
    return "Unplanned"
}

function PaidUnpaid($type) {
    if ($type -eq "Sick") { return "Paid" }
    $r = $rng.Next(0, 100)
    if ($type -eq "Late") { return $(if ($r -lt 39) { "Paid" } else { "Unpaid" }) }
    if ($type -eq "Other") { return $(if ($r -lt 43) { "Paid" } else { "Unpaid" }) }
    return $(if ($r -lt 40) { "Paid" } else { "Unpaid" })  # Unplanned
}

function ApprovalStatus($type, $paid) {
    if ($paid -eq "Paid") { return "Approved" }
    if ($type -eq "Late" -or $type -eq "Unplanned") { return "Unapproved" }
    return "Approved"
}

$employees = Import-Csv (Join-Path $Scratch "employee_master_new.csv")
Write-Host "employees: $($employees.Count)"

$rows = New-Object System.Collections.Generic.List[object]
$typeCounts = @{}

foreach ($e in $employees) {
    if (-not $e.hire_date) { continue }
    $hireDate = [DateTime]::Parse($e.hire_date)
    $endDate = if ($e.termination_date) { [DateTime]::Parse($e.termination_date) } else { $WINDOW_END }

    $winStart = $(if ($hireDate -gt $WINDOW_START) { $hireDate } else { $WINDOW_START })
    $winEnd = $(if ($endDate -lt $WINDOW_END) { $endDate } else { $WINDOW_END })
    if ($winEnd -le $winStart) { continue }
    $yearsEmployed = ($winEnd - $winStart).TotalDays / 365.25

    # rows/year differs by workforce_category -- Labor absentees more than
    # Staff, matching the real Staff/Labor split kpi_targets already assumes
    # (absenteeism_rate_staff 2.5% vs absenteeism_rate_labor 4.0%).
    $ratePerYear = switch ($e.workforce_category) {
        "Labor" { 3.6 }
        "Staff" { 2.0 }
        default { 2.6 }  # Consultant / Internship -- no real target to match, a blend
    }
    $expected = $ratePerYear * $yearsEmployed
    $n = [int][Math]::Floor($expected)
    if (($expected - $n) -gt $rng.NextDouble()) { $n++ }

    for ($i = 0; $i -lt $n; $i++) {
        $days = ($winEnd - $winStart).Days
        $absDate = $winStart.AddDays($rng.Next(0, [Math]::Max(1, $days)))
        $type = AbsenceType
        $hours = switch ($type) {
            "Late" { $rng.Next(1, 4) }
            default { 8 }
        }
        $paid = PaidUnpaid $type
        $approval = ApprovalStatus $type $paid
        $rows.Add(@($e.employee_id, $absDate.ToString("yyyy-MM-dd"), $type, $hours, $paid, $e.department, $e.line_manager_name, $approval))
        if (-not $typeCounts.ContainsKey($type)) { $typeCounts[$type] = 0 }
        $typeCounts[$type]++
    }
}

WriteCsv (Join-Path $Scratch "absenteeism_new.csv") @("employee_id","absence_date","absence_type","absence_hours","paid_unpaid","department","manager","approval_status") $rows

Write-Host "absenteeism rows: $($rows.Count)"
$typeCounts.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
