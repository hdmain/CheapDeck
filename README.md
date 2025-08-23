# 🎮 CheapDeck - DIY Stream Deck Alternative

A complete DIY Stream Deck alternative built with ESP32, featuring touchscreen interface, customizable buttons, and PC integration.

## 🔍 Overview

CheapDeck consists of:
- **ESP32 Hardware**: Touch-enabled button interface (2x2 or 3x2 layout)
- **Python API**: Background service for key mapping and system integration
- **Desktop App**: Electron-based configuration interface
- **Web Interface**: Browser-based control panel

## ✨ Features

- **Touch Interface**: Responsive touchscreen with customizable layouts
- **Key Mapping**: Configurable assignments (F-keys, media keys, combinations)
- **Auto-Discovery**: Automatic ESP32 device detection
- **Color Customization**: Individual button colors and themes
- **Info Mode**: System information display (time, CPU, RAM)
- **Power Management**: Deep sleep and configurable timeouts

## 🔧 Hardware Requirements

### ESP32 Setup
- ESP32 development board
- TFT display with TFT_eSPI support
- XPT2046 touch controller

### PC Requirements
- Python 3.8+, Node.js 16+ (for desktop app)
- WiFi connection

## 🚀 Quick Installation

### 1. ESP32 Firmware
```cpp
// Install libraries: TFT_eSPI, XPT2046_Touchscreen, ArduinoJson
// Configure WiFi in arduino.h:
const char* SSID = "Your_WiFi_Name";
const char* PASSWORD = "Your_WiFi_Password";
// Upload to ESP32
```

### 2. Python API
```bash
cd api
pip install -r requirements.txt
python api.py
```

### 3. Desktop App (Optional)
```bash
cd desktop-main
start.bat  # Windows
# or: npm install && npm start
```

## 📖 Usage

1. **Power ESP32** - Connects to WiFi, displays API URL
2. **Start API** - Run `python api.py` 
3. **Configure** - Open `http://localhost:5000`
4. **Use** - Touch buttons to trigger actions

## ⚙️ Configuration

- **Button Names**: Custom labels via web interface
- **Key Mapping**: Assign F-keys, media keys, modifiers
- **Display**: Colors, layout (2x2/3x2), timeouts
- **Info Mode**: System information display settings

## 📁 Project Structure

```
cheapdeck/
├── arduino/           # ESP32 firmware
├── api/              # Python service + web interface
├── desktop-main/     # Electron desktop app
└── README.md
```

## 🔧 Troubleshooting

**ESP32 not found**: Check WiFi credentials and network
**Keys not working**: Install pynput, verify API running
**Touch issues**: Adjust calibration values in firmware

### Debug Mode
```bash
python api.py --debug
python api.py --esp http://192.168.1.100  # Manual IP
```

---

**Enjoy your CheapDeck! 🎮✨**
