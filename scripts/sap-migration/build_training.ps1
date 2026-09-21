$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\S8D2B~1.MAS\AppData\Local\Temp\claude\C--Users-s-masud-OneDrive---BALADNA-Documents-Synthetic-HR-Dashboard-Data\2b72512b-8e31-42ca-857f-0c3136384a07\scratchpad"
$rng = New-Object System.Random(20260917)
$TODAY = Get-Date "2026-08-02"   # data.js's REFERENCE_TODAY, same convention as every other synthetic module

$LEADERSHIP_LEVELS = @("Specialist/Supervisor", "Managerial", "Director", "Chief", "CEO/Group CEO")
$HOURS_CHOICES = @(2, 4, 8, 16)

$MANDATORY = @("Anti-Bribery & Ethics", "Data Privacy Awareness", "Fire & Emergency Response", "Food Safety & HACCP Refresher", "Health & Safety Induction")
$TECHNICAL = @("Advanced Excel for Reporting", "Cold Chain Logistics", "Dairy Processing Fundamentals", "Quality Control Techniques", "SAP for HR Users")
$SOFT_SKILLS = @("Conflict Resolution", "Effective Communication", "Presentation Skills", "Time Management")
$LEADERSHIP = @("Coaching for Performance", "First-Time Manager Program", "Strategic Leadership Workshop")

function CsvEscape($v) { $s = "$v" -replace '"', '""'; return '"' + $s + '"' }
function WriteCsv($path, $headerArr, $rowsList) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(($headerArr | ForEach-Object { CsvEscape $_ }) -join ",")
    foreach ($row in $rowsList) { $lines.Add(($row | ForEach-Object { CsvEscape $_ }) -join ",") }
    $lines | Out-File -FilePath $path -Encoding utf8
}

function RandDateBetween($start, $end) {
    if ($end -le $start) { return $start }
    $days = ($end - $start).Days
    return $start.AddDays($rng.Next(0, $days + 1))
}

function CompletionStatus() {
    $r = $rng.Next(0, 100)
    if ($r -lt 82) { return "Completed" }
    if ($r -lt 94) { return "In Progress" }
    return "Not Started"
}

$employees = Import-Csv (Join-Path $Scratch "employee_master_new.csv")
Write-Host "employees: $($employees.Count)"

$rows = New-Object System.Collections.Generic.List[object]
$nhpRows = New-Object System.Collections.Generic.List[object]
$statusCounts = @{}
$nhpCutoff = $TODAY.AddDays(-365)

foreach ($e in $employees) {
    if (-not $e.hire_date) { continue }
    $hireDate = [DateTime]::Parse($e.hire_date)
    $endDate = if ($e.termination_date) { [DateTime]::Parse($e.termination_date) } else { $TODAY }
    if ($endDate -le $hireDate) { $endDate = $hireDate.AddDays(1) }
    $isLeader = $LEADERSHIP_LEVELS -contains $e.job_level

    $courses = New-Object System.Collections.Generic.List[object]
    foreach ($c in $MANDATORY) { $courses.Add(@{ name = $c; category = "Mandatory"; cost = 0 }) }
    $complianceCourse = $(if ($e.country -eq "Egypt") { "Egyptian Labor Law Essentials" } else { "Qatar Labor Law Essentials" })
    $courses.Add(@{ name = $complianceCourse; category = "Compliance"; cost = 0 })
    if ($isLeader) {
        $courses.Add(@{ name = "DOA & Governance Training"; category = "Compliance"; cost = 0 })
        $nLead = $rng.Next(1, 4)
        $pickedLead = $LEADERSHIP | Sort-Object { $rng.Next() } | Select-Object -First $nLead
        foreach ($c in $pickedLead) { $courses.Add(@{ name = $c; category = "Leadership"; cost = 800 + $rng.Next(0, 700) }) }
    }
    # elective Technical/Soft Skills, count scaled loosely by tenure (more
    # tenure = more accumulated courses, capped) -- matches the old table's
    # own spread (mode ~4-7 rows/employee, up to the low teens for long tenure)
    $tenureYears = [Math]::Max(0, ($endDate - $hireDate).TotalDays / 365.25)
    $maxElective = [Math]::Min(9, 1 + [Math]::Floor($tenureYears * 1.3))
    $nElective = $rng.Next(0, [int]$maxElective + 1)
    $electivePool = $TECHNICAL + $SOFT_SKILLS
    $pickedElective = $electivePool | Sort-Object { $rng.Next() } | Select-Object -First $nElective
    foreach ($c in $pickedElective) {
        $cat = $(if ($TECHNICAL -contains $c) { "Technical" } else { "Soft Skills" })
        $courses.Add(@{ name = $c; category = $cat; cost = 800 + $rng.Next(0, 1000) })
    }

    foreach ($course in $courses) {
        $status = CompletionStatus
        $hours = $HOURS_CHOICES[$rng.Next(0, $HOURS_CHOICES.Count)]
        $completionDate = ""
        $cert = ""
        $expiry = ""
        $complianceStatus = ""
        if ($status -eq "Completed") {
            $cd = RandDateBetween $hireDate $endDate
            $completionDate = $cd.ToString("yyyy-MM-dd")
            $cert = $(if ($rng.Next(0, 100) -lt 18) { "Yes" } else { "No" })
            if ($course.category -eq "Compliance") {
                $expiryDate = $cd.AddYears(1)
                $expiry = $expiryDate.ToString("yyyy-MM-dd")
                $complianceStatus = $(if ($expiryDate -lt $TODAY) { "Expired" } elseif ($expiryDate -lt $TODAY.AddDays(60)) { "Expiring Soon" } else { "Valid" })
            }
        }
        $rows.Add(@(
            $e.employee_id, $course.name, $course.category, $hours, $course.cost,
            $status, $completionDate, $cert, $expiry, $complianceStatus, ""
        ))
        if (-not $statusCounts.ContainsKey($status)) { $statusCounts[$status] = 0 }
        $statusCounts[$status]++
    }

    # New Hire Program -- same rule/weights as scripts/add_new_hire_program.ps1,
    # just re-pointed at the new real employee population.
    if ($e.employment_status -eq "Active" -and $hireDate -ge $nhpCutoff) {
        $r = $rng.Next(0, 100)
        $nhpStatus = $(if ($r -lt 60) { "Completed" } elseif ($r -lt 93) { "In Progress" } else { "Overdue" })
        $nhpCompletion = ""
        if ($nhpStatus -eq "Completed") {
            $offset = $rng.Next(30, 90)
            $cd = $hireDate.AddDays($offset)
            if ($cd -gt $TODAY) { $cd = $TODAY }
            $nhpCompletion = $cd.ToString("yyyy-MM-dd")
        }
        $requiredDate = $hireDate.AddDays(90).ToString("yyyy-MM-dd")
        $nhpRows.Add(@(
            $e.employee_id, "New Hire Program", "New Hire Program", 12, 0,
            $nhpStatus, $nhpCompletion, "No", "", "", $requiredDate
        ))
    }
}

$allRows = New-Object System.Collections.Generic.List[object]
$allRows.AddRange($rows)
$allRows.AddRange($nhpRows)

WriteCsv (Join-Path $Scratch "training_new.csv") @("employee_id","course_name","training_category","training_hours","training_cost","completion_status","completion_date","certification_achieved","expiry_date","compliance_status","required_date") $allRows

Write-Host "core training rows: $($rows.Count)"
Write-Host "NHP rows: $($nhpRows.Count)"
Write-Host "total: $($allRows.Count)"
$statusCounts.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
