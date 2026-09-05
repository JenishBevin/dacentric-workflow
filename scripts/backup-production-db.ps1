<#
.SYNOPSIS
  Takes a fresh pg_dump of the production database and saves it locally.

.DESCRIPTION
  Reads the production connection string from the DACENTRIC_PROD_DATABASE_URL
  environment variable (never hardcoded here, so this file is safe to commit)
  and writes a timestamped, custom-format dump into the backups/ folder next
  to this script. Keeps only the most recent $RetentionCount backups and
  deletes older ones automatically.

.NOTES
  Runs pg_dump via a throwaway `postgres:18-alpine` Docker container rather
  than a locally-installed client — Railway's Postgres is version 18, and
  pg_dump refuses to dump from a server newer than itself, so this avoids
  needing a matching client installed on this machine. Requires Docker
  Desktop to be running (same as this project's local Postgres already
  needs).

.EXAMPLE
  # One-time setup (run once, in an elevated or normal PowerShell prompt):
  [Environment]::SetEnvironmentVariable("DACENTRIC_PROD_DATABASE_URL", "postgresql://postgres:xxxx@xxxx.proxy.rlwy.net:xxxxx/railway", "User")

  # Then just run:
  powershell -ExecutionPolicy Bypass -File scripts\backup-production-db.ps1
#>

param(
    [int]$RetentionCount = 30
)

$ErrorActionPreference = "Stop"

$connectionString = $env:DACENTRIC_PROD_DATABASE_URL
if (-not $connectionString) {
    Write-Error "DACENTRIC_PROD_DATABASE_URL is not set. Run:`n  [Environment]::SetEnvironmentVariable('DACENTRIC_PROD_DATABASE_URL', '<your Railway DATABASE_PUBLIC_URL>', 'User')`nthen open a new terminal and try again."
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupDir = Join-Path (Split-Path -Parent $scriptDir) "backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "dacentric-prod-$timestamp.dump"
$backupFile = Join-Path $backupDir $fileName

Write-Host "Backing up production database to $backupFile ..."

try {
    # Mount the backups folder into a throwaway postgres:18-alpine container
    # (matching Railway's server version) and have pg_dump write directly
    # into it — avoids both a client-version mismatch and any binary-data
    # corruption from redirecting stdout through PowerShell.
    & docker run --rm -v "${backupDir}:/backup" postgres:18-alpine `
        pg_dump --format=custom --no-owner --no-privileges --dbname="$connectionString" -f "/backup/$fileName"
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump exited with code $LASTEXITCODE"
    }
} catch {
    Write-Error "Backup failed: $_"
    if (Test-Path $backupFile) { Remove-Item $backupFile -Force }
    exit 1
}

$size = (Get-Item $backupFile).Length / 1KB
Write-Host ("Backup complete: {0} ({1:N0} KB)" -f $backupFile, $size)

# Prune old backups, keep only the most recent $RetentionCount
$allBackups = Get-ChildItem -Path $backupDir -Filter "dacentric-prod-*.dump" | Sort-Object LastWriteTime -Descending
if ($allBackups.Count -gt $RetentionCount) {
    $toDelete = $allBackups | Select-Object -Skip $RetentionCount
    foreach ($old in $toDelete) {
        Write-Host "Pruning old backup: $($old.Name)"
        Remove-Item $old.FullName -Force
    }
}

Write-Host "Done. $([Math]::Min($allBackups.Count, $RetentionCount)) backup(s) retained in $backupDir"
