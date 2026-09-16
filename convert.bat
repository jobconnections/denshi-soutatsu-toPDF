@echo off
chcp 65001 >nul
cd /d "%~dp0"

:: 1. 同一フォルダに EXE がある場合は EXE を実行
if exist "%~dp0denshi-soutatsu-pdf.exe" (
    "%~dp0denshi-soutatsu-pdf.exe" %*
    exit /b %errorlevel%
)

:: 2. EXE がない場合、Node.js と index.js で実行可能か確認
where node >nul 2>nul
if %errorlevel% equ 0 (
    if exist "%~dp0index.js" (
        node "%~dp0index.js" %*
        exit /b %errorlevel%
    )
)

:: 3. どちらも利用できない場合のエラー表示
echo.
echo ======================================================================
echo  【エラー】実行環境が見つかりません
echo ======================================================================
echo  このバッチファイル（convert.bat）単体では動作しません。
echo.
echo  以下のいずれかの方法でご準備ください：
echo.
echo  【方法1: 推奨（Node.js 不要）】
echo    GitHub Releases から「denshi-soutatsu-pdf.exe」をダウンロードし、
echo    このバッチファイルと同じフォルダに配置してください。
echo    URL: https://github.com/jobconnections/denshi-soutatsu-toPDF/releases
echo.
echo  【方法2: 開発者向け】
echo    PC に Node.js をインストールし、「npm install」を実行した上でご利用ください。
echo    （同一フォルダに index.js が必要です）
echo ======================================================================
echo.
pause
exit /b 1
