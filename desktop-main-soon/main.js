const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let pythonProcess = null;
let mainWindow = null;

function startPythonAPI() {
  console.log('Starting Python API...');
  
  // Try different Python commands
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  
  // Start Python API after window is ready
  setTimeout(startPythonAPI, 2000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Kill Python process when closing
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Cleanup on app quit
app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
  }
});
