; Instalacija za jednog korisnika, bez administratorskih prava (AppData\Local\Programs)
Unicode true
!include "MUI2.nsh"

!ifndef VERZIJA
  !define VERZIJA "0.0.0"
!endif
!define NAZIV "Praćenje suđenja"
!define EXE "Praćenje suđenja.exe"
!define KLJUC "Software\Microsoft\Windows\CurrentVersion\Uninstall\PracenjeSudjenja"

Name "${NAZIV}"
OutFile "../dist/Pracenje-sudjenja-Setup-${VERZIJA}.exe"
InstallDir "$LOCALAPPDATA\Programs\${NAZIV}"
InstallDirRegKey HKCU "${KLJUC}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText " "

VIProductVersion "${VERZIJA}.0"
VIAddVersionKey /LANG=0 "ProductName" "${NAZIV}"
VIAddVersionKey /LANG=0 "FileDescription" "Instalacija – ${NAZIV}"
VIAddVersionKey /LANG=0 "ProductVersion" "${VERZIJA}"
VIAddVersionKey /LANG=0 "FileVersion" "${VERZIJA}"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${NAZIV} ${VERZIJA}"
!define MUI_WELCOMEPAGE_TEXT "Aplikacija će biti instalirana samo za vaš korisnički nalog i nisu potrebna administratorska prava.$\r$\n$\r$\nAko je aplikacija otvorena, biće zatvorena. Vaši podaci ostaju sačuvani."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Pokreni aplikaciju"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SerbianLatin"

; otvorena aplikacija drzi fajlove zakljucanim
!macro Zatvori
  nsExec::Exec 'taskkill /IM "${EXE}" /T'
  Sleep 1500
  nsExec::Exec 'taskkill /IM "${EXE}" /T /F'
  Sleep 500
!macroend

Section "Instalacija"
  !insertmacro Zatvori
  SetOutPath "$INSTDIR"
  File /r "../dist/portable/${NAZIV}/*.*"
  WriteUninstaller "$INSTDIR\Ukloni.exe"
  CreateShortcut "$DESKTOP\${NAZIV}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$SMPROGRAMS\${NAZIV}.lnk" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${KLJUC}" "DisplayName" "${NAZIV}"
  WriteRegStr HKCU "${KLJUC}" "DisplayVersion" "${VERZIJA}"
  WriteRegStr HKCU "${KLJUC}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${KLJUC}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${KLJUC}" "UninstallString" '"$INSTDIR\Ukloni.exe"'
  WriteRegDWORD HKCU "${KLJUC}" "NoModify" 1
  WriteRegDWORD HKCU "${KLJUC}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  !insertmacro Zatvori
  Delete "$DESKTOP\${NAZIV}.lnk"
  Delete "$SMPROGRAMS\${NAZIV}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${KLJUC}"
SectionEnd
