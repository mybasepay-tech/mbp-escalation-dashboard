# provisioning.common.ps1
# Shared, fail-closed safety helpers for the SharePoint v2 test-site provisioning package.
#
# DESIGN/EXECUTION-READY, NON-PRODUCTION ONLY. These helpers never contain tenant IDs, client
# IDs, secrets, or live URLs — those come only from an operator-supplied, GIT-IGNORED config at
# runtime. Nothing here targets legacy. No Power Automate flows are created anywhere.
#
# Dot-source this from provision/validate/cleanup scripts:
#   . "$PSScriptRoot/provisioning.common.ps1"

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# The only allowed list prefix and the canonical required lists (must match the schema).
$script:RequiredListPrefix = 'Escalations_v2_'
$script:RequiredLists = @(
  'Escalations_v2_Tickets',
  'Escalations_v2_Activity',
  'Escalations_v2_Comments',
  'Escalations_v2_InternalNotes',
  'Escalations_v2_Tags',
  'Escalations_v2_TicketTags',
  'Escalations_v2_Departments',
  'Escalations_v2_Users'
)

# Tokens that indicate a forbidden target (legacy or production). Fail closed if seen.
$script:ForbiddenTargetTokens = @('legacy', 'tracker', 'escalation-tracker', 'prod', 'production', 'onedrive')
# Labels we accept as non-production.
$script:NonProdLabelPattern = '^(test|sandbox|dev|nonprod|non-prod|qa|staging)'

function Get-SchemaPath {
  # provisioning/ -> sharepoint/ holds schema.sharepoint-v2.json
  return (Join-Path (Split-Path -Parent $PSScriptRoot) 'schema.sharepoint-v2.json')
}

function Import-Schema {
  $p = Get-SchemaPath
  if (-not (Test-Path $p)) { throw "Schema not found: $p" }
  return (Get-Content -Raw -Path $p | ConvertFrom-Json)
}

function Import-ProvisionConfig {
  param([Parameter(Mandatory)][string]$Path)
  if (-not (Test-Path $Path)) {
    throw "Config not found: '$Path'. Copy provision.config.example.json to a GIT-IGNORED provision.config.json and fill in your non-production test-site values. Real config must never be committed."
  }
  return (Get-Content -Raw -Path $Path | ConvertFrom-Json)
}

function Get-ConfigValue {
  param($Config, [string]$Name)
  if ($null -eq $Config.PSObject.Properties[$Name]) { return $null }
  return $Config.$Name
}

# Central fail-closed gate. Throws unless EVERY safety condition holds.
function Assert-SafeConfig {
  param([Parameter(Mandatory)]$Config)

  $problems = @()

  # 1. Required approval flags.
  if ((Get-ConfigValue $Config 'phase2Approved') -ne $true) { $problems += 'phase2Approved must be true' }
  if ((Get-ConfigValue $Config 'nonProductionOnly') -ne $true) { $problems += 'nonProductionOnly must be true' }
  if ((Get-ConfigValue $Config 'legacyWritebackAllowed') -ne $false) { $problems += 'legacyWritebackAllowed must be false (no writeback to legacy)' }
  if ((Get-ConfigValue $Config 'powerAutomateAllowed') -ne $false) { $problems += 'powerAutomateAllowed must be false (no Power Automate flows)' }

  # 2. Environment label must look non-production.
  $envLabel = [string](Get-ConfigValue $Config 'environmentLabel')
  if ([string]::IsNullOrWhiteSpace($envLabel)) {
    $problems += 'environmentLabel is required (must be a non-production label, e.g. "test")'
  } elseif ($envLabel.ToLower() -notmatch $script:NonProdLabelPattern) {
    $problems += "environmentLabel '$envLabel' is not a recognized non-production label (test/sandbox/dev/nonprod/qa/staging)"
  }

  # 3. List prefix must be the approved v2 prefix.
  $prefix = [string](Get-ConfigValue $Config 'listPrefix')
  if ($prefix -ne $script:RequiredListPrefix) {
    $problems += "listPrefix must be '$($script:RequiredListPrefix)' (got '$prefix')"
  }

  # 4. Target reference must not be legacy/production. We never connect to legacy.
  $siteRef = [string](Get-ConfigValue $Config 'siteReferencePlaceholder')
  if ([string]::IsNullOrWhiteSpace($siteRef)) {
    $problems += 'siteReferencePlaceholder is required (the non-production test-site reference, supplied at runtime)'
  } else {
    foreach ($tok in $script:ForbiddenTargetTokens) {
      if ($siteRef.ToLower().Contains($tok)) { $problems += "siteReferencePlaceholder contains forbidden token '$tok' — refusing to target legacy/production/OneDrive" }
    }
    if ($siteRef -eq '<TEST_SITE_REFERENCE>' -or $siteRef -like '*PLACEHOLDER*') {
      $problems += 'siteReferencePlaceholder is still a placeholder — supply your non-production test-site reference in the git-ignored config'
    }
  }

  # 5. Cross-check labels for legacy/production tokens too.
  foreach ($tok in @('legacy','production')) {
    if ($envLabel.ToLower().Contains($tok)) { $problems += "environmentLabel must not contain '$tok'" }
  }

  if ($problems.Count -gt 0) {
    throw ("FAIL-CLOSED: provisioning config rejected for safety:`n - " + ($problems -join "`n - "))
  }

  Write-Host "[safety] Config passed fail-closed checks: non-production test site, no legacy writeback, no Power Automate." -ForegroundColor Green
}

# Returns $true if the PnP.PowerShell module (the chosen Microsoft-supported, interactive-auth
# approach) is available. Never installs anything automatically.
function Test-ProvisioningModuleAvailable {
  return [bool](Get-Module -ListAvailable -Name 'PnP.PowerShell')
}

function Assert-ModuleOrExplain {
  if (-not (Test-ProvisioningModuleAvailable)) {
    throw @"
PREREQUISITE MISSING: the 'PnP.PowerShell' module is not installed.
This script does NOT auto-install modules and does NOT proceed silently.
To run live against your approved non-production test site:
  1) Install-Module PnP.PowerShell -Scope CurrentUser   (one-time, operator action)
  2) Authenticate interactively at runtime (no secrets are stored by these scripts).
Until then, re-run with -WhatIf to produce the design-only provisioning plan from the schema.
"@
  }
}

# Build the ordered provisioning plan from the schema (dependency-correct list order).
function Get-ProvisioningPlan {
  param([Parameter(Mandatory)]$Schema)
  $order = @(
    'Escalations_v2_Departments','Escalations_v2_Users','Escalations_v2_Tags',
    'Escalations_v2_Tickets','Escalations_v2_TicketTags','Escalations_v2_Activity',
    'Escalations_v2_Comments','Escalations_v2_InternalNotes'
  )
  $plan = @()
  foreach ($name in $order) {
    $def = $Schema.lists.$name
    if ($null -eq $def) { throw "Schema is missing required list '$name'." }
    $plan += [pscustomobject]@{
      List    = $name
      Display = $def.displayName
      Fields  = @($def.fields | ForEach-Object { $_.name })
    }
  }
  return $plan
}

function Write-Report {
  param([string]$Title, [object[]]$Lines)
  Write-Host ""
  Write-Host "==== $Title ====" -ForegroundColor Cyan
  foreach ($l in $Lines) { Write-Host "  $l" }
  Write-Host "==== end $Title ====" -ForegroundColor Cyan
}
