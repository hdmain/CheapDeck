let currentButtonNames = {};
let currentKeyMapping = {};
let currentSettings = {};

const availableKeys = [
    'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
    'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20',
    'media_play_pause', 'media_next', 'media_previous', 'media_volume_up', 'media_volume_down', 'media_volume_mute',
    'ctrl_l', 'ctrl_r', 'alt_l', 'alt_r', 'shift', 'space', 'enter', 'tab', 'esc'
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
        
        availableKeys.forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            if (currentKeyMapping[i] === key) {
                option.selected = true;
            }
            select.appendChild(option);
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
    
    fetch("/api/keymap", {
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

// Load current settings on page load
Promise.all([
    fetch("/api/settings").then(r => r.json()),
    fetch("/api/keymap").then(r => r.json())
])
.then(([settingsData, keymapData]) => {
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
        updateKeyMappingInputs();
    })
    .catch(err => console.error("Error sending settings:", err));
};

// Initialize inputs on page load
updateButtonInputs();
updateColorInputs();
updateKeyMappingInputs();
