param(
    [Parameter(Mandatory = $true)][string]$NewInstaller,
    [Parameter(Mandatory = $true)][string]$AppId,
    [Parameter(Mandatory = $true)][bool]$AutostartWasOn,
    [int]$InstallerTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$UninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$FakeRunValue = 'concord-cutover-fake'
$BridgeLog = Join-Path $env:TEMP 'concord-bridge.log'
$FakeMigration = '{"version":1,"exportedAt":"2026-01-01T00:00:00.000Z","entries":{"concord:theme":"{\"name\":\"cutover\"}"}}'
$ElectronUninstallerName = 'Uninstall Concord.exe'
$DecoyKeyName = 'ConcordCutoverDecoy'

$failures = [System.Collections.Generic.List[string]]::new()

function Assert-That {
    param([bool]$Condition, [string]$Message)
    if ($Condition) {
        Write-Host "ok: $Message"
    }
    else {
        $failures.Add($Message)
        Write-Host "FALHA: $Message"
    }
}

function Invoke-Native {
    param([string]$Command, [string[]]$Arguments)
    $output = & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command $($Arguments -join ' ') terminou com o código $LASTEXITCODE"
    }
    return $output
}

function Find-ElectronRelease {
    $releases = Invoke-Native gh @('release', 'list', '--limit', '50', '--json', 'tagName,isDraft') | ConvertFrom-Json
    foreach ($release in $releases | Where-Object { -not $_.isDraft }) {
        $assets = (Invoke-Native gh @('release', 'view', $release.tagName, '--json', 'assets') | ConvertFrom-Json).assets.name
        $hasMetadata = $assets -contains 'latest.yml'
        $hasBlockmap = @($assets | Where-Object { $_ -like '*-setup.exe.blockmap' }).Count -gt 0
        if ($hasMetadata -and $hasBlockmap) {
            return $release.tagName
        }
    }
    throw 'Nenhuma release com instalador do Electron (latest.yml e .blockmap) encontrada.'
}

function Find-ElectronUninstallKeys {
    Get-ChildItem $UninstallRoot | Where-Object {
        $uninstallString = $_.GetValue('UninstallString')
        $_.PSChildName -ne $DecoyKeyName -and $uninstallString -and $uninstallString -like "*$ElectronUninstallerName*"
    }
}

function Write-BridgeLog {
    Write-Host '--- concord-bridge.log ---'
    if (Test-Path $BridgeLog) {
        Get-Content $BridgeLog | ForEach-Object { Write-Host $_ }
    }
    else {
        Write-Host "(ausente: $BridgeLog)"
    }
    Write-Host '--- fim do concord-bridge.log ---'
}

function Write-InstallerProcesses {
    Write-Host '--- processos relacionados ---'
    Get-CimInstance Win32_Process |
        Where-Object { $_.Name -match 'setup|install|uninstall|concord|^Au_|msiexec' } |
        Select-Object ProcessId, ParentProcessId, Name, CommandLine |
        Format-List |
        Out-String -Width 400 |
        Write-Host
    Write-Host '--- fim dos processos ---'
}

function Wait-Installer {
    param([System.Diagnostics.Process]$Installer)
    $Installer.Handle | Out-Null
    $finished = $Installer.WaitForExit($InstallerTimeoutSeconds * 1000)
    if (-not $finished) {
        Write-Host "O instalador não terminou em $InstallerTimeoutSeconds s."
        Write-BridgeLog
        Write-InstallerProcesses
        & taskkill /T /F /PID $Installer.Id | Out-Host
    }
    return $finished
}

$electronGuid = (Invoke-Native node @('.github/scripts/electron-guid.mjs', $AppId)) -join ''
$electronAppKey = "HKCU:\Software\$electronGuid"
$electronUninstallKey = "$UninstallRoot\$electronGuid"

$tag = Find-ElectronRelease
Write-Host "Instalando o Electron da release $tag"
$download = Join-Path $env:RUNNER_TEMP 'electron-release'
New-Item -ItemType Directory -Force -Path $download | Out-Null
Invoke-Native gh @('release', 'download', $tag, '--pattern', '*-setup.exe', '--dir', $download) | Out-Null
$electronSetup = (Get-ChildItem $download -Filter '*-setup.exe' | Select-Object -First 1).FullName

$electronInstall = Start-Process -FilePath $electronSetup -ArgumentList '/S', '/currentuser' -PassThru
if (-not $electronInstall.WaitForExit($InstallerTimeoutSeconds * 1000)) {
    $electronInstall.Kill()
    throw 'O instalador do Electron não terminou no prazo.'
}

$oldInstallDir = (Get-ItemProperty -Path $electronAppKey).InstallLocation
Assert-That (Test-Path $electronUninstallKey) 'o Electron ficou instalado antes do teste'
Assert-That (Test-Path (Join-Path $oldInstallDir $ElectronUninstallerName)) 'o desinstalador do Electron existe antes do teste'

Write-Host '--- chave de desinstalação do Electron (valores crus) ---'
$electronUninstallValues = Get-ItemProperty -Path $electronUninstallKey
foreach ($name in 'DisplayName', 'UninstallString', 'QuietUninstallString', 'InstallLocation') {
    $value = $electronUninstallValues.PSObject.Properties[$name]
    Write-Host "$name=[$(if ($value) { $value.Value } else { '(ausente)' })]"
}
Write-Host "InstallLocation da chave Software=[$oldInstallDir]"
Write-Host '--- fim ---'

$electronData = Join-Path $env:APPDATA 'Concord'
$updaterCache = Join-Path $env:LOCALAPPDATA 'concord-updater'
New-Item -ItemType Directory -Force -Path $electronData, (Join-Path $updaterCache 'pending') | Out-Null
Set-Content -Path (Join-Path $electronData 'migrate.json') -Value $FakeMigration -NoNewline
Set-Content -Path (Join-Path $updaterCache 'pending\update.bin') -Value 'x'
if ($AutostartWasOn) {
    Set-ItemProperty -Path $RunKey -Name $FakeRunValue -Value "`"$oldInstallDir\concord.exe`""
}

$decoyDir = Join-Path $env:RUNNER_TEMP 'decoy-concord'
New-Item -ItemType Directory -Force -Path $decoyDir | Out-Null
Set-Content -Path (Join-Path $decoyDir 'concord.exe') -Value 'x'
$decoyKey = "$UninstallRoot\$DecoyKeyName"
New-Item -Path $decoyKey -Force | Out-Null
Set-ItemProperty -Path $decoyKey -Name 'UninstallString' -Value "`"$decoyDir\$ElectronUninstallerName`" /currentuser"

Remove-Item -Path $BridgeLog -Force -ErrorAction SilentlyContinue
Write-Host "Rodando o instalador novo com os argumentos do electron-updater, sem --force-run: --updated /S /D=$oldInstallDir"
$newInstall = Start-Process -FilePath $NewInstaller -ArgumentList '--updated', '/S', "/D=$oldInstallDir" -PassThru
$finished = Wait-Installer $newInstall
Write-BridgeLog
Assert-That $finished 'o instalador novo terminou no prazo'

$autostartMarker = Join-Path $env:APPDATA "$AppId\startup-default-applied"
Assert-That ((Test-Path $autostartMarker) -eq (-not $AutostartWasOn)) "marcador de iniciar com o Windows presente só quando o Electron estava com ele desligado (ligado antes: $AutostartWasOn)"

$migrationCopy = Join-Path $env:APPDATA "$AppId\migrate.json"
Assert-That ((Test-Path $migrationCopy) -and ((Get-Content $migrationCopy -Raw) -eq $FakeMigration)) 'migrate.json copiado para a pasta de dados do Tauri'
Assert-That ($finished -and $newInstall.ExitCode -eq 0) 'o instalador novo saiu com código 0'
Assert-That (-not (Test-Path $electronUninstallKey)) 'chave de desinstalação do Electron removida'
Assert-That (-not (Test-Path $electronAppKey)) 'chave Software do Electron removida'
Assert-That (@(Find-ElectronUninstallKeys).Count -eq 0) 'nenhuma chave de desinstalação aponta para o desinstalador do Electron'
Assert-That (-not (Test-Path $electronData)) 'pasta APPDATA\Concord removida'
Assert-That (-not (Test-Path $updaterCache)) 'pasta LOCALAPPDATA\concord-updater removida'
Assert-That ($null -eq (Get-ItemProperty -Path $RunKey -Name $FakeRunValue -ErrorAction SilentlyContinue)) 'entrada antiga de iniciar com o Windows removida'
Assert-That (Test-Path (Join-Path $oldInstallDir 'concord.exe')) 'concord.exe do Tauri na pasta antiga'
Assert-That (-not (Test-Path (Join-Path $oldInstallDir $ElectronUninstallerName))) 'desinstalador do Electron removido da pasta'
Assert-That (-not (Test-Path (Join-Path $oldInstallDir 'resources\app.asar'))) 'app.asar do Electron removido da pasta'
$tauriUninstall = Get-ItemProperty -Path "$UninstallRoot\Concord" -ErrorAction SilentlyContinue
Assert-That ($null -ne $tauriUninstall -and $tauriUninstall.UninstallString -like "*$oldInstallDir*") 'entrada de desinstalação do Tauri na pasta antiga'

Assert-That (Test-Path (Join-Path $decoyDir 'concord.exe')) 'pasta isca sem app.asar (só concord.exe) continua intacta'
Assert-That (Test-Path $decoyKey) 'entrada de desinstalação isca continua no registro'
Remove-Item -Path $decoyKey -Recurse -Force
Remove-Item -Path $decoyDir -Recurse -Force

Write-Host "Rodando o instalador novo com --force-run: --updated /S --force-run /D=$oldInstallDir"
$relaunchInstall = Start-Process -FilePath $NewInstaller -ArgumentList '--updated', '/S', '--force-run', "/D=$oldInstallDir" -PassThru
$relaunchFinished = Wait-Installer $relaunchInstall
Assert-That $relaunchFinished 'o instalador com --force-run terminou no prazo'
$relaunched = $null
for ($attempt = 0; $attempt -lt 30 -and -not $relaunched; $attempt++) {
    $relaunched = Get-Process -Name concord -ErrorAction SilentlyContinue
    if (-not $relaunched) {
        Start-Sleep -Seconds 1
    }
}
Assert-That ($null -ne $relaunched) '--force-run abre o concord.exe'

Get-Process -Name concord -ErrorAction SilentlyContinue | Stop-Process -Force

if ($failures.Count -gt 0) {
    Write-Host "A troca Electron para Tauri falhou em $($failures.Count) verificação(ões):"
    $failures | ForEach-Object { Write-Host " - $_" }
    exit 1
}
Write-Host 'Troca Electron para Tauri verificada.'
