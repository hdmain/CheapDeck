@echo off
chcp 65001 >nul
echo installing...
call npm install
call pip install -r requirements.txt

echo.
echo starting Electron + Python application...
call npm start

pause
