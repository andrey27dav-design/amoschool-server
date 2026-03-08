# deploy-when-online.ps1
# Polls until server is reachable, then uploads all changed files,
# restarts backend and rebuilds frontend.

$k = "C:\Users\Andrey_66\.ssh\id_ed25519_server"
$host_ip = "root@212.8.229.64"
$sshOpts = "-i `"$k`" -o StrictHostKeyChecking=no -o ConnectTimeout=8"

Write-Host "Waiting for server $host_ip ..." -ForegroundColor Yellow

# ── Poll until SSH responds ─────────────────────────────────────────────────
while ($true) {
    $test = ssh -i $k -o StrictHostKeyChecking=no -o ConnectTimeout=8 $host_ip "echo ALIVE" 2>&1
    if ($test -match "ALIVE") {
        Write-Host "Server is ONLINE!" -ForegroundColor Green
        break
    }
    Write-Host "  Still waiting... $(Get-Date -Format 'HH:mm:ss')"
    Start-Sleep -Seconds 15
}

# ── Upload backend files ────────────────────────────────────────────────────
Write-Host "`nUploading backend files..." -ForegroundColor Cyan

$backendFiles = @(
    @{ local = "C:\crm-migration\server-backup-2026-02-25\backend-src\services\migrationService.js";  remote = "/var/www/amoschool/backend/src/services/migrationService.js" },
    @{ local = "C:\crm-migration\server-backup-2026-02-25\backend-src\services\amoApi.js";            remote = "/var/www/amoschool/backend/src/services/amoApi.js" },
    @{ local = "C:\crm-migration\server-backup-2026-02-25\backend-src\services\batchMigrationService.js"; remote = "/var/www/amoschool/backend/src/services/batchMigrationService.js" },
    @{ local = "C:\crm-migration\server-backup-2026-02-25\backend-src\app.js";                        remote = "/var/www/amoschool/backend/src/app.js" },
    @{ local = "C:\crm-migration\server-backup-2026-02-25\backend-src\routes\data.js";                remote = "/var/www/amoschool/backend/src/routes/data.js" }
)

foreach ($f in $backendFiles) {
    if (Test-Path $f.local) {
        Write-Host "  -> $($f.remote)"
        scp -i $k -o StrictHostKeyChecking=no $f.local "${host_ip}:$($f.remote)"
    } else {
        Write-Host "  SKIP (not found): $($f.local)" -ForegroundColor DarkYellow
    }
}

# ── Upload frontend files ───────────────────────────────────────────────────
Write-Host "`nUploading frontend files..." -ForegroundColor Cyan

$frontendFiles = @(
    "App.jsx", "api.js", "App.css", "FieldSync.jsx", "FieldSync.css", "main.jsx", "index.css"
)
foreach ($f in $frontendFiles) {
    $local = "C:\crm-migration\server-backup-2026-02-25\frontend-src\$f"
    if (Test-Path $local) {
        Write-Host "  -> /var/www/amoschool/frontend/src/$f"
        scp -i $k -o StrictHostKeyChecking=no $local "${host_ip}:/var/www/amoschool/frontend/src/$f"
    }
}

# ── Restart backend ─────────────────────────────────────────────────────────
Write-Host "`nRestarting backend (PM2)..." -ForegroundColor Cyan
ssh -i $k -o StrictHostKeyChecking=no $host_ip "pm2 restart amoschool-backend --update-env && sleep 3 && pm2 show amoschool-backend --no-color 2>&1 | grep -E 'status|uptime|restarts'"

# ── Build frontend ──────────────────────────────────────────────────────────
Write-Host "`nBuilding frontend..." -ForegroundColor Cyan
ssh -i $k -o StrictHostKeyChecking=no $host_ip "cd /var/www/amoschool/frontend && npm run build 2>&1 | tail -10"

# ── Git commit ──────────────────────────────────────────────────────────────
Write-Host "`nCreating git commit..." -ForegroundColor Cyan
ssh -i $k -o StrictHostKeyChecking=no $host_ip "cd /var/www/amoschool && git add -A && git commit -m 'Deploy: pipelines tab with selector+sync, batch migration, batchMigrationService 2026-02-25' 2>&1"

# ── Health check ────────────────────────────────────────────────────────────
Write-Host "`nHealth check..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
$health = ssh -i $k -o StrictHostKeyChecking=no $host_ip "curl -s https://wisper.aikonver.ru/api/health 2>&1"
Write-Host $health

Write-Host "`nDone!" -ForegroundColor Green
