; GOAL NATION 2026 - Windows setup wizard (NSIS, Modern UI). Built by installer/build_installer.sh.
; Expects: -DAPPVERSION=1.0.0 -DSRCDIR=<unpacked app folder> -DOUTFILE=<setup exe>
Unicode true
ManifestDPIAware true
!define GAME      "GOAL NATION 2026"
!define GAMEEXE   "GOAL NATION 2026.exe"
!define MAKER     "Anye Happiness Ade"
!define MAKERINFO "Anye Happiness Ade, Cameroon - AI Engineer"
!define REGROOT   "Software\GoalNation2026"
!define ARPKEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\GoalNation2026"
!define FWRULE    "GOAL NATION 2026 (online matches)"

Name "${GAME}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\${GAME}"
InstallDirRegKey HKLM "${REGROOT}" "Path"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "${GAME}  -  (c) ${MAKERINFO}"

!include "MUI2.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!insertmacro GetSize

!define MUI_ICON   "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${GAME}"
!define MUI_WELCOMEPAGE_TEXT "11 v 11 stadium football: champions cups, nation cups and leagues, online matches with a friend, recorded commentary and full controller support.$\r$\n$\r$\nCreated by Anye Happiness Ade, Cameroon - AI Engineer.$\r$\n$\r$\nClick Next to install."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${GAMEEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Play ${GAME} now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${APPVERSION}.0"
VIAddVersionKey "ProductName"     "${GAME}"
VIAddVersionKey "CompanyName"     "${MAKER}"
VIAddVersionKey "FileDescription" "${GAME} Setup"
VIAddVersionKey "FileVersion"     "${APPVERSION}"
VIAddVersionKey "LegalCopyright"  "Copyright (c) 2026 ${MAKERINFO}"
VIAddVersionKey "Comments"        "Created by ${MAKERINFO}"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${GAME} needs 64-bit Windows 10 or Windows 11."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Section "${GAME} (required)" SecGame
  SectionIn RO
  nsExec::Exec 'taskkill /F /IM "${GAMEEXE}"'   ; close a running copy so its files can be replaced
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*.*"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${GAME}"
  CreateShortcut "$SMPROGRAMS\${GAME}\${GAME}.lnk" "$INSTDIR\${GAMEEXE}" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\${GAME}\Uninstall ${GAME}.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${REGROOT}" "Path" "$INSTDIR"
  WriteRegStr HKLM "${ARPKEY}" "DisplayName"     "${GAME}"
  WriteRegStr HKLM "${ARPKEY}" "DisplayVersion"  "${APPVERSION}"
  WriteRegStr HKLM "${ARPKEY}" "Publisher"       "${MAKER}"
  WriteRegStr HKLM "${ARPKEY}" "DisplayIcon"     "$INSTDIR\icon.ico"
  WriteRegStr HKLM "${ARPKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${ARPKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${ARPKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${ARPKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${ARPKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Desktop shortcut" SecDesk
  CreateShortcut "$DESKTOP\${GAME}.lnk" "$INSTDIR\${GAMEEXE}" "" "$INSTDIR\icon.ico" 0
SectionEnd

Section "Allow online matches (Windows Firewall, private networks)" SecLan
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${FWRULE}"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="${FWRULE}" dir=in action=allow program="$INSTDIR\${GAMEEXE}" enable=yes profile=private'
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecGame} "The game itself."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesk} "Put a GOAL NATION 2026 icon on the desktop."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecLan}  "Lets a friend on your home Wi-Fi join a room you host. Untick if you only play on this PC."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  SetRegView 64
  nsExec::Exec 'taskkill /F /IM "${GAMEEXE}"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${FWRULE}"'
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${GAME}.lnk"
  RMDir /r "$SMPROGRAMS\${GAME}"
  DeleteRegKey HKLM "${ARPKEY}"
  DeleteRegKey HKLM "${REGROOT}"
  ; saved progress and edit data (in %APPDATA%\goal-nation-2026) are left in place on purpose
SectionEnd
