@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "%~dp0denshi-soutatsu-pdf.exe" (
    "%~dp0denshi-soutatsu-pdf.exe" %*
) else (
    node "%~dp0index.js" %*
)
