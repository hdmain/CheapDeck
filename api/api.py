import time
import requests
import argparse
import logging
import json
import os
import threading
import psutil
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, render_template, jsonify, send_from_directory

try:
    from pynput.keyboard import Controller, Key
except ImportError:
    print("Install 'pynput' library: pip install pynput")
    raise

# --- CONFIG ---
CONFIG_FILE = "esp32_config.json"
KEY_MAP = {
    "1": "f13",
    "2": "f15",
    "3": "media_play_pause",
    "4": "media_next",
    "5": "f17",
    "6": "f18"
}
BUTTON_NAMES = {"1": "Button 1", "2": "Button 2", "3": "Button 3", "4": "Button 4", "5": "Button 5", "6": "Button 6"}

kb = Controller()

# --- HTML template ---
HTML_PAGE = """
<!doctype html>
<html>
<head>
    <title>ESP32 Control Panel</title>
    <style>
        body { font-family: sans-serif; margin: 20px; }
        .section { margin-bottom: 30px; padding: 15px; border: 1px solid #ccc; }
        label { display:block; margin-top:10px; }
        input[type=text], input[type=number], select { width:200px; padding:5px; }
        input[type=color] { width:50px; height:30px; }
        button { margin-top:10px; padding:10px 20px; font-size:16px; }
        .color-input { display: flex; align-items: center; gap: 10px; }
        .button-config { display: none; }
        .button-config.active { display: block; }
        .color-section { display: none; }
        .color-section.show { display: block; }
    </style>
</head>
<body>
<h1>ESP32 Control Panel</h1>

<div class="section">
    <h2>Button Names</h2>
    <div id="buttonConfigContainer">
        <!-- Button configuration will be dynamically generated -->
    </div>
    <button onclick="updateButtonNames()">Update Button Names</button>
</div>

<div class="section">
    <h2>Display Settings</h2>
    <form id="settingsForm">
        <label>Layout: 
            <select id="layout" onchange="updateButtonInputs(); updateColorInputs()">
                <option value="0">2x2 (4 buttons)</option>
                <option value="1">3x2 (6 buttons)</option>
            </select>
        </label>
        <label>Deep Sleep Timeout (seconds): 
            <input type="number" name="timeout" id="timeout" min="10" max="3600" value="900">
        </label>
        <div class="color-input">
            <label>Background Color:</label>
            <input type="color" name="background" id="background" value="#0a1e46">
        </div>
        <div class="color-input">
            <label>Active Button Color:</label>
            <input type="color" name="active" id="active" value="#b4dcfa">
        </div>
        
        <h3>Button Colors</h3>
        <div id="colorInputsContainer">
            <!-- Color inputs will be dynamically generated -->
        </div>
        
        <button type="submit">Update Settings</button>
    </form>
</div>

<script>
let currentButtonNames = {};

function updateButtonInputs() {
    const layout = parseInt(document.getElementById("layout").value);
    const buttonCount = layout === 0 ? 4 : 6;
    const container = document.getElementById("buttonConfigContainer");
    
    container.innerHTML = '';
    for (let i = 1; i <= buttonCount; i++) {
        const label = document.createElement('label');
        label.innerHTML = `Button ${i}: <input type="text" id="button${i}" value="${currentButtonNames[i] || 'Button ' + i}">`;
        container.appendChild(label);
    }
}

function updateColorInputs() {
    const layout = parseInt(document.getElementById("layout").value);
    const buttonCount = layout === 0 ? 4 : 6;
    const container = document.getElementById("colorInputsContainer");
    
    container.innerHTML = '';
    for (let i = 0; i < buttonCount; i++) {
        const div = document.createElement('div');
        div.className = 'color-input';
        div.innerHTML = `
            <label>Button ${i+1} Color:</label>
            <input type="color" name="color${i}" id="color${i}" value="#4682b4">
        `;
        container.appendChild(div);
    }
}

function updateButtonNames() {
    const layout = parseInt(document.getElementById("layout").value);
    const buttonCount = layout === 0 ? 4 : 6;
    const data = {};
    
    for (let i = 1; i <= buttonCount; i++) {
        const input = document.getElementById(`button${i}`);
        if (input) {
            data[i] = input.value;
            currentButtonNames[i] = input.value;
        }
    }
    
    fetch("/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(j => {
        console.log("Config sent:", j);
        alert("Button names updated!");
    })
    .catch(err => console.error("Error sending config:", err));
}

// Load current settings on page load
fetch("/api/settings")
    .then(r => r.json())
    .then(data => {
        document.getElementById("timeout").value = data.timeout;
        document.getElementById("background").value = "#" + data.background.padStart(6, '0');
        document.getElementById("active").value = "#" + data.active.padStart(6, '0');
        document.getElementById("layout").value = data.layout || 0;
        
        // Update color inputs based on layout
        updateColorInputs();
        
        // Set color values
        for (let i = 0; i < data.colors.length; i++) {
            const colorInput = document.getElementById("color" + i);
            if (colorInput) {
                colorInput.value = "#" + data.colors[i].padStart(6, '0');
            }
        }
        
        updateButtonInputs();
    })
    .catch(err => {
        console.error("Error loading settings:", err);
        updateButtonInputs();
        updateColorInputs();
    });

document.getElementById("settingsForm").onsubmit = function(e) {
    e.preventDefault();
    const layout = parseInt(document.getElementById("layout").value);
    const buttonCount = layout === 0 ? 4 : 6;
    
    const colors = [];
    for (let i = 0; i < 6; i++) { // always send 6 colors
        const colorInput = document.getElementById("color" + i);
        if (colorInput) {
            colors.push(colorInput.value.replace("#", ""));
        } else {
            // If no input, use default color
            const defaultColors = ["4682b4", "6495ed", "48d1cc", "5f9ea0", "ff6347", "8a2be2"];
            colors.push(defaultColors[i]);
        }
    }
    
    let data = {
        timeout: parseInt(document.getElementById("timeout").value),
        background: document.getElementById("background").value.replace("#", ""),
        active: document.getElementById("active").value.replace("#", ""),
        layout: layout,
        colors: colors
    };
    
    fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(r => r.text())
    .then(text => {
        console.log("Settings sent:", text);
        alert("Settings updated!");
        updateButtonInputs();
        updateColorInputs();
    })
    .catch(err => console.error("Error sending settings:", err));
};

// Initialize inputs on page load
updateButtonInputs();
updateColorInputs();
</script>
</body>
</html>
"""

# --- Helpers ---
def parse_bool_like(val):
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(val)
    if isinstance(val, str):
        return val.lower() in ('1','true','yes','on')
    return False

def send_key(key_name, hold_seconds=0.0):
    try:
        # Handle key combinations (e.g., "ctrl+win+f8")
        if '+' in key_name:
            keys = key_name.split('+')
            modifier_keys = []
            main_key = None
            
            for key in keys:
                key = key.strip().lower()
                if key in ['ctrl', 'ctrl_l']:
                    modifier_keys.append(Key.ctrl_l)
                elif key == 'ctrl_r':
                    modifier_keys.append(Key.ctrl_r)
                elif key in ['alt', 'alt_l']:
                    modifier_keys.append(Key.alt_l)
                elif key == 'alt_r':
                    modifier_keys.append(Key.alt_r)
                elif key in ['shift', 'shift_l']:
                    modifier_keys.append(Key.shift)
                elif key == 'shift_r':
                    modifier_keys.append(Key.shift_r)
                elif key in ['win', 'cmd', 'super']:
                    modifier_keys.append(Key.cmd)
                else:
                    # This is the main key
                    main_key = getattr(Key, key, key)
            
            # Press modifiers, then main key, then release in reverse order
            for mod in modifier_keys:
                kb.press(mod)
            
            if main_key:
                if hold_seconds > 0:
                    kb.press(main_key)
                    time.sleep(hold_seconds)
                    kb.release(main_key)
                else:
                    kb.press(main_key)
                    kb.release(main_key)
            
            # Release modifiers in reverse order
            for mod in reversed(modifier_keys):
                kb.release(mod)
        else:
            # Single key handling
            key = getattr(Key, key_name, key_name)
            if hold_seconds > 0:
                kb.press(key)
                time.sleep(hold_seconds)
                kb.release(key)
            else:
                kb.press(key)
                kb.release(key)
        
        logging.info(f"Sent key: {key_name}")
    except Exception as e:
        logging.warning(f"Failed to send key {key_name}: {e}")

def poll_state(url, interval=0.2, timeout=0.8, hold=0.0, trigger_on_first=False, debug=False):
    logging.basicConfig(level=logging.DEBUG if debug else logging.INFO,
                        format='[%(asctime)s] %(levelname)s: %(message)s', datefmt='%H:%M:%S')
    last_state = None
    connection_errors = 0
    
    while True:
        start = time.time()
        current_state = None
        
        # Check if ESP32_URL still exists
        if not ESP32_URL:
            time.sleep(5)  # Wait 5 seconds if no URL
            continue
            
        try:
            r = requests.get(f"{ESP32_URL}/state", timeout=timeout)
            r.raise_for_status()
            data = r.json() if r.text else {}
            if isinstance(data, dict):
                current_state = {k: parse_bool_like(data.get(k, False)) for k in ("1","2","3","4","5","6")}
                connection_errors = 0  # Reset error counter on successful connection
        except requests.RequestException as e:
            connection_errors += 1
            if connection_errors <= 3:  # Log only first errors
                logging.warning("HTTP error: %s", e)
        except ValueError:
            logging.warning("Invalid JSON from %s", ESP32_URL)

        if current_state:
            logging.debug("Polled state: %s", current_state)
            if last_state is None and trigger_on_first:
                for k, val in current_state.items():
                    if val:
                        keyname = KEY_MAP.get(k)
                        if keyname:
                            send_key(keyname, hold)
            elif last_state:
                for k in ("1","2","3","4","5","6"):
                    if last_state.get(k) != current_state.get(k):
                        keyname = KEY_MAP.get(k)
                        if keyname:
                            send_key(keyname, hold)
            last_state = current_state

        elapsed = time.time() - start
        to_sleep = max(0, interval - elapsed)
        time.sleep(to_sleep)

# --- Config management ---
def load_config():
    """Loads configuration from JSON file"""
    global KEY_MAP
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
                # Load KEY_MAP if exists
                if 'key_map' in config:
                    KEY_MAP.update(config['key_map'])
                return config.get('esp32_url'), config.get('button_names', BUTTON_NAMES)
        except Exception as e:
            logging.warning(f"Error loading configuration: {e}")
    return None, BUTTON_NAMES

def save_config(esp32_url, button_names=None):
    """Saves configuration to JSON file"""
    config = {
        'esp32_url': esp32_url,
        'button_names': button_names or BUTTON_NAMES,
        'key_map': KEY_MAP
    }
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        logging.info(f"Configuration saved: {esp32_url}")
    except Exception as e:
        logging.warning(f"Error saving configuration: {e}")

def check_esp32_device(ip):
    """Checks if ESP32 device exists at given IP"""
    try:
        url = f"http://{ip}"
        response = requests.get(url, timeout=2)
        if response.status_code == 200 and response.text.strip() == "cheap deck api":
            return ip
    except:
        pass
    return None

def scan_network():
    """Scans network for ESP32 device"""
    logging.info("Starting network scan...")
    
    # List of IPs to check
    ips_to_check = []
    for i in range(2, 255):
        ips_to_check.append(f"192.168.0.{i}")
    
    # Multithreaded scanning
    with ThreadPoolExecutor(max_workers=50) as executor:
        future_to_ip = {executor.submit(check_esp32_device, ip): ip for ip in ips_to_check}
        
        for future in as_completed(future_to_ip):
            result = future.result()
            if result:
                esp32_url = f"http://{result}"
                logging.info(f"Found ESP32 device: {esp32_url}")
                save_config(esp32_url)
                return esp32_url
    
    logging.warning("ESP32 device not found in network")
    return None

def verify_esp32_connection(url):
    """Checks if connection to ESP32 is possible"""
    try:
        response = requests.get(f"{url}/state", timeout=2)
        return response.status_code == 200
    except:
        return False

def auto_reconnect_esp32():
    """Automatically tries to reconnect to ESP32 when connection is lost"""
    global ESP32_URL
    last_check = time.time()
    consecutive_failures = 0
    
    while True:
        time.sleep(30)  # Check every 30 seconds
        
        if ESP32_URL:
            try:
                # Try to connect to ESP32
                response = requests.get(f"{ESP32_URL}/state", timeout=3)
                if response.status_code == 200:
                    consecutive_failures = 0
                    continue
                else:
                    consecutive_failures += 1
            except:
                consecutive_failures += 1
            
            # If 4 consecutive attempts failed (2 minutes)
            if consecutive_failures >= 4:
                logging.warning(f"Lost connection to ESP32 ({ESP32_URL}). Starting rescan...")
                ESP32_URL = None
                consecutive_failures = 0
                
                # Try to find ESP32 again
                new_url = scan_network()
                if new_url:
                    ESP32_URL = new_url
                    logging.info(f"Reconnected to ESP32: {ESP32_URL}")
                    save_config(ESP32_URL, BUTTON_NAMES)
                else:
                    logging.warning("Failed to find ESP32 again. Next attempt in 2 minutes...")
        else:
            # If ESP32_URL is None, try to find device
            current_time = time.time()
            if current_time - last_check >= 120:  # Every 2 minutes
                logging.info("Attempting automatic ESP32 detection...")
                new_url = scan_network()
                if new_url:
                    ESP32_URL = new_url
                    logging.info(f"Automatically detected ESP32: {ESP32_URL}")
                    save_config(ESP32_URL, BUTTON_NAMES)
                last_check = current_time

def send_system_info_to_esp32():
    """Sends system information to ESP32 periodically"""
    last_info = {}
    
    while True:
        if ESP32_URL:
            try:
                current_time = datetime.now().strftime("%H:%M:%S")
                current_date = datetime.now().strftime("%Y-%m-%d")
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                ram_percent = memory.percent
                
                system_info = {
                    "time": current_time,
                    "date": current_date,
                    "cpu": round(cpu_percent, 1),
                    "ram": round(ram_percent, 1)
                }
                
                # Send only if data changed significantly
                should_send = False
                if not last_info:
                    should_send = True
                else:
                    if (last_info.get("time") != system_info["time"] or
                        last_info.get("date") != system_info["date"] or
                        abs(last_info.get("cpu", 0) - system_info["cpu"]) > 0.5 or
                        abs(last_info.get("ram", 0) - system_info["ram"]) > 0.5):
                        should_send = True
                
                if should_send:
                    response = requests.post(f"{ESP32_URL}/system-info", 
                                           headers={"Content-Type": "application/json"},
                                           json=system_info, 
                                           timeout=2.0)
                    
                    if response.status_code == 200:
                        logging.debug(f"System info sent: {system_info}")
                        last_info = system_info.copy()
                    else:
                        logging.warning(f"Failed to send system info: {response.status_code}")
                        
            except Exception as e:
                logging.debug(f"Error sending system info: {e}")
        
        time.sleep(2)

# --- Flask App ---
app = Flask(__name__, template_folder='templates', static_folder='static')
ESP32_URL = None

@app.route("/")
def index():
    return render_template('index.html')

@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory('static', filename)

@app.route("/api/keymap", methods=["GET"])
def get_keymap():
    """Gets current key mapping"""
    return jsonify(KEY_MAP)

@app.route("/api/keymap", methods=["POST"])
def post_keymap():
    """Updates key mapping"""
    global KEY_MAP
    try:
        data = request.get_json(force=True)
        logging.info(f"Received keymap data: {data}")
        
        # Update KEY_MAP
        for k in ["1", "2", "3", "4", "5", "6"]:
            if k in data:
                old_key = KEY_MAP.get(k, "")
                KEY_MAP[k] = data[k]
                logging.info(f"Key {k}: '{old_key}' -> '{data[k]}'")
        
        # Save configuration
        if ESP32_URL:
            save_config(ESP32_URL, BUTTON_NAMES)
        
        return jsonify(KEY_MAP)
    except Exception as e:
        logging.error(f"Failed to parse keymap JSON: {e}")
        return jsonify({"error": "invalid json"}), 400

@app.route("/config", methods=["POST"])
def config():
    try:
        data = request.get_json(force=True)
        logging.info(f"Received config data: {data}")
    except Exception as e:
        logging.error(f"Failed to parse JSON: {e}")
        return jsonify({"error": "invalid json"}), 400

    # Extend support to 6 buttons
    for k in ["1", "2", "3", "4", "5", "6"]:
        if k in data:
            old_name = BUTTON_NAMES.get(k, f"Button {k}")
            BUTTON_NAMES[k] = data[k]
            logging.info(f"Button {k}: '{old_name}' -> '{data[k]}'")

    # Save updated button names
    if ESP32_URL:
        save_config(ESP32_URL, BUTTON_NAMES)

        try:
            # Send data in format {"1":"name", "2":"name", ...}
            payload = {k: v for k, v in data.items() if k in ["1", "2", "3", "4", "5", "6"]}
            logging.info(f"Sending to ESP32 ({ESP32_URL}/config): {payload}")
            
            r = requests.post(f"{ESP32_URL}/config", 
                            headers={"Content-Type": "application/json"},
                            json=payload, 
                            timeout=3.0)
            
            logging.info(f"ESP32 response status: {r.status_code}")
            logging.info(f"ESP32 response text: {r.text}")
            
            r.raise_for_status()
            logging.info(f"Config successfully sent to ESP32")
        except requests.exceptions.Timeout:
            logging.error("Timeout while sending config to ESP32")
        except requests.exceptions.RequestException as e:
            logging.error(f"Failed to send config to ESP32: {e}")
        except Exception as e:
            logging.error(f"Unexpected error sending config to ESP32: {e}")

    return jsonify(BUTTON_NAMES)

@app.route("/api/system-info", methods=["GET"])
def get_system_info():
    """Gets system information (time, CPU, RAM)"""
    try:
        current_time = datetime.now().strftime("%H:%M:%S")
        current_date = datetime.now().strftime("%Y-%m-%d")
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        ram_percent = memory.percent
        
        return jsonify({
            "time": current_time,
            "date": current_date,
            "cpu": round(cpu_percent, 1),
            "ram": round(ram_percent, 1)
        })
    except Exception as e:
        logging.error(f"Error getting system info: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/settings", methods=["GET"])
def get_settings():
    """Gets current settings from ESP32"""
    if ESP32_URL:
        try:
            response = requests.get(f"{ESP32_URL}/settings", timeout=2)
            if response.status_code == 200:
                data = response.json()
                # Ensure colors are properly formatted
                if 'background' in data and not data['background'].startswith('#'):
                    data['background'] = data['background'].zfill(6)
                if 'active' in data and not data['active'].startswith('#'):
                    data['active'] = data['active'].zfill(6)
                if 'colors' in data:
                    data['colors'] = [c.zfill(6) for c in data['colors']]
                
                if 'info_timeout' not in data:
                    data['info_timeout'] = 120
                if 'info_enabled' not in data:
                    data['info_enabled'] = True
                    
                return jsonify(data)
        except Exception as e:
            logging.error(f"Error getting settings from ESP32: {e}")
    
    return jsonify({
        "timeout": 900,
        "background": "0a1e46",
        "active": "b4dcfa",
        "layout": 0,
        "colors": ["4682b4", "6495ed", "48d1cc", "5f9ea0", "ff6347", "8a2be2"],
        "info_timeout": 120,
        "info_enabled": True
    })

@app.route("/api/settings", methods=["POST"])
def post_settings():
    """Sends settings to ESP32"""
    try:
        data = request.get_json(force=True)
        logging.info(f"Received settings data: {data}")
    except Exception as e:
        logging.error(f"Failed to parse settings JSON: {e}")
        return jsonify({"error": "invalid json"}), 400

    if ESP32_URL:
        try:
            logging.info(f"Sending settings to ESP32 ({ESP32_URL}/settings): {data}")
            
            r = requests.post(f"{ESP32_URL}/settings", 
                            headers={"Content-Type": "application/json"},
                            json=data, 
                            timeout=3.0)
            
            logging.info(f"ESP32 settings response status: {r.status_code}")
            logging.info(f"ESP32 settings response text: {r.text}")
            
            r.raise_for_status()
            logging.info(f"Settings successfully sent to ESP32")
        except Exception as e:
            logging.error(f"Failed to send settings to ESP32: {e}")
            return jsonify({"error": str(e)}), 500

    return jsonify({"status": "ok"})

def run_flask():
    app.run(host="0.0.0.0", port=5000, debug=False)

# --- Main ---
if __name__ == "__main__":
    import os
    import sys
    import threading
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--esp", help="ESP32 base URL, e.g. http://192.168.4.1 (optional - if not provided, will scan)")
    parser.add_argument("--poll-interval", type=float, default=0.2)
    parser.add_argument("--hold", type=float, default=0.0)
    parser.add_argument("--trigger-on-first", action="store_true")
    parser.add_argument("--debug", action="store_true")

    args = parser.parse_args()

    # Load saved configuration
    saved_url, saved_button_names = load_config()
    BUTTON_NAMES.update(saved_button_names)

    # Determine ESP32 URL
    esp32_url = None
    
    if args.esp:
        # Use provided URL
        esp32_url = args.esp.rstrip("/")
    elif saved_url:
        # Check saved URL
        if verify_esp32_connection(saved_url):
            esp32_url = saved_url
            logging.info(f"Using saved URL: {esp32_url}")
        else:
            logging.warning("Saved URL not responding, starting scan...")
            esp32_url = scan_network()
    else:
        # Scan network
        esp32_url = scan_network()

    if not esp32_url:
        logging.error("Cannot find ESP32 device. Try providing address manually with --esp")
        exit(1)

    ESP32_URL = esp32_url
    
    # Start auto-reconnect thread
    threading.Thread(target=auto_reconnect_esp32, daemon=True).start()
    
    # Start system info sender thread
    threading.Thread(target=send_system_info_to_esp32, daemon=True).start()
    
    threading.Thread(target=lambda: poll_state(
        url=f"{ESP32_URL}/state",
        interval=args.poll_interval,
        hold=args.hold,
        trigger_on_first=args.trigger_on_first,
        debug=args.debug
    ), daemon=True).start()

    run_flask()