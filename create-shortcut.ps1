# Puts a "MUNE TOKENS" shortcut on your desktop. It starts the app without a console window
# (launch-mune-tokens.vbs); closing the MUNE TOKENS window stops it again.
# Run once:  powershell -ExecutionPolicy Bypass -File .\create-shortcut.ps1
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath("Desktop")
$link = Join-Path $desktop "MUNE TOKENS.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$shortcut.Arguments = '"' + (Join-Path $root "launch-mune-tokens.vbs") + '"'
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = (Join-Path $root "public\icons\mune-tokens.ico") + ",0"
$shortcut.Description = "MUNE TOKENS - local design-system builder"
$shortcut.Save()

Write-Host "Shortcut created: $link"
