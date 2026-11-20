!include LogicLib.nsh
!insertmacro WordFind

!define ELECTRON_APP_GUID "5913399b-029d-504c-af52-ca654e517444"
!define ELECTRON_UNINSTALL_ROOT "Software\Microsoft\Windows\CurrentVersion\Uninstall"
!define ELECTRON_UNINSTALL_KEY "${ELECTRON_UNINSTALL_ROOT}\${ELECTRON_APP_GUID}"
!define ELECTRON_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define ELECTRON_UNINSTALLER_SUFFIX "\Uninstall Concord.exe"
!define ELECTRON_UNINSTALLER_SUFFIX_LENGTH 22
!define ELECTRON_MAIN_EXECUTABLE "concord.exe"
!define ELECTRON_UNINSTALLER_COPY "$TEMP\concord-electron-uninstaller.exe"

Var ElectronUninstaller
Var ElectronInstallDir
Var ElectronRunEntryFound
Var ElectronRunEntryAction

Function ConcordReadUninstallerPath
  StrCpy $ElectronUninstaller ""
  ${If} $0 != ""
    ${WordFind} $0 '"' "+2" $ElectronUninstaller
  ${EndIf}
FunctionEnd

Function ConcordFindElectronUninstaller
  ReadRegStr $0 HKCU "${ELECTRON_UNINSTALL_KEY}" "UninstallString"
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
  ${EndIf}
FunctionEnd

Function ConcordLooksLikeElectronInstall
  StrCpy $5 "0"
  ${If} $ElectronInstallDir == ""
    Return
  ${EndIf}
  StrLen $6 "$ElectronInstallDir"
  ${If} $6 <= 3
    Return
  ${EndIf}
  ${If} ${FileExists} "$ElectronInstallDir\${ELECTRON_MAIN_EXECUTABLE}"
    StrCpy $5 "1"
  ${ElseIf} ${FileExists} "$ElectronInstallDir${ELECTRON_UNINSTALLER_SUFFIX}"
    StrCpy $5 "1"
  ${EndIf}
FunctionEnd

Function ConcordRemoveElectronLeftovers
  Call ConcordLooksLikeElectronInstall
  ${If} $5 == "1"
    RMDir /r "$ElectronInstallDir"
  ${Else}
    DetailPrint "Pasta do Electron não confere, mantida: $ElectronInstallDir"
  ${EndIf}
  RMDir /r "$APPDATA\Concord"
  RMDir /r "$APPDATA\concord"
  RMDir /r "$LOCALAPPDATA\concord-updater"
  DeleteRegKey HKCU "Software\${ELECTRON_APP_GUID}"
  DeleteRegKey HKCU "${ELECTRON_UNINSTALL_KEY}"
  StrCpy $ElectronRunEntryAction "delete"
  Call ConcordScanElectronRunEntries
FunctionEnd

Function ConcordReplaceElectronInstall
  Call ConcordFindElectronUninstaller
  ${If} $ElectronUninstaller == ""
    Return
  ${EndIf}
  ${WordFind} $ElectronUninstaller "\" "-1{" $ElectronInstallDir
  Call ConcordKeepAutostartOffUnlessElectronHadIt
  nsExec::Exec 'taskkill /F /IM ${ELECTRON_MAIN_EXECUTABLE}'
  Pop $0
  ${If} ${FileExists} "$APPDATA\Concord\migrate.json"
    CreateDirectory "$APPDATA\${BUNDLEID}"
    CopyFiles /SILENT "$APPDATA\Concord\migrate.json" "$APPDATA\${BUNDLEID}\migrate.json"
  ${EndIf}
  CopyFiles /SILENT "$ElectronUninstaller" "${ELECTRON_UNINSTALLER_COPY}"
  SetOutPath $TEMP
  ExecWait '"${ELECTRON_UNINSTALLER_COPY}" /S /currentuser _?=$ElectronInstallDir' $0
  ${If} $0 = 0
    Call ConcordRemoveElectronLeftovers
  ${Else}
    DetailPrint "O desinstalador do Electron terminou com o código $0"
  ${EndIf}
  Delete "${ELECTRON_UNINSTALLER_COPY}"
  SetOutPath $INSTDIR
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
