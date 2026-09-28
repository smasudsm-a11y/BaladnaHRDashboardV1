$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\scripts\sap-migration"
$OutDir = Join-Path $Scratch "workbooks"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Same Write-Sheet approach as build_workbooks.ps1/build_ctc_workbook.ps1: date
# columns written as literal Text (NumberFormat "@") BEFORE assignment, so
# Excel never auto-converts an ISO-date-looking string to a date serial
# (there are none in this sheet, but kept for consistency/reuse).
function Write-Sheet($ws, $csvPath, [System.Collections.Specialized.OrderedDictionary]$fieldToHeader, [string[]]$dateFields) {
    $rows = @(Import-Csv $csvPath)
    $dbFields = @($fieldToHeader.Keys)
    $headers = @($fieldToHeader.Values)
    $colCount = $headers.Count
    $rowCount = $rows.Count

    $textCols = New-Object System.Collections.Generic.List[int]
    for ($c = 0; $c -lt $colCount; $c++) {
        if ($dateFields -contains $dbFields[$c]) { $textCols.Add($c) }
    }
    foreach ($colIdx in $textCols) { $ws.Columns.Item($colIdx + 1).NumberFormat = "@" }

    $arr = New-Object 'object[,]' ($rowCount + 1), $colCount
    for ($c = 0; $c -lt $colCount; $c++) { $arr[0, $c] = $headers[$c] }
    for ($r = 0; $r -lt $rowCount; $r++) {
        for ($c = 0; $c -lt $colCount; $c++) {
            $val = $rows[$r].($dbFields[$c])
            if ($null -eq $val) { $val = "" }
            $isTextCol = $textCols.Contains($c)
            if (-not $isTextCol -and "$val" -match '^-?\d+(\.\d+)?$') {
                $arr[($r + 1), $c] = [double]$val
            } else {
                $arr[($r + 1), $c] = "$val"
            }
        }
    }
    if ($rowCount -gt 0) {
        $range = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($rowCount + 1, $colCount))
        $range.Value2 = $arr
    } else {
        for ($c = 0; $c -lt $colCount; $c++) { $ws.Cells.Item(1, $c + 1).Value2 = $headers[$c] }
    }
    return $rowCount
}

function OD([string[]]$pairs) {
    $d = New-Object System.Collections.Specialized.OrderedDictionary
    for ($i = 0; $i -lt $pairs.Count; $i += 2) { $d[$pairs[$i]] = $pairs[$i + 1] }
    return $d
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

Write-Host "=== 21 - Employee Benefits ==="
$wb = $excel.Workbooks.Add()
while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }
$ws = $wb.Worksheets.Item(1)
$ws.Name = "Employee Benefits Data"
$fields = OD @(
    "employee_id","Employee ID","employment_type","Employment Type",
    "housing_ctc","Housing CTC","transportation_ctc","Transportation CTC",
    "communication_allowance","Communication Allowance","education_allowance","Education Allowance",
    "medical_insurance_expense","Medical Insurance Expense","ticket_class","Ticket Class",
    "ticket_cycle","Ticket Cycle","ot_eligibility","OT Eligibility",
    "variable_pay_eligibility","Variable Pay Eligibility"
)
$n = Write-Sheet $ws (Join-Path $Scratch "employee_benefits_draft.csv") $fields @()
Write-Host "  Employee Benefits Data: $n rows"
$outPath = Join-Path $OutDir "21_Employee_Benefits.xlsx"
$wb.SaveAs($outPath, 51)
$wb.Close($false)
Write-Host "Saved 21_Employee_Benefits.xlsx"

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
Write-Host ""
Write-Host "Workbook written to $OutDir"
