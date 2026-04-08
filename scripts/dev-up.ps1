$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$containerName = "ai-plan-postgres"
$databaseUrl = "postgresql://postgres:postgres@localhost:5432/ai_plan?schema=public"
$apiPortCandidates = @(4100, 4200, 4300, 5100, 6100, 7100, 8100, 9100, 12000, 18080)
$apiPort = $null
$dockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

function Test-DockerReady {
  docker ps *> $null
  return $LASTEXITCODE -eq 0
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

$tsxReady = $true
corepack pnpm --filter @ai-plan/api exec tsx --version *> $null
if ($LASTEXITCODE -ne 0) {
  $tsxReady = $false
}

if (-not $tsxReady) {
  Write-Host "[dev-up] Installing workspace dependencies..."
  corepack pnpm install
}

$env:DATABASE_URL = $databaseUrl

foreach ($candidate in $apiPortCandidates) {
  $isListening = $false
  try {
    Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction Stop | Out-Null
    $isListening = $true
  } catch {}

  if ($isListening) {
    continue
  }

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

$apiBaseUrl = "http://localhost:$apiPort"
$env:PORT = "$apiPort"
$env:VITE_API_BASE_URL = $apiBaseUrl

Write-Host "[dev-up] Applying database migrations..."
corepack pnpm --filter @ai-plan/api prisma migrate dev --name dev_bootstrap

Write-Host "[dev-up] Starting services..."
Write-Host "  API:       $apiBaseUrl"
Write-Host "  Web User:  http://localhost:5173"
Write-Host "  Web Admin: http://localhost:5174"

corepack pnpm exec concurrently `
  -k `
  --names "api,web-user,web-admin" `
  --prefix-colors "cyan,green,magenta" `
  "corepack pnpm --filter @ai-plan/api dev" `
  "corepack pnpm --filter @ai-plan/web-user exec vite --port 5173" `
  "corepack pnpm --filter @ai-plan/web-admin exec vite --port 5174"
