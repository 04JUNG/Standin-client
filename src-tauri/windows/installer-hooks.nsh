!macro NSIS_HOOK_POSTINSTALL
  ; The executable is replaced at the same path during upgrades. Tell Explorer
  ; to reload its icon instead of retaining the previous shortcut image.
  ; SHCNE_UPDATEITEM, SHCNF_PATHW | SHCNF_FLUSHNOWAIT
  System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x00003005, w "$INSTDIR\${MAINBINARYNAME}.exe", p 0)'
  ; Tauri also registers the app's protocol and DefaultIcon during install.
  ; SHCNE_ASSOCCHANGED, SHCNF_IDLIST | SHCNF_FLUSHNOWAIT
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x00003000, p 0, p 0)'
!macroend
