# symlink=false 时 workspace 协议不会把包挂进各 app；用目录复制同步（无需管理员权限）。
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

$defs = @(
  @{ AppRel = "apps\api"; ScopeName = "ai-engine"; PackageRel = "packages\ai-engine" },
  @{ AppRel = "apps\api"; ScopeName = "pro-plan-agent"; PackageRel = "packages\pro-plan-agent" },
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

  # 只同步 workspace 包本体（源码/构建产物/配置），不要复制其 node_modules。
  # 用文件级复制保留相对路径，同时跳过 node_modules（pnpm 链接/断链会导致目录级 Copy-Item 失败）。
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $files = Get-ChildItem -LiteralPath $src -Recurse -File -Force | Where-Object {
    $_.FullName -notmatch "\\\\node_modules\\\\"
  }
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($src.Length).TrimStart("\", "/")
    $target = Join-Path $dest $rel
    $targetDir = Split-Path -Parent $target
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Copy-Item -LiteralPath $f.FullName -Destination $target -Force
  }
}

Write-Host "[sync-workspace-packages] Copied @ai-plan workspace packages into apps."
