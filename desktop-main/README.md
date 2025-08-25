# 🚀 Electron Python Template

Application combining Electron (frontend) with Python Flask API (backend).

## 📋 Requirements

- 🟢 Node.js (version 16 or newer)
- 🐍 Python 3.8+ with pip
- 📦 npm (installed with Node.js)

## ⚡ Quick Start

### 🪟 Windows
```bash
start.bat
```

### 🛠️ Manual Launch
1. Install dependencies:
```bash
npm run setup
```

2. Run the application:
```bash
npm start
```

## 🧩 How it Works

1. Electron automatically starts Python API server on port 5000
2. Frontend communicates with API through HTTP requests
3. When Electron closes, Python process is automatically terminated

## 🗂️ Project Structure

```
├── 📖 README.md
├── 🐍 api.py
├── 🌐 index.html
├── 📄 main.js
├── 📄 package-lock.json
├── 📄 package.json
├── 📄 renderer.js
├── 📄 requirements.txt
├── 🐚 start.bat
└── 🎨 styles.css
```

## 🧪 Testing

After launch, click the "Test Python API" button to check communication between Electron and Python.
