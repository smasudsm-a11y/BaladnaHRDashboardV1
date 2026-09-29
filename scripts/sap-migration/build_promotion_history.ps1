$ErrorActionPreference = "Stop"
# report_Merit_Increase_and_Promotions_List.csv -> promotion_history_draft.csv
#
# The source is a Group-wide extract (Power International Holding: ~154k rows,
# 150+ company codes), not Baladna-specific. Kept here: Baladna's own company
# codes, minus 1510 (BALADNA El Djazair, Algeria -- out of this app's Qatar +
# Egypt scope), and only employees present in employee_master (the table has
# an FK to it; in practice all but 1 in-scope employee match).
#   1500 = Baladna Food Industries, 1520 = Qatar Vision for Support and
#   Services (Egypt), 1530 = Baladna Food Industries LLC, 1540 = E Life
#   Detergent Factory.
#
# Every event-reason code is kept, not just promotions (ESC-PR/ESC-PRT) -- the
# same rows also carry Merit Increase/Job Regrade/Benefit Adjustment history,
# and filtering them out here would mean re-running this to add them later.
# The page decides which codes count as a promotion.
#
# Source dates are dd/MM/yyyy; written out as ISO yyyy-MM-dd. An end-date of
# 31/12/9999 (SAP's "still current" marker) becomes blank.

$Root = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data"
$Src = Join-Path $Root "HR Reports\report_Merit_Increase_and_Promotions_List.csv"
$Scratch = Join-Path $Root "scripts\sap-migration"
$Out = Join-Path $Scratch "promotion_history_draft.csv"

$InScopeCompanies = @("1500", "1520", "1530", "1540")

$known = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
Import-Csv (Join-Path $Scratch "employee_master_draft.csv") | ForEach-Object { [void]$known.Add($_.employee_id) }

function To-Iso([string]$dmy) {
    if ([string]::IsNullOrWhiteSpace($dmy)) { return "" }
    $d = [datetime]::ParseExact($dmy.Trim(), "dd/MM/yyyy", [Globalization.CultureInfo]::InvariantCulture)
    if ($d.Year -ge 9999) { return "" }
    return $d.ToString("yyyy-MM-dd")
}

# SAP sometimes writes one event as two same-day records -- a zero-length one
# (end-date = start-date) plus the real one (e.g. 100002's 01/10/2024 ESC-PR
# appears ending both 01/10/2024 and 31/03/2025). They're one event, so
# collapse on (employee, start date, code), keeping the later end date (blank
# = still current = latest).
$byKey = [ordered]@{}
$unmatched = New-Object 'System.Collections.Generic.HashSet[string]'
$dupes = 0
Import-Csv $Src | ForEach-Object {
    if ($InScopeCompanies -notcontains $_.company) { return }
    $id = $_.'user-id'.Trim()
    if (-not $known.Contains($id)) { [void]$unmatched.Add($id); return }
    $row = [pscustomobject]@{
        employee_id  = $id
        event_date   = To-Iso $_.'start-date'
        end_date     = To-Iso $_.'end-date'
        event_reason = $_.'event-reason'.Trim()
        company_code = $_.company
    }
    $key = "$id|$($row.event_date)|$($row.event_reason)"
    $prev = $byKey[$key]
    if ($null -eq $prev) { $byKey[$key] = $row; return }
    $dupes++
    $laterEnd = ($prev.end_date -ne "") -and ($row.end_date -eq "" -or $row.end_date -gt $prev.end_date)
    if ($laterEnd) { $byKey[$key] = $row }
}
$rows = @($byKey.Values)

$rows | Export-Csv $Out -NoTypeInformation -Encoding UTF8
Write-Host "promotion_history_draft.csv: $($rows.Count) rows"
Write-Host "  skipped, not in employee_master: $($unmatched.Count) employee(s)"
Write-Host "  collapsed, same-day split record (employee, date, code): $dupes"
$rows | Group-Object event_reason | Sort-Object Count -Descending | ForEach-Object { Write-Host ("  {0,-14} {1}" -f $_.Name, $_.Count) }
