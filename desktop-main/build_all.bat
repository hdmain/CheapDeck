@echo off
chcp 65001 >nul

echo [1/4] Installing Python dependencies...
pip install -r requirements.txt

echo [2/4] Building Python backend (api.exe)...
if exist dist\api.exe del dist\api.exe
pyinstaller --onefile --noconsole --add-data "templates;templates" --add-data "static;static" api.py

if not exist dist\api.exe (
    echo ERROR: api.exe was not created!
    pause
    exit /b 1
)

echo [3/4] Installing Node/Electron dependencies...
npm install

echo [4/4] Building Electron installer...
npm run dist

echo.
echo Build finished! Check the dist\ folder for your installer.
pause
