$ErrorActionPreference = "Stop"
# Builds salary_structure_draft.csv from Baladna Qatar's OFFICIAL pay scales
# (supplied by Total Rewards, 2026-10-01), replacing the Qatar ranges that
# build_salary_structure.ps1 derived from per-position SAP ranges.
#   - Expat scale (G2-G7, G9-G24; G8 has no range) and Qatari National scale
#     (G10-G24) are by GRADE only -> job_family "ALL". Which scale applies to
#     an employee is decided in app/js/data.js (payScaleFor).
#   - Syria Project: the 4 Group Finance positions on USD ranges keep their
#     own converted ranges (3.64 QAR/USD), per grade + job family. Their
#     holders are routed to this scale by position number in data.js.
#   - Egypt (EGP) has no official scale here, so its ranges still come from
#     build_salary_structure.ps1 (Position Data) -> pay_scale "Standard".
# Run build_salary_structure.ps1 first (it produces the EGP rows), then this.
# Q1/Q3 in the official tables are the linear quarter points, so min/mid/max
# carry everything the dashboard needs.

$Dir = "C:\Users\s.masud\OneDrive - BALADNA\Documents\Synthetic HR Dashboard Data\scripts\sap-migration"

# grade -> min, mid (Q2), max
$Expat = [ordered]@{
    2 = 1000, 1050, 1100;        3 = 1100, 1293, 1485;        4 = 1500, 1763, 2025
    5 = 2300, 2925, 3550;        6 = 3700, 4250, 4800;        7 = 5000, 5825, 6650
    9 = 2070, 2330, 2590;        10 = 2640, 2970, 3300;       11 = 4000, 4500, 5000
    12 = 5700, 6415, 7130;       13 = 7830, 8810, 9790;       14 = 10490, 11800, 13110
    15 = 13600, 15640, 17680;    16 = 18100, 20815, 23530;    17 = 24000, 27600, 31200
    18 = 31500, 36225, 40950;    19 = 41500, 47750, 54000;    20 = 54500, 62750, 71000
    21 = 71100, 83350, 95600;    22 = 95800, 112350, 128900;  23 = 129100, 151350, 173600
    24 = 173800, 203800, 233800
}
$National = [ordered]@{
    10 = 8000, 9000, 10000;      11 = 10050, 11305, 12560;    12 = 12610, 14185, 15760
    13 = 15810, 17785, 19760;    14 = 19810, 22285, 24760;    15 = 24850, 28580, 32310
    16 = 32360, 37215, 42070;    17 = 42120, 48440, 54760;    18 = 54830, 63055, 71280
    19 = 71350, 82055, 92760;    20 = 92830, 106755, 120680;  21 = 105000, 123375, 141750
    22 = 125000, 146875, 168750; 23 = 150000, 176250, 202500; 24 = 180000, 211500, 243000
}
# Syria-project USD ranges (Position Data Sal. Min/Mid/Max), converted at 3.64.
$QarPerUsd = 3.64
$SyriaUsd = @(
    @{ grade = 13; jf = "PROJECT DELIVERY";     usd = 2148, 2402, 2694 }    # position 50203780
    @{ grade = 17; jf = "BUSINESS DEVELOPMENT"; usd = 7280, 8372, 9464 }    # position 50213777
    @{ grade = 18; jf = "PROJECT DELIVERY";     usd = 9719, 11175, 12631 }  # position 50192214
    @{ grade = 20; jf = "MANAGEMENT";           usd = 17326, 19911, 22532 } # position 50200332
)

function GradeTier([int]$n) {
    if ($n -le 4) { return "Junior" }; if ($n -le 8) { return "Mid" }; if ($n -le 12) { return "Senior" }
    if ($n -le 14) { return "Executive" }; if ($n -eq 15) { return "Specialist/Supervisor" }
    if ($n -le 18) { return "Managerial" }; if ($n -le 20) { return "Director" }; if ($n -le 22) { return "Chief" }
    return "CEO/Group CEO"
}

$rows = New-Object System.Collections.Generic.List[object]
function Add($grade, $jf, $cur, $scale, $band) {
    $rows.Add([pscustomobject]@{ grade = "G$grade"; job_family = $jf; currency = $cur; salary_range_min = $band[0]
        salary_midpoint = $band[1]; salary_range_max = $band[2]; grade_tier = (GradeTier $grade); pay_scale = $scale })
}
# GetEnumerator, not $Expat[$g]: indexing an [ordered] dictionary with an
# int is read as a POSITION, not a key, so $Expat[24] was null.
foreach ($kv in $Expat.GetEnumerator()) { Add $kv.Key "ALL" "QAR" "Expat" $kv.Value }
foreach ($kv in $National.GetEnumerator()) { Add $kv.Key "ALL" "QAR" "National" $kv.Value }
foreach ($s in $SyriaUsd) { Add $s.grade $s.jf "QAR" "Syria Project" @($s.usd | ForEach-Object { [math]::Round($_ * $QarPerUsd) }) }

$egp = @(Import-Csv (Join-Path $Dir "salary_structure_rebuilt.csv") | Where-Object currency -eq "EGP")
if (-not $egp.Count) { throw "No EGP rows in salary_structure_rebuilt.csv -- run build_salary_structure.ps1 first." }
foreach ($e in $egp) {
    $rows.Add([pscustomobject]@{ grade = $e.grade; job_family = $e.job_family; currency = "EGP"; salary_range_min = $e.salary_range_min
        salary_midpoint = $e.salary_midpoint; salary_range_max = $e.salary_range_max; grade_tier = $e.grade_tier; pay_scale = "Standard" })
}

$rows | Export-Csv (Join-Path $Dir "salary_structure_draft.csv") -NoTypeInformation -Encoding UTF8
Write-Host "salary_structure_draft.csv: $($rows.Count) rows"
$rows | Group-Object pay_scale | ForEach-Object { Write-Host ("  {0,-14} {1}" -f $_.Name, $_.Count) }
