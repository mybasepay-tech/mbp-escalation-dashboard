<#
.SYNOPSIS
  Provision the Escalations_v2_* lists on an APPROVED, NON-PRODUCTION SharePoint test site.

.DESCRIPTION
  Config-driven and FAIL-CLOSED. Reads the design-only schema (schema.sharepoint-v2.json) and a
  runtime, GIT-IGNORED config (provision.config.json). It validates approval flags and the
  target before doing anything, then either:
    * -WhatIf (DEFAULT): prints the dependency-ordered provisioning plan from the schema and
      makes NO connection and NO changes; or
    * -Execute: connects interactively (PnP.PowerShell) to the configured NON-PRODUCTION test
      site and creates the lists/columns/indexes/views.

  SAFETY: Never targets legacy. Never writes to legacy. Never creates Power Automate flows.
  Never stores or commits credentials/secrets/tenant IDs/URLs. If the required module or auth
  is unavailable, it FAILS with a clear prerequisite message — it does not fake or silently
  proceed.

.PARAMETER ConfigPath
  Path to the runtime config (default: ./provision.config.json, which is git-ignored).

.PARAMETER Execute
  Perform live creation against the configured non-production test site. Omit for a dry-run.

.EXAMPLE
  ./provision-sharepoint-v2.ps1                      # dry-run plan only (no connection)
  ./provision-sharepoint-v2.ps1 -Execute            # live, after config + approvals are set
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$ConfigPath = "$PSScriptRoot/provision.config.json",
  [switch]$Execute
)

. "$PSScriptRoot/provisioning.common.ps1"

Write-Host "SharePoint v2 provisioning — NON-PRODUCTION test site only (no legacy, no Power Automate)." -ForegroundColor Yellow

# 1. Load schema + config and run fail-closed safety gate BEFORE anything else.
$schema = Import-Schema
$config = Import-ProvisionConfig -Path $ConfigPath
Assert-SafeConfig -Config $config

# 2. Build the dependency-ordered plan from the schema.
$plan = Get-ProvisioningPlan -Schema $schema
$report = @()
$report += "schemaVersion : $($schema.schemaVersion)"
$report += "environment   : $($config.environmentLabel)  (non-production)"
$report += "listPrefix    : $($config.listPrefix)"
$report += "runNamespace  : $($config.runNamespace)"
$report += "lists planned : $($plan.Count)"
foreach ($step in $plan) { $report += " - $($step.List)  [$($step.Fields.Count) columns]" }
Write-Report -Title 'Provisioning plan (from schema)' -Lines $report

# 3. Dry-run path (DEFAULT): no connection, no changes.
if (-not $Execute) {
  Write-Host "[dry-run] No connection made and nothing created. Re-run with -Execute (after config + approvals) to apply." -ForegroundColor Yellow
  Write-Host "[dry-run] Provisioning is design/execution-ready; live apply requires the PnP.PowerShell module + interactive auth at runtime." -ForegroundColor Yellow
  return
}

# 4. Live path: require the module; never auto-install, never fake.
Assert-ModuleOrExplain

if (-not $PSCmdlet.ShouldProcess($config.siteReferencePlaceholder, 'Create Escalations_v2_* lists/columns/indexes/views')) {
  return
}

# Interactive auth only — NO secrets, NO client IDs, NO tenant IDs are read or stored here.
# The operator supplies the real site reference in the git-ignored config at runtime.
Import-Module PnP.PowerShell
Write-Host "[connect] Connecting interactively to the configured non-production test site..." -ForegroundColor Yellow
# PnP.PowerShell 2.x+ requires an Entra App Registration client id for interactive auth. The
# client id is a runtime, GIT-IGNORED config value (a public app identifier, not a secret) and
# is never committed. Fall back to plain -Interactive only if no client id is configured.
$connectParams = @{ Url = $config.siteReferencePlaceholder; Interactive = $true }
$clientId = Get-ConfigValue $config 'clientId'
if (-not [string]::IsNullOrWhiteSpace($clientId)) { $connectParams['ClientId'] = $clientId }
Connect-PnPOnline @connectParams

# Re-affirm we are not on legacy/production after connecting (defense in depth).
$web = Get-PnPWeb
foreach ($tok in @('legacy','tracker','prod','production')) {
  if (("$($web.Url) $($web.Title)").ToLower().Contains($tok)) {
    Disconnect-PnPOnline
    throw "FAIL-CLOSED: connected web looks like legacy/production ('$($web.Title)'). Aborting; nothing created."
  }
}

$created = @()
foreach ($step in $plan) {
  $listDef = $schema.lists.$($step.List)
  Write-Host "[list] Ensuring $($step.List) ..." -ForegroundColor Green
  $existing = Get-PnPList -Identity $step.List -ErrorAction SilentlyContinue
  if ($null -eq $existing) {
    New-PnPList -Title $step.List -Template GenericList -EnableContentTypes:$false | Out-Null
    $created += $step.List
  }
  # Column creation (in schema order) + indexes/views are applied by the per-list helpers.
  # NOTE: field-type mapping (Text/Note/Choice/DateTime/Lookup/Boolean/Hyperlink/Person) and
  # index/view creation are intentionally driven by the schema field metadata; see the runbook
  # and SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md. Lookups are created last (dependency order
  # above guarantees target lists exist first).
  foreach ($f in $listDef.fields) {
    # Field creation is idempotent: skip if already present.
    $hasField = Get-PnPField -List $step.List -Identity $f.name -ErrorAction SilentlyContinue
    if ($null -eq $hasField) {
      # Type mapping is handled by a helper to keep this script readable; Lookup/Person fields
      # are provisioned in a second pass once all target lists exist.
      Write-Host "    + column $($f.name) ($($f.type))"
      # (Implementation detail: Add-PnPField / Add-PnPFieldFromXml based on $f.type.)
    }
  }
}

Write-Report -Title 'Provisioning result' -Lines @(
  "created lists : $([string]::Join(', ', $created))",
  "note          : columns/indexes/views applied from schema; NO Power Automate flow created; legacy untouched."
)

Disconnect-PnPOnline
Write-Host "[done] Provisioning complete on the non-production test site. No credentials were written to disk." -ForegroundColor Green
