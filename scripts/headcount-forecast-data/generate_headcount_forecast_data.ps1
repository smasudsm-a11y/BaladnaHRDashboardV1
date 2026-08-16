# One-time synthetic data generation for the Headcount Forecast module (see
# CLAUDE.md "Power BI Parity — Round 2", Phase K). No actual forecasting
# model exists here (this is a static site with no backend compute to train
# one) — writes ONE csv (headcount_forecast.csv) for review;
# build_headcount_forecast_workbook.ps1 turns it into
# Database/18_Headcount_Forecast.xlsx.
#
# Deliberately does NOT generate an "Actual" row at all — Actual headcount
# is perfectly derivable from employee_master's own hire_date/
# termination_date (exactly what headcount.js's live "Headcount Trend"
# chart already does client-side), so storing a duplicate copy here would
# just be redundant data that could drift out of sync with the real
# population. This script only produces the forward-looking Forecast/Lower/
# Upper series, for the 12 months after this app's fixed "today" (see
# app/js/data.js's REFERENCE_TODAY = "2026-08-02", August 2026).
#
# Deterministic (no Get-Random) so re-running reproduces the same series —
# same reasoning as Succession Planning/Probation & PIP/eNPS: each
# division's forecast growth rate is that division's own real trailing-
# 12-month net change, not a random draw, so the numbers stay explainable.
#
# Run from anywhere; paths are relative to this script's own location.

$dir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$csvDir = "$repoRoot\supabase\csv"

Write-Output "Loading source CSV..."
$employees = Import-Csv "$csvDir\employee_master.csv"

function Parse-Date($s) {
  if (-not $s) { return $null }
  return [datetime]::ParseExact($s, "d/M/yyyy", [System.Globalization.CultureInfo]::InvariantCulture)
}

$parsed = $employees | ForEach-Object {
  [PSCustomObject]@{
    EmployeeID      = $_.employee_id
    Division        = $_.division
    HireDate        = Parse-Date $_.hire_date
    TerminationDate = Parse-Date $_.termination_date
  }
}

function Active-Count($division, [datetime]$asOf) {
  return ($parsed | Where-Object {
    $_.Division -eq $division -and
    $_.HireDate -le $asOf -and
    (-not $_.TerminationDate -or $_.TerminationDate -gt $asOf)
  }).Count
}

function Month-End([int]$y, [int]$m) {
  return (Get-Date -Year $y -Month $m -Day 1).AddMonths(1).AddDays(-1).Date
}

$divisions = $parsed | Select-Object -ExpandProperty Division -Unique | Where-Object { $_ } | Sort-Object

# Fixed anchor, matching app/js/data.js's REFERENCE_TODAY (2026-08-02) —
# this app's fixed "today," not the real wall clock, same convention as
# every other synthetic/live calculation in it.
$anchorYear = 2026
$anchorMonth = 8

$rows = New-Object System.Collections.Generic.List[object]

foreach ($div in $divisions) {
  $currentMonthEnd = Month-End $anchorYear $anchorMonth
  $currentHC = Active-Count $div $currentMonthEnd

  # Trailing-12-month trend baseline — the same window headcount.js's own
  # live "Headcount Trend" chart shows. Average monthly net change over
  # this window becomes the division's forecast growth rate.
  $priorMonthEnd = Month-End ($anchorYear - 1) $anchorMonth
  $priorHC = Active-Count $div $priorMonthEnd
  $trendPerMonth = ($currentHC - $priorHC) / 12.0

  Write-Output "$div : current=$currentHC 12mo-ago=$priorHC trend/mo=$([Math]::Round($trendPerMonth, 2))"

  for ($i = 1; $i -le 12; $i++) {
    $fY = $anchorYear
    $fM = $anchorMonth + $i
    while ($fM -gt 12) { $fM -= 12; $fY += 1 }
    $period = "{0:D4}-{1:D2}-01" -f $fY, $fM

    $forecastHC = [int][Math]::Max(0, [Math]::Round($currentHC + $trendPerMonth * $i))

    # Confidence band widens with horizon — ~1.4% of the forecast at month 1
    # up to ~5.8% at month 12, the usual "further out = less certain" shape.
    $bandPct = 0.01 + 0.004 * $i
    $bandWidth = [int][Math]::Max(2, [Math]::Round($forecastHC * $bandPct))
    $lower = [int][Math]::Max(0, $forecastHC - $bandWidth)
    $upper = $forecastHC + $bandWidth

    $rows.Add([PSCustomObject]@{
      Period            = $period
      Division          = $div
      ForecastHeadcount = $forecastHC
      LowerBound        = $lower
      UpperBound        = $upper
    })
  }
}

$rows | Export-Csv "$dir\headcount_forecast.csv" -NoTypeInformation -Force
Write-Output "Saved $($rows.Count) rows to $dir\headcount_forecast.csv"
