$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\scripts\sap-migration"
$OutDir = Join-Path $Scratch "workbooks"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Same Write-Sheet approach as build_employee_benefits_workbook.ps1: date
# columns written as literal Text (NumberFormat "@") BEFORE assignment, so
# Excel never auto-converts an ISO-date string to a date serial (which reads
# back one day early via SheetJS in this timezone -- see CLAUDE.md's CTC
# Report gotcha).
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
            # employee_id/company_code stay text too -- they're identifiers,
            # not quantities.
            $arr[($r + 1), $c] = "$val"
        }
    }
    foreach ($c in 0..($colCount - 1)) { if (-not $textCols.Contains($c)) { $ws.Columns.Item($c + 1).NumberFormat = "@" } }
    if ($rowCount -gt 0) {
        $range = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($rowCount + 1, $colCount))
        $range.Value2 = $arr
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

Write-Host "=== 22 - Promotion History ==="
$wb = $excel.Workbooks.Add()
while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }
$ws = $wb.Worksheets.Item(1)
$ws.Name = "Promotion History Data"
$fields = OD @(
    "employee_id","Employee ID","event_date","Event Date","end_date","End Date",
    "event_reason","Event Reason","company_code","Company Code"
)
$n = Write-Sheet $ws (Join-Path $Scratch "promotion_history_draft.csv") $fields @("event_date", "end_date")
Write-Host "  Promotion History Data: $n rows"
$outPath = Join-Path $OutDir "22_Promotion_History.xlsx"
$wb.SaveAs($outPath, 51)
$wb.Close($false)
Write-Host "Saved 22_Promotion_History.xlsx"

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
