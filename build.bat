@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==================================================
echo   e-Gov 電子送達 PDF 変換ツール EXE ビルダー
echo ==================================================
echo.

node build.js

echo.
echo ビルド処理が完了しました。Enterキーを押すと終了します...
pause >nul
