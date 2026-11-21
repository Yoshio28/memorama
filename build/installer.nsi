; Instalador de Memomancer para Windows (se compila con makensis, también desde Linux/macOS).
; Instala para el usuario actual, sin pedir permisos de administrador.
Unicode true
SetCompressor /SOLID lzma

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME "Memomancer"
!define EXENAME "Memomancer.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Memomancer"
!define OLDUNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Memora"

Name "${APPNAME}"
OutFile "..\dist\Memomancer-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
RequestExecutionLevel user
ManifestDPIAware true
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "Instalador de ${APPNAME}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${APPNAME}"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Memomancer ahora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Function .onInit
  ; Cierra Memomancer si está abierta para poder sobrescribir sus archivos.
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  ; Antes se llamaba Memora: ciérrala también si se actualiza desde esa versión.
  nsExec::Exec 'taskkill /IM "Memora.exe" /F'
FunctionEnd

Section "Memomancer" SecMain
  SetOutPath "$INSTDIR"
  ; Una instalación anterior se reemplaza entera (los datos del usuario están en %APPDATA%, no aquí).
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "..\dist\win-unpacked\*.*"

  WriteUninstaller "$INSTDIR\Desinstalar Memomancer.exe"
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"

  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Desinstalar Memomancer.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  ; Si estaba instalada con el nombre antiguo (Memora), quita esa copia y sus accesos directos.
  ; Las tarjetas no se tocan: siguen en %APPDATA%\memora y Memomancer las usa tal cual.
  ReadRegStr $R2 HKCU "${OLDUNINSTKEY}" "InstallLocation"
  ${If} $R2 != ""
  ${AndIf} $R2 != "$INSTDIR"
  ${AndIf} ${FileExists} "$R2\Desinstalar Memora.exe"
    RMDir /r "$R2"
  ${EndIf}
  ${If} $R2 != ""
    Delete "$SMPROGRAMS\Memora.lnk"
    Delete "$DESKTOP\Memora.lnk"
    DeleteRegKey HKCU "${OLDUNINSTKEY}"
    DeleteRegKey HKCU "Software\Memora"
  ${EndIf}

  ; Actualización desde la app: «Memomancer-Setup.exe /S /RELAUNCH» vuelve a abrir Memomancer al terminar.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/RELAUNCH" $R1
  ${IfNot} ${Errors}
    Exec '"$INSTDIR\${EXENAME}"'
  ${EndIf}
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\${APPNAME}"
  ; Las tarjetas (%APPDATA%\memora) se conservan a propósito.
SectionEnd
