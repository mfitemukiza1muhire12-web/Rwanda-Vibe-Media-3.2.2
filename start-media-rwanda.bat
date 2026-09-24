@echo off
cd /d "%~dp0"
echo Installing/checking packages...
npm.cmd install
if errorlevel 1 (
  echo.
  echo INSTALL FAILED. Make sure Node.js 22.5+ is installed.
  pause
  exit /b 1
)
echo.
echo Starting MEDIA RWANDA...
npm.cmd start
pause
