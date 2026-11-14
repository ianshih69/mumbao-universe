param(
  [string]$Source = 'E:\mumbao\newCode\mumbao-universe\client\public\images\public',
  [int]$Port = 5185
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  & node.exe (Join-Path $PSScriptRoot 'client\scripts\facilities\preview.mjs') --source $Source --port $Port
  if ($LASTEXITCODE -ne 0) { throw "Facilities preview stopped with exit code $LASTEXITCODE" }
} finally { Pop-Location }
