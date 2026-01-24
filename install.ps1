# 1. Capture original directory and define paths
$originalDir = Get-Location
$nodeRedDir = "$env:USERPROFILE\.node-red"
$tempBuildDir = "$env:TEMP\node-red-twitch-build"

Write-Host "Cleaning temp directory..." -ForegroundColor Cyan
if (Test-Path $tempBuildDir) { Remove-Item -Recurse -Force $tempBuildDir }
New-Item -ItemType Directory -Path $tempBuildDir

# 2. Copy source files (excluding heavy/hidden folders)
Write-Host "Copying source files from $originalDir..." -ForegroundColor Cyan
Copy-Item -Path "$originalDir\*" -Destination $tempBuildDir -Recurse -Exclude "node_modules", ".git", ".vscode"

# 3. Build the project
Set-Location $tempBuildDir
Write-Host "Installing dependencies & Building..." -ForegroundColor Cyan
npm install
npm run build

# Verify build output
if (-not (Test-Path "dist")) {
    Write-Host "Build failed: 'dist' folder was not created. Returning to original directory." -ForegroundColor Red
    Set-Location $originalDir
    return
}

# 4. Install into Node-RED
Write-Host "Installing package into Node-RED..." -ForegroundColor Cyan
Set-Location $nodeRedDir
npm install $tempBuildDir

# 5. Return to original directory
Write-Host "Returning to project directory..." -ForegroundColor Yellow
Set-Location $originalDir

# 6. Start Node-RED
Write-Host "Starting Node-RED..." -ForegroundColor Green
node-red