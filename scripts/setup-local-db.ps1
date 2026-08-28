param(
  [string]$Superuser = 'postgres'
)

# One-shot local database setup for MySchool Connect.
# Prompts ONLY for the PostgreSQL superuser password (never saved), then creates
# the app's role + database and verifies the connection string.
#
# Usage:
#   .\scripts\setup-local-db.ps1                          # default superuser "postgres"
#   .\scripts\setup-local-db.ps1 -Superuser admin          # if your superuser is named differently

$ErrorActionPreference = 'Stop'

$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path $psql)) {
  Write-Error "psql not found at '$psql'. Adjust the path at the top of this script."
}

Write-Host "Connecting as superuser: '$Superuser'"
Write-Host 'Enter its password when prompted.' -ForegroundColor Yellow
$sec = Read-Host -Prompt 'superuser password' -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pgPass = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $pgPass) { Write-Error 'Empty password given — aborting.' }

$env:PGPASSWORD = $pgPass

Write-Host 'Checking superuser login...' -ForegroundColor Cyan
& $psql -h 127.0.0.1 -U $Superuser -d postgres -tAc "SELECT 'SUPERUSER_OK'" | Out-String
if ($LASTEXITCODE -ne 0) {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Write-Error "Superuser login failed for '$Superuser'. If your superuser has a different name, rerun with -Superuser <name>."
}

# Create the app role (idempotent).
$roleExists = (& $psql -h 127.0.0.1 -U $Superuser -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'myschool'").Trim()
if ($roleExists -eq '1') {
  Write-Host 'Role "myschool" already exists — skipping create.' -ForegroundColor Green
} else {
  & $psql -h 127.0.0.1 -U $Superuser -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE myschool LOGIN PASSWORD 'myschool'"
  Write-Host 'Created role "myschool" (login password: myschool).' -ForegroundColor Green
}

# Create the app database (idempotent).
$dbExists = (& $psql -h 127.0.0.1 -U $Superuser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'myschool'").Trim()
if ($dbExists -eq '1') {
  Write-Host 'Database "myschool" already exists — skipping create.' -ForegroundColor Green
} else {
  & $psql -h 127.0.0.1 -U $Superuser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE myschool OWNER myschool"
  Write-Host 'Created database "myschool" owned by myschool.' -ForegroundColor Green
}

# Verify with the exact connection string the app will use.
$env:PGPASSWORD = 'myschool'
$ok = & $psql -h 127.0.0.1 -U myschool -d myschool -tAc "SELECT 'APP_CONNECTED'" | Out-String
if ($ok.Trim() -eq 'APP_CONNECTED') {
  Write-Host ''
  Write-Host '✔ App connection verified.' -ForegroundColor Green
  Write-Host 'DATABASE_URL="postgresql://myschool:myschool@localhost:5432/myschool?schema=public"'
} else {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Write-Error 'App connection failed.'
}

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue