let currentButtonNames = {};
let currentKeyMapping = {};
let currentSettings = {};

const availableKeys = [
    // Extended function keys (hard to access normally)
    'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f23', 'f24',
    
    // Media keys
    'media_play_pause', 'media_next', 'media_previous', 'media_volume_up', 'media_volume_down', 'media_volume_mute',
    
    // Common key combinations
    'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+y', 'ctrl+a', 'ctrl+s', 'ctrl+o', 'ctrl+n',
    'ctrl+shift+esc', 'ctrl+alt+delete', 'alt+tab', 'alt+f4',
    'win+d', 'win+e', 'win+r', 'win+l', 'win+tab', 'win+i', 'win+x', 'win+s',
    
    // Custom combinations with F-keys
    'ctrl+f1', 'ctrl+f2', 'ctrl+f3', 'ctrl+f4', 'ctrl+f5', 'ctrl+f6', 'ctrl+f7', 'ctrl+f8',
    'ctrl+f9', 'ctrl+f10', 'ctrl+f11', 'ctrl+f12',
    'alt+f1', 'alt+f2', 'alt+f3', 'alt+f4', 'alt+f5', 'alt+f6', 'alt+f7', 'alt+f8',
    'alt+f9', 'alt+f10', 'alt+f11', 'alt+f12',
    'shift+f1', 'shift+f2', 'shift+f3', 'shift+f4', 'shift+f5', 'shift+f6', 'shift+f7', 'shift+f8',
    'shift+f9', 'shift+f10', 'shift+f11', 'shift+f12',
    
    // Triple combinations
    'ctrl+win+f1', 'ctrl+win+f2', 'ctrl+win+f3', 'ctrl+win+f4', 'ctrl+win+f5', 'ctrl+win+f6',
    'ctrl+win+f7', 'ctrl+win+f8', 'ctrl+win+f9', 'ctrl+win+f10', 'ctrl+win+f11', 'ctrl+win+f12',
    'ctrl+alt+f1', 'ctrl+alt+f2', 'ctrl+alt+f3', 'ctrl+alt+f4', 'ctrl+alt+f5', 'ctrl+alt+f6',
    'ctrl+alt+f7', 'ctrl+alt+f8', 'ctrl+alt+f9', 'ctrl+alt+f10', 'ctrl+alt+f11', 'ctrl+alt+f12',
    'ctrl+shift+f1', 'ctrl+shift+f2', 'ctrl+shift+f3', 'ctrl+shift+f4', 'ctrl+shift+f5', 'ctrl+shift+f6',
    'ctrl+shift+f7', 'ctrl+shift+f8', 'ctrl+shift+f9', 'ctrl+shift+f10', 'ctrl+shift+f11', 'ctrl+shift+f12',
    
    // Gaming and streaming shortcuts
    'win+g', 'win+alt+r', 'win+alt+g', 'win+alt+m',
    'ctrl+shift+c', 'ctrl+shift+v', 'ctrl+shift+i', 'ctrl+shift+j'
];

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

function updateKeyMappingInputs() {
    const layout = parseInt(document.getElementById("layout").value);
    const buttonCount = layout === 0 ? 4 : 6;
    const container = document.getElementById("keyMappingContainer");
    
    container.innerHTML = '';
    for (let i = 1; i <= buttonCount; i++) {
        const div = document.createElement('div');
        div.className = 'key-mapping-input';
        
        const select = document.createElement('select');
        select.id = `key${i}`;
        
        // Group keys by category
        const categories = {
            'Extended Function Keys (F13-F24)': availableKeys.filter(k => k.match(/^f(1[3-9]|2[0-4])$/)),
            'Media Keys': availableKeys.filter(k => k.startsWith('media_')),
            'Basic Combinations': availableKeys.filter(k => k.includes('+') && !k.includes('f') && !k.includes('win')),
            'Windows Shortcuts': availableKeys.filter(k => k.includes('win+')),
            'Ctrl + F-Keys': availableKeys.filter(k => k.match(/^ctrl\+f\d+$/)),
            'Alt + F-Keys': availableKeys.filter(k => k.match(/^alt\+f\d+$/)),
            'Shift + F-Keys': availableKeys.filter(k => k.match(/^shift\+f\d+$/)),
            'Triple Combinations': availableKeys.filter(k => k.split('+').length === 3)
        };
        
        Object.entries(categories).forEach(([category, keys]) => {
            if (keys.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category;
                
                keys.forEach(key => {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = key.toUpperCase();
                    if (currentKeyMapping[i] === key) {
                        option.selected = true;
                    }
                    optgroup.appendChild(option);
                });
                
                select.appendChild(optgroup);
            }
        });
        
        div.innerHTML = `<label>Button ${i} Key:</label>`;
        div.appendChild(select);
        container.appendChild(div);
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
    
    fetch("http://localhost:22778/config", {
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

function updateKeyMapping() {
    const layout = parseInt(document.getElementById("layout").value);
    const buttonCount = layout === 0 ? 4 : 6;
    const data = {};
    
    for (let i = 1; i <= buttonCount; i++) {
        const select = document.getElementById(`key${i}`);
        if (select) {
            data[i] = select.value;
            currentKeyMapping[i] = select.value;
        }
    }
    
    fetch("http://localhost:22778/api/keymap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(j => {
        console.log("Key mapping sent:", j);
        alert("Key mapping updated!");
    })
    .catch(err => console.error("Error sending key mapping:", err));
}

// Funkcja pomocnicza do sprawdzania czy settings są domyślne (czyli ESP32 nie znaleziono)
function isDefaultSettings(settings) {
    return (
        settings &&
        settings.timeout === 900 &&
        settings.background === "0a1e46" &&
        settings.active === "b4dcfa" &&
        Array.isArray(settings.colors) &&
        settings.colors.join(",") === ["4682b4", "6495ed", "48d1cc", "5f9ea0", "ff6347", "8a2be2"].join(",")
    );
}

// Load current settings on page load
Promise.all([
    fetch("http://localhost:22778/api/settings").then(r => r.json()),
    fetch("http://localhost:22778/api/keymap").then(r => r.json())
])
.then(([settingsData, keymapData]) => {
    // Dodaj obsługę braku ESP32
    if (isDefaultSettings(settingsData)) {
        document.getElementById("esp32-warning").style.display = "block";
    } else {
        document.getElementById("esp32-warning").style.display = "none";
    }
    // Load settings
    document.getElementById("timeout").value = settingsData.timeout;
    document.getElementById("background").value = "#" + settingsData.background.padStart(6, '0');
    document.getElementById("active").value = "#" + settingsData.active.padStart(6, '0');
    document.getElementById("layout").value = settingsData.layout || 0;
    
    // Load info mode settings
    if (settingsData.info_timeout !== undefined) {
        document.getElementById("info_timeout").value = settingsData.info_timeout;
    }
    if (settingsData.info_enabled !== undefined) {
        document.getElementById("info_enabled").checked = settingsData.info_enabled;
    }
    
    // Load keymap
    currentKeyMapping = keymapData;
    currentSettings = settingsData;
    
    // Update inputs
    updateColorInputs();
    updateButtonInputs();
    updateKeyMappingInputs();
    
    // Set color values
    for (let i = 0; i < settingsData.colors.length; i++) {
        const colorInput = document.getElementById("color" + i);
        if (colorInput) {
            colorInput.value = "#" + settingsData.colors[i].padStart(6, '0');
        }
    }
})
.catch(err => {
    console.error("Error loading data:", err);
    updateButtonInputs();
    updateColorInputs();
    updateKeyMappingInputs();
    const warning = document.getElementById("esp32-warning");
    if (warning) warning.style.display = "block";
});

document.getElementById("settingsForm").onsubmit = function(e) {
    e.preventDefault();
    const layout = parseInt(document.getElementById("layout").value);
    
    const colors = [];
    for (let i = 0; i < 6; i++) {
        const colorInput = document.getElementById("color" + i);
        if (colorInput) {
            colors.push(colorInput.value.replace("#", ""));
        } else {
            const defaultColors = ["4682b4", "6495ed", "48d1cc", "5f9ea0", "ff6347", "8a2be2"];
            colors.push(defaultColors[i]);
        }
    }
    
    let data = {
        timeout: parseInt(document.getElementById("timeout").value),
        background: document.getElementById("background").value.replace("#", ""),
        active: document.getElementById("active").value.replace("#", ""),
        layout: layout,
        colors: colors,
        info_timeout: parseInt(document.getElementById("info_timeout").value) || 120,
        info_enabled: document.getElementById("info_enabled").checked
    };
    
    fetch("http://localhost:22778/api/settings", {
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
        updateKeyMappingInputs();
    })
    .catch(err => console.error("Error sending settings:", err));
};

// Theme management
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Load saved theme
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// Status management
function updateStatus(status, message) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    statusDot.className = `status-dot ${status}`;
    statusText.textContent = message;
}

// Connection monitoring
async function checkConnection() {
    try {
        const response = await fetch('http://localhost:22778/api/settings', { 
            method: 'GET',
            timeout: 5000 
        });
        
        if (response.ok) {
            updateStatus('connected', 'Connected');
            return true;
        } else {
            updateStatus('disconnected', 'Server Error');
            return false;
        }
    } catch (error) {
        updateStatus('disconnected', 'Disconnected');
        return false;
    }
}

// Periodic connection check
function startConnectionMonitoring() {
    // Initial check
    checkConnection();
    
    // Check every 10 seconds
    setInterval(checkConnection, 10000);
}

// Initialize theme and monitoring on page load
document.addEventListener('DOMContentLoaded', function() {
    loadTheme();
    startConnectionMonitoring();
});
