$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

# 与仓库 packageManager 一致；未全局安装 pnpm 时由 Node 自带的 corepack 提供
function Invoke-RepoPnpm {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)
  & corepack pnpm @Args
}

$containerName = "ai-plan-postgres"
$databaseUrl = "postgresql://postgres:postgres@localhost:5432/ai_plan?schema=public"
$apiPortCandidates = @(4100, 4200, 4300, 5100, 6100, 7100, 8100, 9100, 12000, 18080)
$apiPort = $null
$dockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

function Test-DockerReady {
  # docker 在引擎未启动时会写 stderr；在 $ErrorActionPreference=Stop 下会变成终止错误，需临时忽略
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    docker ps *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Test-PortBindable {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker command not found. Please install Docker Desktop first."
}

if (-not (Test-DockerReady)) {
  if (-not (Test-Path $dockerDesktopPath)) {
    throw "Docker daemon is not ready and Docker Desktop was not found at $dockerDesktopPath"
  }

  Write-Host "[dev-up] Starting Docker Desktop..."
  Start-Process $dockerDesktopPath | Out-Null

  $dockerReady = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 2
    if (Test-DockerReady) {
      $dockerReady = $true
      break
    }
  }

  if (-not $dockerReady) {
    throw "Docker daemon did not become ready in time."
  }
}

$existingContainer = (docker ps -a --filter "name=^/${containerName}$" --format "{{.Names}}" | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($existingContainer)) {
  Write-Host "[dev-up] Creating PostgreSQL container: $containerName"
  docker run -d --name $containerName -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ai_plan -p 5432:5432 postgres:16-alpine | Out-Null
} else {
  Write-Host "[dev-up] Starting PostgreSQL container: $containerName"
  docker start $containerName | Out-Null
}

$pgReady = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  docker exec $containerName pg_isready -U postgres -d ai_plan *> $null
  if ($LASTEXITCODE -eq 0) {
    $pgReady = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $pgReady) {
  throw "PostgreSQL container is running but not ready."
}

$nodeModulesRoot = Join-Path $projectRoot "node_modules"

Write-Host "[dev-up] Installing workspace dependencies (pnpm)..."
Invoke-RepoPnpm install

& (Join-Path $scriptDir "sync-workspace-packages.ps1")

$prismaEntry = Join-Path $nodeModulesRoot "prisma\build\index.js"
$tsxEntry = Join-Path $nodeModulesRoot "tsx\dist\cli.mjs"
if (-not (Test-Path $prismaEntry)) {
  throw "依赖不完整：缺少 $prismaEntry 。请删除仓库根目录 node_modules 后重新执行 corepack pnpm install"
}
if (-not (Test-Path $tsxEntry)) {
  throw "依赖不完整：缺少 $tsxEntry 。请删除仓库根目录 node_modules 后重新执行 corepack pnpm install"
}

$env:DATABASE_URL = $databaseUrl

# 不用 Get-NetTCPConnection：在部分 Windows/集成终端上会扫全表极慢或长时间无输出，像「卡死」
Write-Host "[dev-up] Choosing API listen port..."
foreach ($candidate in $apiPortCandidates) {
  if (Test-PortBindable -Port $candidate) {
    $apiPort = $candidate
    break
  }
}

if (-not $apiPort) {
  $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, 0)
  $probe.Start()
  $apiPort = ([System.Net.IPEndPoint]$probe.LocalEndpoint).Port
  $probe.Stop()
}

Write-Host "[dev-up] API port: $apiPort"

$apiBaseUrl = "http://127.0.0.1:$apiPort"
$env:PORT = "$apiPort"
$env:VITE_API_BASE_URL = $apiBaseUrl
# web-admin 开发代理目标（与 PORT 一致；勿依赖 shell 里过期的 localhost:4100）
$env:VITE_API_PROXY_TARGET = $apiBaseUrl

# migrate dev 会等待 stdin（漂移/重置提示等），在「一键起服务」里极易表现为卡死；本地起库用 deploy 即可
Write-Host "[dev-up] Applying database migrations (prisma migrate deploy)..."
Push-Location (Join-Path $projectRoot "apps\api")
try {
  & node $prismaEntry migrate deploy
  Write-Host "[dev-up] Generating Prisma client (prisma generate)..."
  Invoke-RepoPnpm --filter @ai-plan/api prisma:generate
} finally {
  Pop-Location
}

Write-Host "[dev-up] Seeding preset templates (idempotent)..."
Invoke-RepoPnpm --filter @ai-plan/api db:seed

Write-Host "[dev-up] Starting services..."
Write-Host "  API:       $apiBaseUrl"
Write-Host "  Web User:  http://localhost:5200"
Write-Host "  Web Admin: http://localhost:5201"

Invoke-RepoPnpm exec concurrently `
  -k `
  --names "api,web-user,web-admin" `
  --prefix-colors "cyan,green,magenta" `
  "corepack pnpm --filter @ai-plan/api dev" `
  "corepack pnpm --filter @ai-plan/web-user run dev" `
  "corepack pnpm --filter @ai-plan/web-admin run dev"
