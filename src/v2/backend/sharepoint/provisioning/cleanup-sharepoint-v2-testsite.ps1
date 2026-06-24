<#
.SYNOPSIS
  Delete the Escalations_v2_* lists from an APPROVED, NON-PRODUCTION SharePoint test site
  (rollback / disposal).

.DESCRIPTION
  Config-driven and FAIL-CLOSED, with an EXTRA confirmation gate. It only acts when the config
  explicitly sets allowCleanup = true, only targets a non-production test site, only deletes
  lists under the approved 'Escalations_v2_' prefix, and NEVER targets legacy. Default is a
  dry-run preview; -Execute performs deletion after all gates pass.

  This is for disposing of a throwaway test site's v2 lists. It does not touch legacy, does not
  delete anything outside the approved prefix, and creates no Power Automate flows.

.PARAMETER ConfigPath
  Path to the runtime config (default: ./provision.config.json, git-ignored).

.PARAMETER Execute
  Perform deletion. Omit for a dry-run preview of what would be removed.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$ConfigPath = "$PSScriptRoot/provision.config.json",
  [switch]$Execute
)

. "$PSScriptRoot/provisioning.common.ps1"

Write-Host "SharePoint v2 cleanup — NON-PRODUCTION test site only. Deletes ONLY 'Escalations_v2_' lists. Never touches legacy." -ForegroundColor Yellow

$schema = Import-Schema
$config = Import-ProvisionConfig -Path $ConfigPath
Assert-SafeConfig -Config $config

# EXTRA gate: cleanup requires an explicit opt-in flag in config.
if ((Get-ConfigValue $config 'allowCleanup') -ne $true) {
  throw "FAIL-CLOSED: cleanup refused. Set allowCleanup = true in your git-ignored config to permit test-site list deletion."
}

$prefix = [string]$config.listPrefix   # validated == 'Escalations_v2_' by Assert-SafeConfig
$targets = @($schema.lists.PSObject.Properties.Name | Where-Object { $_.StartsWith($prefix) })

Write-Report -Title 'Cleanup plan' -Lines (@(
  "environment   : $($config.environmentLabel) (non-production)",
  "allowCleanup  : $($config.allowCleanup)",
  "prefix        : $prefix",
  "lists to delete (if present): $($targets.Count)"
) + ($targets | ForEach-Object { " - $_" }))

if (-not $Execute) {
  Write-Host "[dry-run] No connection made and nothing deleted. Re-run with -Execute to remove the test-site lists." -ForegroundColor Yellow
  return
}

Assert-ModuleOrExplain
Import-Module PnP.PowerShell
Write-Host "[connect] Connecting interactively to the configured non-production test site for cleanup..." -ForegroundColor Yellow
Connect-PnPOnline -Url $config.siteReferencePlaceholder -Interactive

$web = Get-PnPWeb
foreach ($tok in @('legacy','tracker','prod','production')) {
  if (("$($web.Url) $($web.Title)").ToLower().Contains($tok)) {
    Disconnect-PnPOnline
    throw "FAIL-CLOSED: connected web looks like legacy/production ('$($web.Title)'). Aborting; nothing deleted."
  }
}

$deleted = @()
foreach ($listName in $targets) {
  # Defense in depth: never delete anything outside the approved prefix.
  if (-not $listName.StartsWith($prefix)) { continue }
  $list = Get-PnPList -Identity $listName -ErrorAction SilentlyContinue
  if ($null -ne $list) {
    if ($PSCmdlet.ShouldProcess($listName, 'Remove-PnPList (test-site only)')) {
      Remove-PnPList -Identity $listName -Force
      $deleted += $listName
    }
  }
}

Write-Report -Title 'Cleanup report' -Lines @(
  "deleted lists : $([string]::Join(', ', $deleted))",
  "note          : only '$prefix' lists removed on the non-production test site; legacy untouched; no flows affected."
)
Disconnect-PnPOnline
Write-Host "[done] Cleanup complete on the non-production test site." -ForegroundColor Green
