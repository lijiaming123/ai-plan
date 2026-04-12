# symlink=false 时 workspace 协议不会把包挂进各 app；用目录复制同步（无需管理员权限）。
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

$defs = @(
  @{ AppRel = "apps\api"; ScopeName = "ai-engine"; PackageRel = "packages\ai-engine" },
  @{ AppRel = "apps\web-user"; ScopeName = "ui-theme"; PackageRel = "packages\ui-theme" },
  @{ AppRel = "apps\web-admin"; ScopeName = "ui-theme"; PackageRel = "packages\ui-theme" }
)

foreach ($d in $defs) {
  $src = Join-Path $projectRoot $d.PackageRel
  if (-not (Test-Path $src)) {
    throw "Workspace package missing: $src"
  }

  $scopeDir = Join-Path (Join-Path (Join-Path $projectRoot $d.AppRel) "node_modules") "@ai-plan"
  New-Item -ItemType Directory -Force -Path $scopeDir | Out-Null

  $dest = Join-Path $scopeDir $d.ScopeName
  if (Test-Path $dest) {
    Remove-Item -LiteralPath $dest -Recurse -Force
  }

  Copy-Item -Path $src -Destination $dest -Recurse -Force
}

Write-Host "[sync-workspace-packages] Copied @ai-plan workspace packages into apps."
