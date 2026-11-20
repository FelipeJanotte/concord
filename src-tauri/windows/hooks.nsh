!include LogicLib.nsh
!insertmacro WordFind

!define ELECTRON_APP_GUID "5913399b-029d-504c-af52-ca654e517444"
!define ELECTRON_INSTALL_KEY "Software\${ELECTRON_APP_GUID}"
!define ELECTRON_UNINSTALL_ROOT "Software\Microsoft\Windows\CurrentVersion\Uninstall"
!define ELECTRON_UNINSTALL_KEY "${ELECTRON_UNINSTALL_ROOT}\${ELECTRON_APP_GUID}"
!define ELECTRON_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define ELECTRON_UNINSTALLER_SUFFIX "\Uninstall Concord.exe"
!define ELECTRON_UNINSTALLER_SUFFIX_LENGTH 22
!define ELECTRON_MAIN_EXECUTABLE "concord.exe"
!define ELECTRON_APP_ARCHIVE "resources\app.asar"
!define ELECTRON_UNINSTALLER_COPY "$TEMP\concord-electron-uninstaller.exe"
!define BRIDGE_LOG "$TEMP\concord-bridge.log"

Var ElectronUninstaller
Var ElectronInstallDir
Var ElectronInstallConfirmed
Var ElectronRunEntryFound
Var ElectronRunEntryAction

Function ConcordLog
  Exch $R9
  Push $R8
  FileOpen $R8 "${BRIDGE_LOG}" a
  FileSeek $R8 0 END
  FileWrite $R8 "$R9$\r$\n"
  FileClose $R8
  Pop $R8
  Pop $R9
FunctionEnd

!macro ConcordLog message
  Push "${message}"
  Call ConcordLog
!macroend

Function ConcordReadUninstallerPath
  StrCpy $ElectronUninstaller ""
  ${If} $0 == ""
    Return
  ${EndIf}
  StrCpy $1 $0 1
  ${If} $1 == '"'
    StrCpy $2 1
    ${Do}
      StrCpy $3 $0 1 $2
      ${If} $3 == '"'
      ${OrIf} $3 == ""
        ${Break}
      ${EndIf}
      IntOp $2 $2 + 1
    ${Loop}
    IntOp $2 $2 - 1
    StrCpy $ElectronUninstaller $0 $2 1
  ${Else}
    StrCpy $2 0
    ${Do}
      StrCpy $3 $0 2 $2
      ${If} $3 == " /"
      ${OrIf} $3 == ""
        ${Break}
      ${EndIf}
      IntOp $2 $2 + 1
    ${Loop}
    StrCpy $ElectronUninstaller $0 $2
  ${EndIf}
FunctionEnd

Function ConcordFindElectronUninstaller
  StrCpy $ElectronUninstaller ""
  ReadRegStr $4 HKCU "${ELECTRON_INSTALL_KEY}" "InstallLocation"
  !insertmacro ConcordLog "InstallLocation=$4"
  ${If} $4 != ""
    ${If} ${FileExists} "$4${ELECTRON_UNINSTALLER_SUFFIX}"
      StrCpy $ElectronUninstaller "$4${ELECTRON_UNINSTALLER_SUFFIX}"
      Return
    ${EndIf}
  ${EndIf}
  ReadRegStr $0 HKCU "${ELECTRON_UNINSTALL_KEY}" "UninstallString"
  !insertmacro ConcordLog "UninstallString=$0"
  Call ConcordReadUninstallerPath
  ${If} $ElectronUninstaller != ""
    Return
  ${EndIf}
  StrCpy $1 0
  ${Do}
    EnumRegKey $2 HKCU "${ELECTRON_UNINSTALL_ROOT}" $1
    ${If} $2 == ""
      ${Break}
    ${EndIf}
    ReadRegStr $0 HKCU "${ELECTRON_UNINSTALL_ROOT}\$2" "UninstallString"
    Call ConcordReadUninstallerPath
    StrCpy $3 $ElectronUninstaller ${ELECTRON_UNINSTALLER_SUFFIX_LENGTH} -${ELECTRON_UNINSTALLER_SUFFIX_LENGTH}
    ${If} $3 == "${ELECTRON_UNINSTALLER_SUFFIX}"
      !insertmacro ConcordLog "UninstallString da chave $2=$0"
      Return
    ${EndIf}
    IntOp $1 $1 + 1
  ${Loop}
  StrCpy $ElectronUninstaller ""
FunctionEnd

Function ConcordScanElectronRunEntries
  StrCpy $ElectronRunEntryFound "0"
  StrCpy $1 0
  ${Do}
    EnumRegValue $2 HKCU "${ELECTRON_RUN_KEY}" $1
    ${If} $2 == ""
      ${Break}
    ${EndIf}
    ReadRegStr $3 HKCU "${ELECTRON_RUN_KEY}" $2
    ${WordFind} $3 "$ElectronInstallDir\${ELECTRON_MAIN_EXECUTABLE}" "E+1" $4
    ${If} ${Errors}
      IntOp $1 $1 + 1
    ${Else}
      StrCpy $ElectronRunEntryFound "1"
      ${If} $ElectronRunEntryAction == "delete"
        DeleteRegValue HKCU "${ELECTRON_RUN_KEY}" $2
      ${Else}
        IntOp $1 $1 + 1
      ${EndIf}
    ${EndIf}
  ${Loop}
FunctionEnd

Function ConcordKeepAutostartOffUnlessElectronHadIt
  StrCpy $ElectronRunEntryAction "find"
  Call ConcordScanElectronRunEntries
  ${If} $ElectronRunEntryFound == "0"
    CreateDirectory "$APPDATA\${BUNDLEID}"
    FileOpen $0 "$APPDATA\${BUNDLEID}\startup-default-applied" w
    FileClose $0
    ${If} ${FileExists} "$APPDATA\${BUNDLEID}\startup-default-applied"
      !insertmacro ConcordLog "marcador de iniciar com o Windows criado em $APPDATA\${BUNDLEID}"
    ${Else}
      !insertmacro ConcordLog "marcador de iniciar com o Windows nao foi criado em $APPDATA\${BUNDLEID}"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function ConcordDecideElectronInstall
  StrCpy $ElectronInstallConfirmed "0"
  ${If} $ElectronInstallDir == ""
    Return
  ${EndIf}
  StrLen $0 "$ElectronInstallDir"
  ${If} $0 <= 3
    Return
  ${EndIf}
  ${If} $ElectronInstallDir == $INSTDIR
    Return
  ${EndIf}
  ${IfNot} ${FileExists} "$ElectronInstallDir\${ELECTRON_MAIN_EXECUTABLE}"
    Return
  ${EndIf}
  ${IfNot} ${FileExists} "$ElectronInstallDir${ELECTRON_UNINSTALLER_SUFFIX}"
    Return
  ${EndIf}
  ${IfNot} ${FileExists} "$ElectronInstallDir\${ELECTRON_APP_ARCHIVE}"
    Return
  ${EndIf}
  StrCpy $ElectronInstallConfirmed "1"
FunctionEnd

Function ConcordRemoveElectronLeftovers
  ${If} $ElectronInstallConfirmed == "1"
    RMDir /r "$ElectronInstallDir"
    !insertmacro ConcordLog "pasta do Electron apagada: $ElectronInstallDir"
  ${Else}
    DetailPrint "Pasta do Electron não confere, mantida: $ElectronInstallDir"
    !insertmacro ConcordLog "pasta do Electron nao confere, mantida: $ElectronInstallDir"
  ${EndIf}
  RMDir /r "$APPDATA\Concord"
  RMDir /r "$APPDATA\concord"
  !insertmacro ConcordLog "dados do Electron em APPDATA apagados"
  RMDir /r "$LOCALAPPDATA\concord-updater"
  !insertmacro ConcordLog "cache do updater apagado"
  DeleteRegKey HKCU "Software\${ELECTRON_APP_GUID}"
  DeleteRegKey HKCU "${ELECTRON_UNINSTALL_KEY}"
  !insertmacro ConcordLog "chaves de registro do Electron apagadas"
  StrCpy $ElectronRunEntryAction "delete"
  Call ConcordScanElectronRunEntries
  !insertmacro ConcordLog "entradas de Run do Electron apagadas"
FunctionEnd

Function ConcordReplaceElectronInstall
  Call ConcordFindElectronUninstaller
  !insertmacro ConcordLog "inicio: INSTDIR=$INSTDIR"
  ${If} ${Silent}
    !insertmacro ConcordLog "modo silencioso"
  ${EndIf}
  ${If} $ElectronUninstaller == ""
    !insertmacro ConcordLog "sem desinstalador do Electron: instalacao normal"
    Return
  ${EndIf}
  ${WordFind} $ElectronUninstaller "\" "-1{" $ElectronInstallDir
  !insertmacro ConcordLog "desinstalador=$ElectronUninstaller pasta=$ElectronInstallDir"
  Call ConcordDecideElectronInstall
  !insertmacro ConcordLog "pasta do Electron confirmada=$ElectronInstallConfirmed"
  Call ConcordKeepAutostartOffUnlessElectronHadIt
  !insertmacro ConcordLog "entrada de Run do Electron encontrada=$ElectronRunEntryFound"
  nsExec::Exec 'taskkill /F /IM ${ELECTRON_MAIN_EXECUTABLE}'
  Pop $0
  DetailPrint "taskkill terminou com o código $0"
  !insertmacro ConcordLog "taskkill terminou com o codigo $0"
  ${If} ${FileExists} "$APPDATA\Concord\migrate.json"
    CreateDirectory "$APPDATA\${BUNDLEID}"
    CopyFiles /SILENT "$APPDATA\Concord\migrate.json" "$APPDATA\${BUNDLEID}\migrate.json"
    ${If} ${FileExists} "$APPDATA\${BUNDLEID}\migrate.json"
      !insertmacro ConcordLog "migrate.json copiado para $APPDATA\${BUNDLEID}"
    ${Else}
      !insertmacro ConcordLog "migrate.json nao foi copiado para $APPDATA\${BUNDLEID}"
    ${EndIf}
  ${Else}
    !insertmacro ConcordLog "migrate.json nao existe"
  ${EndIf}
  !insertmacro ConcordLog "rodando o desinstalador do Electron"
  CopyFiles /SILENT "$ElectronUninstaller" "${ELECTRON_UNINSTALLER_COPY}"
  SetOutPath $TEMP
  ExecWait '"${ELECTRON_UNINSTALLER_COPY}" /S /currentuser _?=$ElectronInstallDir' $0
  Delete "${ELECTRON_UNINSTALLER_COPY}"
  SetOutPath $INSTDIR
  !insertmacro ConcordLog "desinstalador do Electron terminou com o codigo $0"
  ${If} $0 != 0
    DetailPrint "O desinstalador do Electron terminou com o código $0"
    !insertmacro ConcordLog "abortando: desinstalador do Electron falhou"
    MessageBox MB_OK|MB_ICONSTOP "Não foi possível remover a versão anterior do Concord (código $0). Você continua na versão atual e a atualização será tentada de novo mais tarde." /SD IDOK
    Abort "Falha ao remover a versão anterior do Concord."
  ${EndIf}
  Call ConcordRemoveElectronLeftovers
  !insertmacro ConcordLog "ponte concluida"
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  Call ConcordReplaceElectronInstall
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${GetOptions} $CMDLINE "--force-run" $0
  ${IfNot} ${Errors}
    nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
  ${EndIf}
!macroend
