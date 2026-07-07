<#
.SYNOPSIS
  Validate (read-only) that an APPROVED, NON-PRODUCTION SharePoint test site has the required
  Escalations_v2_* lists, columns, column types, indexes, and views.

.DESCRIPTION
  Config-driven and FAIL-CLOSED. Reads the schema + a runtime GIT-IGNORED config, runs the same
  safety gate as provisioning, then checks the configured test site against the schema. It
  MODIFIES NOTHING and never targets legacy. Default is a dry-run that reports what it would
  check; -Execute performs the read-only live validation.

  Validation categories:
    * HARD (cause a non-zero/failed result): missing lists, missing required columns.
    * SOFT (reported honestly, do not fail the run): column type drift, missing indexes,
      missing views. Some views carry runtime-dynamic filters that are applied by the adapter,
      not baked into the stored view — those are noted, never faked.
  Also confirms ONLY the 8 expected Escalations_v2_* lists exist (no stray v2 lists), as a
  guard that provisioning did not create unexpected targets.

  It is strictly read-only: it creates NO Power Automate flows and performs NO writeback to
  legacy. If the PnP.PowerShell module or interactive auth is unavailable, it fails with a clear
  prerequisite message rather than faking a result.

.PARAMETER ConfigPath
  Path to the runtime config (default: ./provision.config.json, git-ignored).

.PARAMETER Execute
  Perform the live read-only validation. Omit for a dry-run summary.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = "$PSScriptRoot/provision.config.json",
  [switch]$Execute
)

. "$PSScriptRoot/provisioning.common.ps1"

Write-Host "SharePoint v2 validation — READ-ONLY, NON-PRODUCTION test site only (no legacy, no writeback)." -ForegroundColor Yellow

$schema = Import-Schema
$config = Import-ProvisionConfig -Path $ConfigPath
Assert-SafeConfig -Config $config

$expectedLists = @($schema.lists.PSObject.Properties.Name)
$indexPlan = Get-IndexPlan -Schema $schema
$viewPlan = @(Get-ViewPlan -Schema $schema)

Write-Report -Title 'Validation plan' -Lines (@(
  "schemaVersion : $($schema.schemaVersion)",
  "environment   : $($config.environmentLabel) (non-production)",
  "lists to check: $($expectedLists.Count)",
  "views to check: $($viewPlan.Count)"
) + ($expectedLists | ForEach-Object { " - $_" }))

if (-not $Execute) {
  Write-Host "[dry-run] No connection made. Re-run with -Execute to perform the read-only validation." -ForegroundColor Yellow
  return
}

Assert-ModuleOrExplain
Import-Module PnP.PowerShell
Write-Host "[connect] Connecting interactively (read-only validation) to the configured non-production test site..." -ForegroundColor Yellow
$connectParams = @{ Url = $config.siteReferencePlaceholder; Interactive = $true }
$clientId = Get-ConfigValue $config 'clientId'
if (-not [string]::IsNullOrWhiteSpace($clientId)) { $connectParams['ClientId'] = $clientId }
Connect-PnPOnline @connectParams

$web = Get-PnPWeb
foreach ($tok in @('legacy','tracker','prod','production')) {
  if (("$($web.Url) $($web.Title)").ToLower().Contains($tok)) {
    Disconnect-PnPOnline
    throw "FAIL-CLOSED: connected web looks like legacy/production ('$($web.Title)'). Aborting validation."
  }
}
Write-Host "[connect] Connected to '$($web.Title)' ($($web.ServerRelativeUrl))." -ForegroundColor Green

$hardFailures = @()   # missing lists / missing fields
$softNotes    = @()   # type drift / missing indexes / missing views
$listLines    = @()

foreach ($listName in $expectedLists) {
  $list = Get-PnPList -Identity $listName -ErrorAction SilentlyContinue
  if ($null -eq $list) {
    $hardFailures += "MISSING list: $listName"
    $listLines += "MISSING  $listName"
    continue
  }

  $liveFields = @(Get-PnPField -List $listName -ErrorAction SilentlyContinue)
  $liveByName = @{}
  foreach ($lf in $liveFields) { $liveByName[$lf.InternalName] = $lf }

  $schemaFields = @($schema.lists.$listName.fields)
  $missing = @()
  $typeDrift = @()
  foreach ($sf in $schemaFields) {
    if (-not $liveByName.ContainsKey($sf.name)) {
      $missing += $sf.name
      continue
    }
    $live = $liveByName[$sf.name]
    # @(): PowerShell unwraps a single-element return; .Count on a scalar throws under StrictMode.
    $expectedTypes = @(Get-ExpectedLiveTypes $sf.type)
    if ($expectedTypes.Count -gt 0 -and ($expectedTypes -notcontains $live.TypeAsString)) {
      $typeDrift += "$($sf.name) (schema $($sf.type) -> live $($live.TypeAsString))"
    }
  }

  # Index checks (soft).
  $idxMissing = @()
  if ($indexPlan.ContainsKey($listName)) {
    foreach ($col in $indexPlan[$listName]) {
      if ($liveByName.ContainsKey($col) -and -not $liveByName[$col].Indexed) { $idxMissing += $col }
    }
  }

  if ($missing.Count -gt 0) { $hardFailures += "FIELDS MISSING in ${listName}: $([string]::Join(', ', $missing))" }
  if ($typeDrift.Count -gt 0) { $softNotes += "TYPE DRIFT in ${listName}: $([string]::Join(', ', $typeDrift))" }
  if ($idxMissing.Count -gt 0) { $softNotes += "INDEX MISSING in ${listName}: $([string]::Join(', ', $idxMissing))" }

  $okFields = $schemaFields.Count - $missing.Count
  $listLines += ("{0,-32} fields {1}/{2} ok{3}{4}" -f $listName, $okFields, $schemaFields.Count,
    $(if ($typeDrift.Count) { ", $($typeDrift.Count) type-drift" } else { '' }),
    $(if ($idxMissing.Count) { ", $($idxMissing.Count) index-missing" } else { '' }))
}

# View checks (soft).
$viewLines = @()
foreach ($v in $viewPlan) {
  $existing = Get-PnPView -List $v.List -Identity $v.Name -ErrorAction SilentlyContinue
  if ($null -eq $existing) {
    $softNotes += "VIEW MISSING: $($v.List) :: $($v.Name)"
    $viewLines += ("MISSING  {0} :: {1}" -f $v.List, $v.Name)
  } else {
    $viewLines += ("OK       {0} :: {1}  | filter: {2}" -f $v.List, $v.Name, $v.FilterStatus)
  }
}

# Guard: only the expected 8 Escalations_v2_* lists exist (no stray v2 targets).
$allV2 = @(Get-PnPList | Where-Object { $_.Title -like "$($config.listPrefix)*" } | ForEach-Object { $_.Title } | Sort-Object)
$unexpectedV2 = @($allV2 | Where-Object { $expectedLists -notcontains $_ })
if ($unexpectedV2.Count -gt 0) { $hardFailures += "UNEXPECTED v2 lists present (not in schema): $([string]::Join(', ', $unexpectedV2))" }

Write-Report -Title 'List / column / index report' -Lines $listLines
Write-Report -Title 'View report' -Lines $viewLines
Write-Report -Title 'v2 target guard' -Lines @(
  "Escalations_v2_* lists present: $($allV2.Count) (expected $($expectedLists.Count))",
  "unexpected v2 lists           : $($unexpectedV2.Count)"
)

if ($softNotes.Count -gt 0) {
  Write-Report -Title "SOFT notes ($($softNotes.Count)) — reported honestly, do not fail the run" -Lines $softNotes
}

Disconnect-PnPOnline

if ($hardFailures.Count -gt 0) {
  Write-Report -Title "HARD failures ($($hardFailures.Count))" -Lines $hardFailures
  throw "Validation found $($hardFailures.Count) hard discrepancy(ies) vs. schema (missing lists/fields or stray v2 lists). Nothing was modified."
}

if ($softNotes.Count -gt 0) {
  Write-Host "[done] Lists + required columns present. $($softNotes.Count) soft note(s) above (type drift / index / view) — reported honestly; legacy untouched; nothing modified." -ForegroundColor Yellow
} else {
  Write-Host "[done] Test site fully matches the schema (lists, columns, types, indexes, views). Nothing was modified; legacy untouched." -ForegroundColor Green
}
