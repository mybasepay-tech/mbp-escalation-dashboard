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
    'Escalations_v2_Comments','Escalations_v2_InternalNotes','Escalations_v2_Attachments'
  )
  # Fail closed on drift in EITHER direction: a schema list missing from this order would be
  # silently skipped; an order entry missing from the schema would be a stale plan.
  $schemaLists = @($Schema.lists.PSObject.Properties.Name)
  $notInOrder = @($schemaLists | Where-Object { $order -notcontains $_ })
  if ($notInOrder.Count -gt 0) {
    throw "FAIL-CLOSED: schema defines list(s) not present in the provisioning order: $([string]::Join(', ', $notInOrder)). Add them to Get-ProvisioningPlan explicitly."
  }
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

# ---------------------------------------------------------------------------
# Loop 21: column / index / view provisioning helpers (pure; no live calls).
# These build plans and map types from the schema. The PnP-invoking creation
# functions live in provision-sharepoint-v2.ps1; validate reuses the maps here.
# ---------------------------------------------------------------------------

# Safe optional-property read (Set-StrictMode-safe).
function Get-Prop {
  param($Obj, [string]$Name)
  if ($null -eq $Obj) { return $null }
  $p = $Obj.PSObject.Properties[$Name]
  if ($null -eq $p) { return $null }
  return $p.Value
}

# Map a schema column type to the PnP/SharePoint field type token used at creation.
function ConvertTo-PnPFieldType {
  param([string]$SchemaType)
  switch ($SchemaType) {
    'Text'      { return 'Text' }
    'Note'      { return 'Note' }
    'Choice'    { return 'Choice' }
    'DateTime'  { return 'DateTime' }
    'Boolean'   { return 'Boolean' }
    'Number'    { return 'Number' }
    'Currency'  { return 'Currency' }
    'Hyperlink' { return 'URL' }     # SharePoint internal type for Hyperlink is "URL"
    'Person'    { return 'User' }    # SharePoint internal type for Person is "User"
    'Lookup'    { return 'Lookup' }
    default     { return $null }
  }
}

# Acceptable live TypeAsString values for a schema type ("close enough" for validation).
function Get-ExpectedLiveTypes {
  param([string]$SchemaType)
  switch ($SchemaType) {
    'Text'      { return @('Text') }
    'Note'      { return @('Note') }
    'Choice'    { return @('Choice','MultiChoice') }
    'DateTime'  { return @('DateTime') }
    'Boolean'   { return @('Boolean') }
    'Number'    { return @('Number') }
    'Currency'  { return @('Currency','Number') }
    'Hyperlink' { return @('URL') }
    'Person'    { return @('User','UserMulti') }
    'Lookup'    { return @('Lookup','LookupMulti') }
    default     { return @() }
  }
}

# Returns $true if a schema column type is a Lookup (provisioned in the 2nd pass).
function Test-IsLookupType { param([string]$SchemaType) return ($SchemaType -eq 'Lookup') }

# Build the per-list index plan: union of fields marked indexed=true and the
# recommendedIndexes columns. Returns a hashtable: listName -> string[] columns.
function Get-IndexPlan {
  param([Parameter(Mandatory)]$Schema)
  $map = @{}
  foreach ($listName in $Schema.lists.PSObject.Properties.Name) {
    $set = [System.Collections.Generic.List[string]]::new()
    foreach ($f in $Schema.lists.$listName.fields) {
      if ((Get-Prop $f 'indexed') -eq $true -and -not $set.Contains($f.name)) { $set.Add($f.name) }
    }
    $map[$listName] = $set
  }
  $recommended = Get-Prop $Schema 'recommendedIndexes'
  if ($null -ne $recommended) {
    foreach ($idx in $recommended) {
      $ln = $idx.list
      if (-not $map.ContainsKey($ln)) { $map[$ln] = [System.Collections.Generic.List[string]]::new() }
      foreach ($c in $idx.columns) { if (-not $map[$ln].Contains($c)) { $map[$ln].Add($c) } }
    }
  }
  $out = @{}
  foreach ($k in $map.Keys) { $out[$k] = @($map[$k]) }
  return $out
}

# Build the view plan from schema.views. For each view, decide whether its filter
# is STATIC (safely bakeable into CAML) or DYNAMIC (depends on [param]/[Me]/an
# app-level status set) — dynamic filters are NEVER faked into the stored view;
# they are applied at query time by the adapter. OrderBy is always bakeable.
# Returns an array of descriptors.
function Get-ViewPlan {
  param([Parameter(Mandatory)]$Schema)
  $views = Get-Prop $Schema 'views'
  $plan = @()
  if ($null -eq $views) { return $plan }
  foreach ($v in $views) {
    $filter  = [string](Get-Prop $v 'filter')
    $sortBy  = [string](Get-Prop $v 'sortBy')
    $groupBy = [string](Get-Prop $v 'groupBy')

    $orderByCaml = ''
    if (-not [string]::IsNullOrWhiteSpace($sortBy)) {
      $refs = ''
      foreach ($part in ($sortBy -split ',')) {
        $p = $part.Trim()
        if ($p -eq '') { continue }
        $bits = $p -split '\s+'
        $fname = $bits[0]
        $asc = 'TRUE'
        if ($bits.Count -gt 1 -and $bits[1].ToLower() -eq 'desc') { $asc = 'FALSE' }
        $refs += "<FieldRef Name='$fname' Ascending='$asc' />"
      }
      if ($refs -ne '') { $orderByCaml = "<OrderBy>$refs</OrderBy>" }
    }

    $whereCaml = ''
    $filterStatus = ''
    $lower = $filter.ToLower()
    if ([string]::IsNullOrWhiteSpace($filter) -or $lower -eq '(none)') {
      $filterStatus = 'no-filter'
    } elseif ($lower -match '\[param\]|\[me\]|open_statuses') {
      # Dynamic predicate — applied by the adapter/app at query time. Do not fake.
      $filterStatus = "runtime-dynamic (adapter-applied): $filter"
    } elseif ($lower -match 'legacyitemid is not null') {
      $whereCaml = "<Where><IsNotNull><FieldRef Name='LegacyItemId' /></IsNotNull></Where>"
      $filterStatus = 'static-baked: IsNotNull(LegacyItemId)'
    } else {
      # Unknown shape — be honest, do not guess CAML.
      $filterStatus = "runtime-dynamic (adapter-applied): $filter"
    }

    $query = $whereCaml + $orderByCaml
    $plan += [pscustomobject]@{
      List          = $v.list
      Name          = $v.name
      Query         = $query
      FilterStatus  = $filterStatus
      GroupByNote   = if ([string]::IsNullOrWhiteSpace($groupBy)) { '' } else { "groupBy '$groupBy' applied at runtime (not baked)" }
    }
  }
  return $plan
}
