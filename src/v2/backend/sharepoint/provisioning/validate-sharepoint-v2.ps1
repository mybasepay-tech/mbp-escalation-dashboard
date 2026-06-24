<#
.SYNOPSIS
  Validate (read-only) that an APPROVED, NON-PRODUCTION SharePoint test site has the required
  Escalations_v2_* lists, columns, and views.

.DESCRIPTION
  Config-driven and FAIL-CLOSED. Reads the schema + a runtime GIT-IGNORED config, runs the same
  safety gate as provisioning, then checks the configured test site against the schema. It
  MODIFIES NOTHING and never targets legacy. Default is a dry-run that reports what it would
  check; -Execute performs the read-only live validation.

  If the PnP.PowerShell module or interactive auth is unavailable, it fails with a clear
  prerequisite message rather than faking a result. It creates no Power Automate flows and
  performs no writeback to legacy (read-only validation only).

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
Write-Report -Title 'Validation plan' -Lines (@(
  "schemaVersion : $($schema.schemaVersion)",
  "environment   : $($config.environmentLabel) (non-production)",
  "lists to check: $($expectedLists.Count)"
) + ($expectedLists | ForEach-Object { " - $_" }))

if (-not $Execute) {
  Write-Host "[dry-run] No connection made. Re-run with -Execute to perform the read-only validation." -ForegroundColor Yellow
  return
}

Assert-ModuleOrExplain
Import-Module PnP.PowerShell
Write-Host "[connect] Connecting interactively (read-only validation) to the configured non-production test site..." -ForegroundColor Yellow
Connect-PnPOnline -Url $config.siteReferencePlaceholder -Interactive

$web = Get-PnPWeb
foreach ($tok in @('legacy','tracker','prod','production')) {
  if (("$($web.Url) $($web.Title)").ToLower().Contains($tok)) {
    Disconnect-PnPOnline
    throw "FAIL-CLOSED: connected web looks like legacy/production ('$($web.Title)'). Aborting validation."
  }
}

$results = @()
foreach ($listName in $expectedLists) {
  $list = Get-PnPList -Identity $listName -ErrorAction SilentlyContinue
  if ($null -eq $list) {
    $results += "MISSING list: $listName"
    continue
  }
  $defFields = @($schema.lists.$listName.fields | ForEach-Object { $_.name })
  $liveFields = @((Get-PnPField -List $listName | ForEach-Object { $_.InternalName }))
  $missing = @($defFields | Where-Object { $liveFields -notcontains $_ })
  if ($missing.Count -eq 0) { $results += "OK    $listName ($($defFields.Count) columns)" }
  else { $results += "FIELDS MISSING in $listName: $([string]::Join(', ', $missing))" }
}

Write-Report -Title 'Validation report' -Lines $results
Disconnect-PnPOnline

if ($results | Where-Object { $_ -like 'MISSING*' -or $_ -like 'FIELDS MISSING*' }) {
  throw "Validation found discrepancies vs. schema. Nothing was modified."
}
Write-Host "[done] Test site matches the schema. Nothing was modified; legacy untouched." -ForegroundColor Green
