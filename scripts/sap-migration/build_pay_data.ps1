$ErrorActionPreference = "Stop"
$Dir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\HR Reports"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"

function ToDateStr($oaDate) {
    if ($null -eq $oaDate -or "$oaDate" -eq "") { return "" }
    try { return ([DateTime]::FromOADate([double]$oaDate)).ToString("yyyy-MM-dd") } catch { return "" }
}
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

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

function Read-SapSheet($fname) {
    $path = Join-Path $Dir $fname
    $wb = $excel.Workbooks.Open($path, $null, $true)
    $ws = $wb.Worksheets.Item(1)
    $used = $ws.UsedRange
    $rows = $used.Rows.Count
    $cols = $used.Columns.Count
    $headers = @{}
    for ($c = 1; $c -le $cols; $c++) {
        $hh = "$($ws.Cells.Item(3, $c).Value2)".Trim()
        if ($hh -and -not $headers.ContainsKey($hh)) { $headers[$hh] = $c }
    }
    $data = $used.Value2
    $wb.Close($false)
    return @{ headers = $headers; data = $data; rows = $rows; cols = $cols }
}

# in-scope employee_id set from the employee_master draft
$scopeIds = @{}
Import-Csv (Join-Path $Scratch "employee_master_new.csv") | ForEach-Object { $scopeIds[$_.employee_id] = $true }
Write-Host "in-scope employees: $($scopeIds.Count)"

Write-Host "Reading Non-Recurring Payments..."
$nrp = Read-SapSheet "Non-RecurringPaymentDetails-Component1.xlsx"
$h2 = $nrp.headers; $d2 = $nrp.data
$bonusSum = @{}
$incentiveSum = @{}
for ($r = 4; $r -le $nrp.rows; $r++) {
    $empPid = ToIntStr $d2[$r, $h2["Person ID"]]
    if (-not $empPid -or -not $scopeIds.ContainsKey($empPid)) { continue }
    $comp = Norm $d2[$r, $h2["Pay Component (Name)"]]
    $amt = 0.0
    try { $amt = [double]$d2[$r, $h2["Amount"]] } catch { $amt = 0.0 }
    if ($comp -eq "Sales Commission" -or $comp -eq "Incentive") {
        if (-not $incentiveSum.ContainsKey($empPid)) { $incentiveSum[$empPid] = 0.0 }
        $incentiveSum[$empPid] += $amt
    } elseif ($comp -eq "Miscellaneous Earnings") {
        if (-not $bonusSum.ContainsKey($empPid)) { $bonusSum[$empPid] = 0.0 }
        $bonusSum[$empPid] += $amt
    }
    # TRA CTC(ALL), HRA CTC(Non Aura), Air Ticket*, Business Trip PerDiem, Finance Reimbursement:
    # deliberately excluded -- non-cash CTC restatements / reimbursements, not bonus or incentive.
}
Write-Host "  employees with incentive: $($incentiveSum.Count)  bonus: $($bonusSum.Count)"

Write-Host "Reading Master List..."
$ml = Read-SapSheet "BaladnaEmployeeMasterList_1_Comp_Details_ALL-Component1 (9).xlsx"
$h = $ml.headers; $data = $ml.data

$bsRows = New-Object System.Collections.Generic.List[string]
$bsRows.Add((@("employee_id","grade","position","base_salary","currency","salary_effective_date") | ForEach-Object { CsvEscape $_ }) -join ",")
$trRows = New-Object System.Collections.Generic.List[string]
$trRows.Add((@("employee_id","salary_effective_date","housing_allowance","transport_allowance","education_allowance","other_allowances","variable_pay","bonus","incentive","total_cash_compensation","total_remuneration") | ForEach-Object { CsvEscape $_ }) -join ",")

$countBasicBlank = 0
$countCurSalBlank = 0

for ($r = 4; $r -le $ml.rows; $r++) {
    $country = Norm $data[$r, $h["Country"]]
    if ($country -ne "Qatar" -and $country -ne "Egypt") { continue }
    $empId = ToIntStr $data[$r, $h["Employee Number"]]
    if (-not $empId) { continue }

    $effDate = ToDateStr $data[$r, $h["Position Date Change"]]
    $gradeLabel = Norm $data[$r, $h["Grade"]]
    $basic = ToNumStr $data[$r, $h["Basic"]]
    if (-not $basic) { $countBasicBlank++ }
    $curSal = ToNumStr $data[$r, $h["Current Salary"]]
    if (-not $curSal) { $countCurSalBlank++ }

    $bsRow = @(
        $empId,
        (GradeToG $gradeLabel),
        (Norm $data[$r, $h["Position"]]),
        $basic,
        (Norm $data[$r, $h["Currency (code)"]]),
        $effDate
    )
    $bsRows.Add(($bsRow | ForEach-Object { CsvEscape $_ }) -join ",")

    $food = 0.0; try { $food = [double]$data[$r, $h["Food Allowance"]] } catch {}
    $other = 0.0; try { $other = [double]$data[$r, $h["Other Allowance"]] } catch {}
    $social = 0.0; try { $social = [double]$data[$r, $h["Social Allowance"]] } catch {}
    $shift = 0.0; try { $shift = [double]$data[$r, $h["Shift Incentive"]] } catch {}
    $otherAllowances = $food + $other + $social + $shift

    $bonus = $(if ($bonusSum.ContainsKey($empId)) { $bonusSum[$empId] } else { 0.0 })
    $incentive = $(if ($incentiveSum.ContainsKey($empId)) { $incentiveSum[$empId] } else { 0.0 })
    $totalCash = $(if ($curSal) { [double]$curSal } else { 0.0 })
    $totalRem = $totalCash + $bonus + $incentive

    $trRow = @(
        $empId,
        $effDate,
        (ToNumStr $data[$r, $h["HRA"]]),
        (ToNumStr $data[$r, $h["TRP"]]),
        "",
        (ToNumStr $otherAllowances),
        "",
        (ToNumStr $bonus),
        (ToNumStr $incentive),
        $curSal,
        (ToNumStr $totalRem)
    )
    $trRows.Add(($trRow | ForEach-Object { CsvEscape $_ }) -join ",")
}

$bsRows | Out-File -FilePath (Join-Path $Scratch "base_salary_new.csv") -Encoding utf8
$trRows | Out-File -FilePath (Join-Path $Scratch "total_rewards_new.csv") -Encoding utf8

Write-Host "base_salary rows: $($bsRows.Count - 1)  (Basic blank: $countBasicBlank)"
Write-Host "total_rewards rows: $($trRows.Count - 1)  (Current Salary blank: $countCurSalBlank)"

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
