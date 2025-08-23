🎮 CheapDeck - DIY Stream Deck Alternative

A complete DIY Stream Deck alternative built with ESP32, featuring touchscreen interface, customizable buttons, and PC integration.

🔍 Overview

CheapDeck consists of:

ESP32 Hardware: Touch-enabled button interface (2x2 or 3x2 layout)

Python API: Background service for key mapping and system integration

Desktop App: Electron-based configuration interface

Web Interface: Browser-based control panel

✨ Features

Touch Interface: Responsive touchscreen with customizable layouts

Key Mapping: Configurable assignments (F-keys, media keys, combinations)

Auto-Discovery: Automatic ESP32 device detection

Color Customization: Individual button colors and themes

Info Mode: System information display (time, CPU, RAM)

Power Management: Deep sleep and configurable timeouts

🔧 Hardware Requirements
ESP32 Setup

ESP32 development board

TFT display with TFT_eSPI support Displaycfg

XPT2046 touch controller

PC Requirements

Python 3.8+, Node.js 16+ (for desktop app)

WiFi connection

🚀 Quick Installation
1. ESP32 Firmware

You can flash the firmware in two ways:

🔹 Option A: Web Flasher (Recommended, No IDE Needed)

Open the CheapDeck Web Flasher
 in Google Chrome or Microsoft Edge

Plug in your ESP32 via USB

Click Connect, select the COM port, then Install

Enter your WiFi SSID & Password when prompted

The ESP32 will reboot and connect to your WiFi automatically

🔹 Option B: Arduino IDE (Manual Flashing)
// Install libraries: TFT_eSPI, XPT2046_Touchscreen, ArduinoJson
// Configure WiFi in arduino.h:
const char* SSID = "Your_WiFi_Name";
const char* PASSWORD = "Your_WiFi_Password";
// Upload to ESP32

2. Python API
cd api
pip install -r requirements.txt
python api.py

3. Desktop App (Optional)
cd desktop-main
start.bat  # Windows
# or: npm install && npm start

📖 Usage

Power ESP32 - Connects to WiFi, displays API URL

Start API - Run python api.py

Configure - Open http://localhost:5000

Use - Touch buttons to trigger actions

⚙️ Configuration

Button Names: Custom labels via web interface

Key Mapping: Assign F-keys, media keys, modifiers

Display: Colors, layout (2x2/3x2), timeouts

Info Mode: System information display settings

🖥️ Launching Apps (AutoHotkey)

CheapDeck can send special keys (like F13, F14, F15) that AutoHotkey (AHK) listens for.
With AHK, you can map those keys to open apps or run scripts.

1. Install AutoHotkey

Download from autohotkey.com
 and install.

2. Create a script

Right-click your Desktop → New → AutoHotkey Script

Name it cheapdeck.ahk

Right-click → Edit Script

3. Add hotkeys

Paste something like this:

; Example: F13 opens Discord
F13::
Run, "C:\Users\YourName\AppData\Local\Discord\Update.exe" --processStart Discord.exe
return

; Example: F14 opens OBS
F14::
Run, "C:\Program Files\obs-studio\bin\64bit\obs64.exe"
return

; Example: F15 opens Spotify
F15::
Run, "C:\Users\YourName\AppData\Roaming\Spotify\Spotify.exe"
return


⚠️ Replace paths with the actual locations of your apps (check via app shortcut → Properties → Target).

4. Run the script

Double-click cheapdeck.ahk to start it.

It will sit in your system tray.

Now when CheapDeck sends F13, Discord opens; F14, OBS opens; etc.

5. Auto-start with Windows

Copy cheapdeck.ahk (or a shortcut) into:
C:\Users\<YourName>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup

This way, it launches automatically on login.

📁 Project Structure
cheapdeck/
├── arduino/           # ESP32 firmware
├── api/              # Python service + web interface
├── desktop-main/     # Electron desktop app
└── README.md

🔧 Troubleshooting

ESP32 not found: Check WiFi credentials and network
Keys not working: Install pynput, verify API running
Touch issues: Adjust calibration values in firmware

Debug Mode
python api.py --debug
python api.py --esp http://192.168.1.100  # Manual IP
