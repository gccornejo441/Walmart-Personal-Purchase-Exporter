$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP 'walmart-exporter-package-stage'
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$zip = Join-Path $root "releases/walmart-personal-purchase-exporter-v$($manifest.version).zip"
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$files = @('manifest.json','popup.html','popup.css','popup.js','content.js','export-utils.js')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage }
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Output "Created $zip"
