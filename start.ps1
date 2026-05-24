# Magyar → Brit Angol Fordito - Indito script
$ErrorActionPreference = 'Stop'

Write-Host "Magyar -> Brit Angol Fordito" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# Check .env
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host ""
        Write-Host "FONTOS: Add meg az Anthropic API kulcsodat a .env fajlban!" -ForegroundColor Yellow
        Write-Host "  Nyisd meg: .env" -ForegroundColor Yellow
        Write-Host "  Csereld ki: sk-ant-... -> sajat kulcsod" -ForegroundColor Yellow
        Write-Host ""
        Pause
    }
}

# Install dependencies if needed
$venvPath = ".venv"
if (-not (Test-Path "$venvPath\Scripts\uvicorn.exe")) {
    Write-Host "Fuggosegek telepitese..." -ForegroundColor Yellow
    python -m venv $venvPath
    & "$venvPath\Scripts\pip.exe" install -r requirements.txt --quiet
    Write-Host "Telepites kesz." -ForegroundColor Green
}

Write-Host ""
Write-Host "Szerver indul: http://localhost:8000" -ForegroundColor Green
Write-Host "Mobilon: http://<PC-IP>:8000" -ForegroundColor Green
Write-Host "Leallitas: Ctrl+C" -ForegroundColor Gray
Write-Host ""

# Get local IP
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127|169)' } | Select-Object -First 1).IPAddress
if ($ip) {
    Write-Host "Helyi halozati cim: http://${ip}:8000" -ForegroundColor Cyan
}
Write-Host ""

& "$venvPath\Scripts\uvicorn.exe" main:app --host 0.0.0.0 --port 8000
