' Starts MUNE TOKENS without a console window (the desktop shortcut points here).
' The console is shown only when dependencies must be installed or the app rebuilt,
' so you can follow progress; otherwise the server runs hidden and logs to logs\server.log.
' The server stops by itself when the last MUNE TOKENS window closes.
Option Explicit
Dim sh, fso, root, visible
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root

visible = False
If sh.Run("cmd /c where node >nul 2>nul", 0, True) <> 0 Then
  visible = True
ElseIf sh.Run("cmd /c node scripts\launcher-check.mjs install", 0, True) = 0 Then
  visible = True
ElseIf sh.Run("cmd /c node scripts\launcher-check.mjs build", 0, True) = 0 Then
  visible = True
End If

If visible Then
  sh.Run "cmd /c """"" & root & "\start-mune-tokens.bat""""", 1, False
Else
  If Not fso.FolderExists(root & "\logs") Then fso.CreateFolder(root & "\logs")
  sh.Run "cmd /c """"" & root & "\start-mune-tokens.bat"" > """ & root & "\logs\server.log"" 2>&1""", 0, False
End If
