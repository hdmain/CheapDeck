const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const AutoLaunch = require('auto-launch');

let pythonProcess = null;
let mainWindow = null;
let splashWindow = null;
let splashStage = 0;
let splashTimeout = null;
let tray = null;

let autoLauncher = new AutoLaunch({
  name: 'CheapDeck',
  path: process.execPath,
});

let autostartEnabled = false;

function setSplashText(text) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.body.innerHTML = '<div style="width:100%;text-align:center;">' + ${JSON.stringify(text)} + '</div>';`
    );
  }
}

function startPythonAPI() {
  console.log('Starting Python API...');

  const fs = require('fs');
  let exePath;

  // 1. Sprawdź czy api.exe jest w extraResources (electron-builder kopiuje tam pliki)
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'dist', 'api.exe'))) {
    exePath = path.join(process.resourcesPath, 'dist', 'api.exe');
  }
  // 2. Portable/installer: obok pliku wykonywalnego
  else if (process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'dist', 'api.exe'))) {
    exePath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'dist', 'api.exe');
  }
  // 3. Tryb developerski
  else if (fs.existsSync(path.join(__dirname, 'dist', 'api.exe'))) {
    exePath = path.join(__dirname, 'dist', 'api.exe');
  }

  // Debug ścieżek
  console.log('[DEBUG] process.resourcesPath:', process.resourcesPath);
  console.log('[DEBUG] process.env.PORTABLE_EXECUTABLE_DIR:', process.env.PORTABLE_EXECUTABLE_DIR);
  console.log('[DEBUG] __dirname:', __dirname);
  console.log('[DEBUG] Looking for api.exe at:', exePath);

  if (exePath && fs.existsSync(exePath)) {
    try {
      pythonProcess = spawn(exePath, [], {
        cwd: path.dirname(exePath),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      createLogWindow();

      pythonProcess.stdout.on('data', (data) => {
        console.log(`Python API: ${data.toString().trim()}`);
        appendLog(data.toString());
      });

      pythonProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        console.error(`Python API Error: ${error}`);
        appendLog('[ERROR] ' + error);
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python API process exited with code ${code}`);
        appendLog(`Python API process exited with code ${code}`);
      });

      pythonProcess.on('error', (err) => {
        console.error('[SPAWN ERROR]', err);
        appendLog('[SPAWN ERROR] ' + err.message);
      });

      return;
    } catch (err) {
      console.error('[EXCEPTION SPAWNING EXE]', err);
      appendLog('[EXCEPTION SPAWNING EXE] ' + err.message);
      // Jeśli nie uda się uruchomić EXE, spróbuj python api.py
    }
  } else {
    appendLog('[ERROR] api.exe not found in expected locations!');
  }

  // Jeśli nie ma api.exe, próbuj python api.py
  const pythonCommands = ['python', 'python3', 'py'];
  let currentCommand = 0;

  function tryStartPython() {
    if (currentCommand >= pythonCommands.length) {
      console.error('Could not start Python API - no Python interpreter found');
      return;
    }

    pythonProcess = spawn(pythonCommands[currentCommand], ['api.py'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python API: ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      console.error(`Python API Error: ${error}`);
    });

    pythonProcess.on('error', (error) => {
      console.error(`Failed to start Python with ${pythonCommands[currentCommand]}:`, error.message);
      currentCommand++;
      setTimeout(tryStartPython, 1000);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python API process exited with code ${code}`);
      if (code !== 0 && currentCommand < pythonCommands.length - 1) {
        currentCommand++;
        setTimeout(tryStartPython, 1000);
      }
    });
  }

  tryStartPython();
}

function waitForFlaskReady(url, callback, retries = 40, interval = 250) {
  let attempts = 0;
  function check() {
    http.get(url, res => {
      if (res.statusCode === 200) {
        callback();
      } else {
        retry();
      }
    }).on('error', retry);
  }
  function retry() {
    attempts++;
    if (attempts < retries) {
      setTimeout(check, interval);
    } else {
      callback(); // Spróbuj mimo wszystko po czasie
    }
  }
  check();
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 140,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    transparent: true,
    center: true,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  splashWindow.setMenuBarVisibility(false);
  splashWindow.setResizable(false);

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <body style="background:#222;color:#fff;display:flex;align-items:center;justify-content:center;height:100%;font-family:sans-serif;font-size:1.3em;overflow:hidden;margin:0;">
      <div style="width:100%;text-align:center;overflow:hidden;">Starting app...</div>
      <style>
        html,body { overflow: hidden !important; }
        ::-webkit-scrollbar { width: 0 !important; background: transparent !important; }
      </style>
    </body>
  `));
  splashStage = 0;
  setTimeout(() => {
    splashStage = 1;
    setSplashText("Connecting to CheapDeck...");
  }, 2000);
  splashTimeout = setTimeout(() => {
    splashStage = 2;
    setSplashText("Connecting is taking longer than usual.<br>Please check your CheapDeck device and network.");
  }, 32000);
}

function closeSplashWindow() {
  if (splashWindow) {
    if (splashTimeout) clearTimeout(splashTimeout);
    splashWindow.close();
    splashWindow = null;
  }
}

function isEsp32Available(callback) {
  http.get('http://localhost:22778/api/settings', res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const settings = JSON.parse(data);
        // Sprawdź czy settings są domyślne (czyli ESP32 nie znaleziono)
        const isDefault = (
          settings &&
          settings.timeout === 900 &&
          settings.background === "0a1e46" &&
          settings.active === "b4dcfa" &&
          Array.isArray(settings.colors) &&
          settings.colors.join(",") === ["4682b4", "6495ed", "48d1cc", "5f9ea0", "ff6347", "8a2be2"].join(",")
        );
        callback(!isDefault);
      } catch {
        callback(false);
      }
    });
  }).on('error', () => callback(false));
}

async function updateAutostartState() {
  autostartEnabled = await autoLauncher.isEnabled();
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show', click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.setSkipTaskbar(false);
          }
        }
      },
      { label: autostartEnabled ? 'Disable Autostart' : 'Enable Autostart', type: 'normal', click: async () => {
          if (autostartEnabled) {
            await autoLauncher.disable();
          } else {
            await autoLauncher.enable();
          }
          updateAutostartState();
        }
      },
      { label: 'Exit', click: () => {
          app.isQuiting = true;
          if (mainWindow) mainWindow.destroy();
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
  }
}

function createWindow() {
  createSplashWindow();
  startPythonAPI();

  // Dodaj tray (ikona w zasobniku systemowym)
  if (!tray) {
    tray = new Tray(path.join(__dirname, 'icon.ico')); // Upewnij się, że masz plik icon.ico w katalogu!
    tray.setToolTip('CheapDeck');
    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.setSkipTaskbar(false);
      }
    });
    updateAutostartState();
  }

  waitForFlaskReady('http://localhost:22778/', () => {
    waitForEsp32AndShowMain();
  });
}

function waitForEsp32AndShowMain() {
  isEsp32Available((found) => {
    if (found) {
      closeSplashWindow();
      mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });

      mainWindow.loadURL('http://localhost:22778/');

      // Ukryj do traya zamiast zamykać
      mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
          event.preventDefault();
          mainWindow.hide();
          mainWindow.setSkipTaskbar(true);
        }
        // Jeśli app.isQuiting, pozwól zamknąć okno (i wywołać before-quit)
      });
    } else {
      setTimeout(waitForEsp32AndShowMain, 2000);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', (event) => {
  // Nie zamykaj aplikacji na Windows po zamknięciu wszystkich okien (bo działa w trayu)
  if (process.platform !== 'darwin') {
    event.preventDefault();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  // Zawsze zamknij backend Python
  if (pythonProcess) {
    try {
      pythonProcess.kill('SIGTERM');
    } catch (e) {
      // fallback
      pythonProcess.kill();
    }
  }
});

// Dodaj obsługę okna logów
let logWindow = null;
function createLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) return;
  logWindow = new BrowserWindow({
    width: 600,
    height: 300,
    title: "CheapDeck Backend Logs",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  logWindow.setMenuBarVisibility(false);
  logWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <html>
    <head>
      <title>CheapDeck Backend Logs</title>
      <style>
        body { background: #181818; color: #eee; font-family: monospace; margin: 0; }
        #log { white-space: pre-wrap; padding: 10px; font-size: 13px; height: 100vh; overflow-y: auto; }
      </style>
    </head>
    <body>
      <div id="log"></div>
      <script>
        window.appendLog = function(msg) {
          var log = document.getElementById('log');
          log.textContent += msg + '\\n';
          log.scrollTop = log.scrollHeight;
        }
      </script>
    </body>
    </html>
  `));
}

function appendLog(msg) {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.webContents.executeJavaScript(
      `window.appendLog(${JSON.stringify(msg)});`
    );
  }
}
