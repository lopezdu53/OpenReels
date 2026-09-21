Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
pyw = "pythonw"
sh.Run """" & pyw & """ """ & dir & "\app.py""", 0, False
