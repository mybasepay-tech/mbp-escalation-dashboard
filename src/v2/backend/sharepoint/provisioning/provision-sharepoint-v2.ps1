<#
.SYNOPSIS
  Provision the Escalations_v2_* lists, COLUMNS, INDEXES, and VIEWS on an APPROVED,
  NON-PRODUCTION SharePoint test site.

.DESCRIPTION
  Config-driven and FAIL-CLOSED. Reads the design schema (schema.sharepoint-v2.json) and a
  runtime, GIT-IGNORED config (provision.config.json). It validates approval flags and the
  target before doing anything, then either:
    * -WhatIf / default (dry-run): prints the dependency-ordered plan (lists + columns +
      lookups + indexes + views) from the schema and makes NO connection and NO changes; or
    * -Execute: connects interactively (PnP.PowerShell) to the configured NON-PRODUCTION test
      site and ensures lists, then creates columns/lookups/indexes/views idempotently.

  Provisioning order (dependency-correct):
    1. Ensure the 8 lists exist (idempotent; created in Loop 20).
    2. Pass 1 — create NON-lookup columns on every list (Text/Note/Choice/DateTime/Boolean/
       Number/Currency/Hyperlink/Person).
    3. Pass 2 — create Lookup columns (target lists + their key fields now all exist).
    4. Pass 3 — set indexes (fields marked indexed + recommendedIndexes).
    5. Pass 4 — create views (static filters baked; dynamic [param]/[Me]/status-set filters are
       applied by the adapter at query time and are NOT faked into the stored view).

  Idempotent: existing columns/views are skipped (never overwritten). SAFETY: only targets the
  Escalations_v2_* lists; never legacy; never writes legacy; creates NO Power Automate flows;
  stores/commits NO credentials, secrets, tenant/client IDs, or URLs. Failures are reported
  honestly — execution is never faked.

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

# --- Live creation helpers (invoke PnP cmdlets; only reached on -Execute) ------------------

# Resolve a field by its INTERNAL name only. Get-PnPField -Identity also matches display
# names, which false-matches built-ins (e.g. "Type"->DocIcon, "Color"->_ColorHex,
# "Name"->FileLeafRef). We bind to internal names exclusively (schema rule).
function Get-FieldByInternalName {
  param([string]$ListName, [string]$InternalName)
  return (Get-PnPField -List $ListName -ErrorAction SilentlyContinue | Where-Object { $_.InternalName -eq $InternalName } | Select-Object -First 1)
}

function New-SchemaColumn {
  param([string]$ListName, $Field)
  $name = $Field.name
  $existing = Get-FieldByInternalName -ListName $ListName -InternalName $name
  if ($null -ne $existing) { return [pscustomobject]@{ List=$ListName; Name=$name; Kind='field'; Action='skipped'; Detail='already exists' } }
  $pnpType = ConvertTo-PnPFieldType $Field.type
  if ($null -eq $pnpType) { return [pscustomobject]@{ List=$ListName; Name=$name; Kind='field'; Action='failed'; Detail="unsupported type '$($Field.type)'" } }
  try {
    $p = @{ List=$ListName; DisplayName=$name; InternalName=$name; Type=$pnpType; ErrorAction='Stop' }
    if ($Field.type -eq 'Choice') {
      $choices = Get-Prop $Field 'choices'
      if ($null -ne $choices) { $p['Choices'] = @($choices) }
    }
    Add-PnPField @p | Out-Null
    return [pscustomobject]@{ List=$ListName; Name=$name; Kind='field'; Action='created'; Detail="$($Field.type) -> $pnpType" }
  } catch {
    return [pscustomobject]@{ List=$ListName; Name=$name; Kind='field'; Action='failed'; Detail=$_.Exception.Message }
  }
}

function New-SchemaLookup {
  param([string]$ListName, $Field)
  $name = $Field.name
  $existing = Get-FieldByInternalName -ListName $ListName -InternalName $name
  if ($null -ne $existing) { return [pscustomobject]@{ List=$ListName; Name=$name; Kind='lookup'; Action='skipped'; Detail='already exists' } }
  $targetListName = Get-Prop $Field 'lookupList'
  $showField = Get-Prop $Field 'lookupField'
  if ([string]::IsNullOrWhiteSpace($targetListName)) { return [pscustomobject]@{ List=$ListName; Name=$name; Kind='lookup'; Action='failed'; Detail='missing lookupList in schema' } }
  $target = Get-PnPList -Identity $targetListName -ErrorAction SilentlyContinue
  if ($null -eq $target) { return [pscustomobject]@{ List=$ListName; Name=$name; Kind='lookup'; Action='failed'; Detail="target list '$targetListName' not found" } }
  if (-not [string]::IsNullOrWhiteSpace($showField)) {
    $sf = Get-FieldByInternalName -ListName $targetListName -InternalName $showField
    if ($null -eq $sf) { return [pscustomobject]@{ List=$ListName; Name=$name; Kind='lookup'; Action='failed'; Detail="ShowField '$showField' not present on '$targetListName'" } }
  }
  try {
    $guid = $target.Id.ToString()
    $showAttr = if ([string]::IsNullOrWhiteSpace($showField)) { '' } else { " ShowField='$showField'" }
    $xml = "<Field Type='Lookup' DisplayName='$name' Name='$name' StaticName='$name' List='{$guid}'$showAttr />"
    Add-PnPFieldFromXml -List $ListName -FieldXml $xml -ErrorAction Stop | Out-Null
    return [pscustomobject]@{ List=$ListName; Name=$name; Kind='lookup'; Action='created'; Detail="Lookup -> $targetListName.$showField" }
  } catch {
    return [pscustomobject]@{ List=$ListName; Name=$name; Kind='lookup'; Action='failed'; Detail=$_.Exception.Message }
  }
}

function Set-SchemaIndex {
  param([string]$ListName, [string]$FieldName)
  $f = Get-FieldByInternalName -ListName $ListName -InternalName $FieldName
  if ($null -eq $f) { return [pscustomobject]@{ List=$ListName; Name=$FieldName; Kind='index'; Action='failed'; Detail='field not present (by internal name)' } }
  if ($f.Indexed) { return [pscustomobject]@{ List=$ListName; Name=$FieldName; Kind='index'; Action='skipped'; Detail='already indexed' } }
  try {
    # Bind by the field's GUID to avoid -Identity display-name ambiguity (e.g. two "Type" fields).
    Set-PnPField -List $ListName -Identity $f.Id -Values @{ Indexed = $true } -ErrorAction Stop | Out-Null
    return [pscustomobject]@{ List=$ListName; Name=$FieldName; Kind='index'; Action='indexed'; Detail='' }
  } catch {
    return [pscustomobject]@{ List=$ListName; Name=$FieldName; Kind='index'; Action='failed'; Detail=$_.Exception.Message }
  }
}

function New-SchemaView {
  param([string]$ListName, [string]$ViewName, [string]$Query, [string[]]$Fields)
  $existing = Get-PnPView -List $ListName -Identity $ViewName -ErrorAction SilentlyContinue
  if ($null -ne $existing) { return [pscustomobject]@{ List=$ListName; Name=$ViewName; Kind='view'; Action='skipped'; Detail='already exists' } }
  try {
    $p = @{ List=$ListName; Title=$ViewName; Fields=$Fields; ErrorAction='Stop' }
    if (-not [string]::IsNullOrWhiteSpace($Query)) { $p['Query'] = $Query }
    Add-PnPView @p | Out-Null
    return [pscustomobject]@{ List=$ListName; Name=$ViewName; Kind='view'; Action='created'; Detail='' }
  } catch {
    return [pscustomobject]@{ List=$ListName; Name=$ViewName; Kind='view'; Action='failed'; Detail=$_.Exception.Message }
  }
}

# --- Main ----------------------------------------------------------------------------------

Write-Host "SharePoint v2 provisioning — columns/indexes/views, NON-PRODUCTION test site only (no legacy, no Power Automate)." -ForegroundColor Yellow

# 1. Load schema + config and run fail-closed safety gate BEFORE anything else.
$schema = Import-Schema
$config = Import-ProvisionConfig -Path $ConfigPath
Assert-SafeConfig -Config $config

# 2. Build the dependency-ordered plan from the schema.
$plan = Get-ProvisioningPlan -Schema $schema
$indexPlan = Get-IndexPlan -Schema $schema
# @(): PowerShell unwraps a single-element return; .Count on a scalar throws under StrictMode.
$viewPlan = @(Get-ViewPlan -Schema $schema)

$fieldCount = 0; $lookupCount = 0
foreach ($listName in $schema.lists.PSObject.Properties.Name) {
  foreach ($f in $schema.lists.$listName.fields) {
    if (Test-IsLookupType $f.type) { $lookupCount++ } else { $fieldCount++ }
  }
}
$indexCount = 0; foreach ($k in $indexPlan.Keys) { $indexCount += $indexPlan[$k].Count }

$report = @()
$report += "schemaVersion : $($schema.schemaVersion)"
$report += "environment   : $($config.environmentLabel)  (non-production)"
$report += "listPrefix    : $($config.listPrefix)"
$report += "runNamespace  : $($config.runNamespace)"
$report += "lists planned : $($plan.Count)"
$report += "columns       : $fieldCount non-lookup + $lookupCount lookup = $($fieldCount + $lookupCount) total"
$report += "indexes       : $indexCount column-index settings"
$report += "views         : $($viewPlan.Count)"
foreach ($step in $plan) { $report += " - $($step.List)  [$($step.Fields.Count) columns]" }
Write-Report -Title 'Provisioning plan (from schema)' -Lines $report

# 3. Dry-run path (DEFAULT): no connection, no changes.
if (-not $Execute) {
  Write-Host "[dry-run] No connection made and nothing created. Re-run with -Execute (after config + approvals) to apply." -ForegroundColor Yellow
  Write-Host "[dry-run] Views with dynamic filters ([param]/[Me]/status-set) are applied by the adapter at query time and are NOT baked into stored views." -ForegroundColor Yellow
  return
}

# 4. Live path: require the module; never auto-install, never fake.
Assert-ModuleOrExplain

if (-not $PSCmdlet.ShouldProcess($config.siteReferencePlaceholder, 'Create Escalations_v2_* columns/indexes/views')) {
  return
}

# Interactive auth only — NO secrets are read or stored here. PnP.PowerShell 2.x+ requires an
# Entra App Registration client id for interactive auth; it is a runtime, GIT-IGNORED config
# value (a public app identifier, not a secret) and is never committed.
Import-Module PnP.PowerShell
Write-Host "[connect] Connecting interactively to the configured non-production test site..." -ForegroundColor Yellow
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
Write-Host "[connect] Connected to '$($web.Title)' ($($web.ServerRelativeUrl))." -ForegroundColor Green

$results = @()

# Pass 0: ensure lists exist (idempotent; created in Loop 20).
foreach ($step in $plan) {
  $existing = Get-PnPList -Identity $step.List -ErrorAction SilentlyContinue
  if ($null -eq $existing) {
    Write-Host "[list] Creating $($step.List) ..." -ForegroundColor Green
    New-PnPList -Title $step.List -Template GenericList -EnableContentTypes:$false | Out-Null
    $results += [pscustomobject]@{ List=$step.List; Name=$step.List; Kind='list'; Action='created'; Detail='' }
  } else {
    $results += [pscustomobject]@{ List=$step.List; Name=$step.List; Kind='list'; Action='skipped'; Detail='already exists' }
  }
}

# Pass 1: non-lookup columns on every list.
Write-Host "[pass 1] Creating non-lookup columns..." -ForegroundColor Cyan
foreach ($listName in $schema.lists.PSObject.Properties.Name) {
  foreach ($f in $schema.lists.$listName.fields) {
    if (Test-IsLookupType $f.type) { continue }
    $r = New-SchemaColumn -ListName $listName -Field $f
    $results += $r
    Write-Host ("    [{0}] {1}.{2} ({3})" -f $r.Action, $listName, $r.Name, $r.Detail)
  }
}

# Pass 2: lookup columns (all target lists + key fields now exist).
Write-Host "[pass 2] Creating lookup columns..." -ForegroundColor Cyan
foreach ($listName in $schema.lists.PSObject.Properties.Name) {
  foreach ($f in $schema.lists.$listName.fields) {
    if (-not (Test-IsLookupType $f.type)) { continue }
    $r = New-SchemaLookup -ListName $listName -Field $f
    $results += $r
    Write-Host ("    [{0}] {1}.{2} ({3})" -f $r.Action, $listName, $r.Name, $r.Detail)
  }
}

# Pass 3: indexes.
Write-Host "[pass 3] Setting indexes..." -ForegroundColor Cyan
foreach ($listName in $indexPlan.Keys) {
  foreach ($col in $indexPlan[$listName]) {
    $r = Set-SchemaIndex -ListName $listName -FieldName $col
    $results += $r
    Write-Host ("    [{0}] index {1}.{2} ({3})" -f $r.Action, $listName, $r.Name, $r.Detail)
  }
}

# Pass 4: views. Build the present-field set per list so views only reference existing columns.
Write-Host "[pass 4] Creating views..." -ForegroundColor Cyan
$presentByList = @{}
foreach ($listName in $schema.lists.PSObject.Properties.Name) {
  $presentByList[$listName] = @(Get-PnPField -List $listName -ErrorAction SilentlyContinue | ForEach-Object { $_.InternalName })
}
foreach ($v in $viewPlan) {
  $schemaFieldNames = @($schema.lists.$($v.List).fields | ForEach-Object { $_.name })
  $present = $presentByList[$v.List]
  $fields = @($schemaFieldNames | Where-Object { $present -contains $_ })
  if ($fields.Count -eq 0) { $fields = @('Title') }
  $r = New-SchemaView -ListName $v.List -ViewName $v.Name -Query $v.Query -Fields $fields
  # annotate the filter handling for honest reporting
  $r | Add-Member -NotePropertyName FilterStatus -NotePropertyValue $v.FilterStatus -Force
  $results += $r
  Write-Host ("    [{0}] view {1} :: {2} | filter: {3}" -f $r.Action, $v.List, $v.Name, $v.FilterStatus)
}

# --- Summary -------------------------------------------------------------------------------
function Count-Where { param($Items, [string]$Kind, [string]$Action) return @($Items | Where-Object { $_.Kind -eq $Kind -and $_.Action -eq $Action }).Count }

$failed = @($results | Where-Object { $_.Action -eq 'failed' })
$summary = @(
  "lists    : created $(Count-Where $results 'list' 'created'), skipped $(Count-Where $results 'list' 'skipped')",
  "fields   : created $(Count-Where $results 'field' 'created'), skipped $(Count-Where $results 'field' 'skipped'), failed $(Count-Where $results 'field' 'failed')",
  "lookups  : created $(Count-Where $results 'lookup' 'created'), skipped $(Count-Where $results 'lookup' 'skipped'), failed $(Count-Where $results 'lookup' 'failed')",
  "indexes  : indexed $(Count-Where $results 'index' 'indexed'), skipped $(Count-Where $results 'index' 'skipped'), failed $(Count-Where $results 'index' 'failed')",
  "views    : created $(Count-Where $results 'view' 'created'), skipped $(Count-Where $results 'view' 'skipped'), failed $(Count-Where $results 'view' 'failed')",
  "note     : NO Power Automate flow created; legacy untouched; only Escalations_v2_* modified."
)
Write-Report -Title 'Provisioning result' -Lines $summary

if ($failed.Count -gt 0) {
  Write-Report -Title "FAILURES ($($failed.Count)) — not faked, reported honestly" -Lines @($failed | ForEach-Object { "$($_.Kind) $($_.List).$($_.Name): $($_.Detail)" })
}

Disconnect-PnPOnline
if ($failed.Count -gt 0) {
  Write-Host "[done-with-failures] Provisioning completed with $($failed.Count) failure(s) above. Re-run is idempotent; investigate before validating." -ForegroundColor Yellow
} else {
  Write-Host "[done] Column/index/view provisioning complete on the non-production test site. No credentials were written to disk." -ForegroundColor Green
}
