$ErrorActionPreference = "Stop"
$Dir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\HR Reports"
$ScriptDir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\scripts\sap-migration"
$OutPath = Join-Path $ScriptDir "employee_benefits_draft.csv"
$LogPath = Join-Path $ScriptDir "employee_benefits_build.log"

function Norm($v) {
    if ($null -eq $v) { return "" }
    return "$v".Trim()
}
function ToNumStr($v) {
    if ($null -eq $v -or "$v" -eq "") { return "" }
    try { return ([double]$v).ToString() } catch { return "" }
}
function CsvEscape($v) {
    $s = "$v"
    $s = $s -replace '"', '""'
    return '"' + $s + '"'
}

# Scope: only employees already in the live employee_master (Qatar+Egypt,
# already filtered there) -- Test3 covers the whole company (Algeria/Syria
# included), so this both applies the same scope filter and guarantees every
# row here satisfies the employee_benefits.employee_id FK.
Write-Host "Reading employee_master_draft.csv for scope..."
$scopeIds = [System.Collections.Generic.HashSet[string]]::new()
Import-Csv (Join-Path $ScriptDir "employee_master_draft.csv") | ForEach-Object { [void]$scopeIds.Add($_.employee_id) }
Write-Host "  $($scopeIds.Count) employees in scope"

Write-Host "Reading Test3 (Job Info)..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open((Join-Path $Dir "Test3-Page1-Component1 (4).xlsx"), $null, $true)
$ws = $wb.Worksheets.Item(1)
$used = $ws.UsedRange
$rows = $used.Rows.Count
$cols = $used.Columns.Count

# CASE-SENSITIVE header index -- REQUIRED here specifically. This file has
# TWO differently-sourced columns that both read as "Person ID" in a casual
# scan: col 1 "Person Id" (SuccessFactors' own internal id, e.g. 128794 --
# matches NOTHING in employee_master) and col 10 "Person ID" (matches
# employee_master.employee_id 100% -- verified 3,148/3,148 directly).
# PowerShell's native @{} hashtable is case-INSENSITIVE for string keys, so
# building this index with @{} silently collapses those two into one entry
# and keeps whichever is written first (col 1, the wrong one) -- this is
# almost certainly why the original SAP migration concluded Test3 had no
# usable join key and gave up on it. A case-sensitive .NET Dictionary avoids
# that collision entirely.
$headers = [System.Collections.Generic.Dictionary[string,int]]::new([StringComparer]::Ordinal)
for ($c = 1; $c -le $cols; $c++) {
    $hTxt = Norm $ws.Cells.Item(3, $c).Value2
    if ($hTxt -and -not $headers.ContainsKey($hTxt)) { $headers[$hTxt] = $c }
}
$data = $used.Value2
$wb.Close($false)
$excel.Quit()

$personIdCol = $headers["Person ID"]
if (-not $personIdCol) { throw "Could not find the 'Person ID' column (case-sensitive) in Test3 -- header layout may have changed." }
Write-Host "  Using column $personIdCol as the real employee_id join key"

$outHeader = @(
    "employee_id", "employment_type", "housing_ctc", "transportation_ctc",
    "communication_allowance", "education_allowance", "medical_insurance_expense",
    "ticket_class", "ticket_cycle", "ot_eligibility", "variable_pay_eligibility"
)
$outRows = New-Object System.Collections.Generic.List[string]
$outRows.Add(($outHeader | ForEach-Object { CsvEscape $_ }) -join ",")

$countTotal = 0
$countInScope = 0
$countDuplicateIds = 0
$seenIds = [System.Collections.Generic.HashSet[string]]::new()

for ($r = 4; $r -le $rows; $r++) {
    $countTotal++
    $empId = Norm $data[$r, $personIdCol]
    if (-not $empId -or -not $scopeIds.Contains($empId)) { continue }
    if (-not $seenIds.Add($empId)) { $countDuplicateIds++; continue }
    $countInScope++

    $row = @(
        $empId,
        (Norm $data[$r, $headers["Employment Type (Picklist Label)"]]),
        (ToNumStr $data[$r, $headers["Housing CTC (Non Cash)"]]),
        (ToNumStr $data[$r, $headers["Transportation CTC (Non Cash)"]]),
        (ToNumStr $data[$r, $headers["Communication Allowance (Non Cash)"]]),
        (ToNumStr $data[$r, $headers["Education Allowance (NonCash)"]]),
        (ToNumStr $data[$r, $headers["Medical Insurance Expense (Non Cash)"]]),
        (Norm $data[$r, $headers["Ticket Class (Picklist Label)"]]),
        (Norm $data[$r, $headers["Ticket Cycle (Picklist Label)"]]),
        (Norm $data[$r, $headers["OT Eligibility New (Picklist Label)"]]),
        (Norm $data[$r, $headers["Variable Pay Eligibility (Picklist Label)"]])
    )
    $outRows.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",")
}

$outRows | Out-File -FilePath $OutPath -Encoding utf8

$log = @"
Test3 total data rows: $countTotal
Rows matched into employee_master scope: $countInScope
Duplicate employee_id rows skipped (kept first occurrence): $countDuplicateIds
Employees in scope with NO Test3 row at all: $($scopeIds.Count - $countInScope - $countDuplicateIds)
Rows written (incl. header): $($outRows.Count)
"@
$log | Out-File -FilePath $LogPath -Encoding utf8
Write-Host $log
