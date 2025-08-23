#include <WiFi.h>
#include <WebServer.h>
#include <SPI.h>
#include <XPT2046_Touchscreen.h>
#include <TFT_eSPI.h>
#include <esp_sleep.h>
#include <Preferences.h>
#include <ArduinoJson.h>

// --- WiFi credentials ---
const char* SSID = "setup";
const char* PASSWORD = "setup";

// --- Touch pins ---
#define XPT2046_IRQ 36   // VP (touch IRQ)
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK 25
#define XPT2046_CS 33

// --- DeepSleep defines ---
#define DEEPSLEEP_WAKEUP_PIN 36 // Touch interrupt
#define DEEPSLEEP_PIN_ACT LOW

SPIClass mySpi = SPIClass(VSPI);
XPT2046_Touchscreen ts(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();

// --- Web server ---
WebServer server(80);

// --- Touch calibration ---
const int TOUCH_MIN = 50;
const int TOUCH_MAX = 3900;

// --- Buttons ---
struct Btn {
  int x, y, size;
  bool state;
  unsigned long lastToggleMs;
  String label;
};
Btn buttons[6]; // Expand to 6 buttons for 2x3 layout

const unsigned long toggleDebounceMs = 300;

// --- Layout configuration ---
enum LayoutType {
  LAYOUT_2x2 = 0,
  LAYOUT_3x2 = 1
};
LayoutType currentLayout = LAYOUT_2x2;
int buttonCount = 4; // Default 4 buttons

// --- Screensaver / deep sleep ---
unsigned long lastInteraction = 0;
unsigned long SCREENSAVER_TIMEOUT = 900000; // 15 min default, now configurable
bool screensaverActive = false;

// --- Button colors (configurable) ---
struct ButtonColors {
  uint16_t normal[6]; // Expand to 6 colors
  uint16_t active;
  uint16_t background;
} colors;

// --- Preferences (NVS) ---
Preferences prefs;

// --- AP (fallback) ---
bool apModeActive = false;
String apSSID = "CheapDeck-Setup";
String savedSSID = String(SSID);
String savedPassword = String(PASSWORD);

// --- Info mode configuration (restored) ---
bool infoModeEnabled = true;
unsigned long INFO_MODE_TIMEOUT = 120000; // 2 minutes default
bool infoModeActive = false;
unsigned long lastInfoUpdate = 0;
const unsigned long INFO_UPDATE_INTERVAL = 1000; // Update every second
bool infoModeFirstDraw = true; // Global flag for first draw

struct SystemInfo {
  String time;
  String date;
  float cpu;
  float ram;
} systemInfo, previousSystemInfo;

// --- Forward declarations ---
void drawButtons();
void handleState();
void handleConfig();
void handleSettings();
void handleGetSettings();
void handleRoot();
void handleSaveCredentials(); // <-- new
void showApiUrlForStartup(const String &apiUrl, unsigned long ms);
void showStartupScreen();
void showAPModeScreen(); // <-- new
void enterDeepSleep();
void saveStates();
void loadStates();
void saveSettings();
void loadSettings();
void initDefaultColors();
uint16_t hexToRGB565(const String& hexColor);
String rgb565ToHex(uint16_t color);
void setupButtonLayout();
int getButtonCount();
void handleSystemInfo();
void drawInfoMode();
void fetchSystemInfo();
void resetInfoMode();
void handleSerialCommands(); // New: declaration for serial command handler

long clampLong(long v, long a, long b) {
  if (v < a) return a;
  if (v > b) return b;
  return v;
}

void setup() {
  Serial.begin(115200);
  delay(100);

  // Load saved settings and states
  loadSettings();
  loadStates();

  // Check wakeup reason
  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
  Serial.printf("Wakeup reason: %d\n", wakeup_reason);

  // Touch init
  mySpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  ts.begin(mySpi);
  ts.setRotation(1);

  // TFT init
  tft.init();
  tft.setRotation(1);

  // Show startup screen
  showStartupScreen();

  // Setup button layout based on current configuration
  setupButtonLayout();

  // WiFi - set hostname before connection
  WiFi.setHostname("ESP32-CheapDeck");
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, INADDR_NONE);
  WiFi.setHostname("ESP32-CheapDeck");
  
  Serial.printf("Connecting to WiFi: %s\n", savedSSID.c_str());
  WiFi.begin(savedSSID.c_str(), savedPassword.c_str());
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500); Serial.print(".");
    tries++;
  }
  Serial.println();

  String apiUrl;
  if (WiFi.status() == WL_CONNECTED) {
    String ip = WiFi.localIP().toString();
    Serial.printf("Connected. IP: %s\n", ip.c_str());
    Serial.printf("Hostname: ESP32-CheapDeck\n");
    apiUrl = String("http://") + ip + String("/state");
  } else {
    Serial.println("No WiFi - entering AP setup mode.");
    // Start SoftAP for configuration
    WiFi.softAP(apSSID.c_str());
    apModeActive = true;
    IPAddress apIP = WiFi.softAPIP();
    Serial.printf("AP started: %s - %s\n", apSSID.c_str(), apIP.toString().c_str());
    apiUrl = String("http://") + apIP.toString() + String("/");
    showAPModeScreen();
  }

  // Handlers
  server.on("/", HTTP_GET, handleRoot);
  server.on("/state", HTTP_GET, handleState);
  server.on("/config", HTTP_POST, handleConfig);
  server.on("/settings", HTTP_POST, handleSettings);
  server.on("/settings", HTTP_GET, handleGetSettings);
  server.on("/system-info", HTTP_POST, handleSystemInfo);
  server.on("/save-credentials", HTTP_POST, handleSaveCredentials); // <-- new
  server.begin();
  Serial.println("HTTP server started");

  showApiUrlForStartup(apiUrl, 3000);

  // If we started in AP/config mode, restore AP setup screen after showing API URL
  if (apModeActive) {
    showAPModeScreen(); // keep AP configuration screen visible
    lastInteraction = millis();
  } else {
    drawButtons();
    lastInteraction = millis();
  }
}

void loop() {
  server.handleClient();

  // Check serial for special commands (e.g. forget wifi)
  handleSerialCommands();
  
  bool touchedNow = ts.touched();

  if (touchedNow) {
    TS_Point p = ts.getPoint();
    int rawX = clampLong(p.x, TOUCH_MIN, TOUCH_MAX);
    int rawY = clampLong(p.y, TOUCH_MIN, TOUCH_MAX);
    int mappedX = map(rawX, TOUCH_MIN, TOUCH_MAX, 0, tft.width()-1);
    int mappedY = map(rawY, TOUCH_MIN, TOUCH_MAX, 0, tft.height()-1);

    if (p.z > 0) {
      unsigned long now = millis();
      lastInteraction = now;

      // If info mode was active → return to buttons
      if (infoModeActive) {
        resetInfoMode();
        return;
      }

      // If screensaver was active → wake up screen
      if (screensaverActive) {
        screensaverActive = false;
        drawButtons();
        return;
      }

      for (int i = 0; i < buttonCount; i++) {
        Btn &b = buttons[i];
        if (mappedX >= b.x && mappedX <= (b.x + b.size -1) &&
            mappedY >= b.y && mappedY <= (b.y + b.size -1)) {
          if (now - b.lastToggleMs > toggleDebounceMs) {
            b.state = !b.state;
            b.lastToggleMs = now;
            drawButtons();
            saveStates();
            Serial.printf("Button %d toggled -> %s\n", i+1, b.state?"true":"false");
            break;
          }
        }
      }
    }
  }

  // Check if should enter info mode
  if (infoModeEnabled && !infoModeActive && !screensaverActive && 
      (millis() - lastInteraction > INFO_MODE_TIMEOUT)) {
    infoModeActive = true;
    infoModeFirstDraw = true;
    
    // Reset data to force full refresh
    previousSystemInfo.time = "";
    previousSystemInfo.date = "";
    previousSystemInfo.cpu = -1;
    previousSystemInfo.ram = -1;
    
    drawInfoMode();
  }

  // Update info mode if active
  if (infoModeActive && (millis() - lastInfoUpdate > INFO_UPDATE_INTERVAL)) {
    drawInfoMode();
    lastInfoUpdate = millis();
  }

  // Deep sleep - check after info mode
  if (!screensaverActive && 
      (millis() - lastInteraction > SCREENSAVER_TIMEOUT)) {
    
    // If info mode is active, first turn it off
    if (infoModeActive) {
      infoModeActive = false;
    }
    
    enterDeepSleep();
  }
}

// --- Helper function to reset info mode ---
void resetInfoMode() {
  infoModeActive = false;
  infoModeFirstDraw = true;
  tft.fillScreen(colors.background);
  drawButtons();
}

void handleSystemInfo() {
  if (!server.hasArg("plain")) {
    server.send(400,"text/plain","Missing body");
    return;
  }
  
  String body = server.arg("plain");
  DynamicJsonDocument doc(512);
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    Serial.printf("System info JSON parse error: %s\n", error.c_str());
    server.send(400, "text/plain", "Invalid JSON");
    return;
  }
  
  if (doc.containsKey("time")) systemInfo.time = doc["time"].as<String>();
  if (doc.containsKey("date")) systemInfo.date = doc["date"].as<String>();
  if (doc.containsKey("cpu")) systemInfo.cpu = doc["cpu"].as<float>();
  if (doc.containsKey("ram")) systemInfo.ram = doc["ram"].as<float>();
  
  server.send(200, "text/plain", "OK");
}

void fetchSystemInfo() {
  // Wysyła request do serwera Python o aktualne info systemowe
  // To będzie obsługiwane przez Python który wyśle dane przez POST /system-info
}

void drawInfoMode() {
  // Check if data changed
  bool timeChanged = systemInfo.time != previousSystemInfo.time;
  bool dateChanged = systemInfo.date != previousSystemInfo.date;
  bool cpuChanged = abs(systemInfo.cpu - previousSystemInfo.cpu) > 0.1;
  bool ramChanged = abs(systemInfo.ram - previousSystemInfo.ram) > 0.1;
  
  // If first call, draw everything
  if (infoModeFirstDraw) {
    tft.fillScreen(colors.background);
    infoModeFirstDraw = false;
    timeChanged = dateChanged = cpuChanged = ramChanged = true;
  }
  
  tft.setTextColor(TFT_WHITE, colors.background);
  tft.setTextDatum(MC_DATUM);
  
  int centerX = tft.width() / 2;
  int centerY = tft.height() / 2;
  
  // Draw only changed elements
  if (dateChanged) {
    tft.fillRect(0, centerY - 60, tft.width(), 30, colors.background);
    tft.drawString(systemInfo.date, centerX, centerY - 40, 2);
  }
  
  if (timeChanged) {
    tft.fillRect(0, centerY - 30, tft.width(), 40, colors.background);
    tft.drawString(systemInfo.time, centerX, centerY - 10, 4);
  }
  
  if (cpuChanged) {
    tft.fillRect(0, centerY + 5, tft.width(), 25, colors.background);
    String cpuText = "CPU: " + String(systemInfo.cpu, 1) + "%";
    tft.drawString(cpuText, centerX, centerY + 20, 2);
  }
  
  if (ramChanged) {
    tft.fillRect(0, centerY + 25, tft.width(), 25, colors.background);
    String ramText = "RAM: " + String(systemInfo.ram, 1) + "%";
    tft.drawString(ramText, centerX, centerY + 40, 2);
  }
  
  // Save current values as previous
  previousSystemInfo = systemInfo;
}

// --- Setup button layout ---
void setupButtonLayout() {
  int w = tft.width();
  int h = tft.height();
  int margin = max(8, min(w, h)/20);
  
  buttonCount = getButtonCount();
  
  if (currentLayout == LAYOUT_2x2) {
    // Layout 2x2
    int availableW = w - margin*3;
    int availableH = h - margin*3;
    int btnSize = min(availableW/2, availableH/2);
    int startX = (w - (btnSize*2 + margin))/2;
    int startY = (h - (btnSize*2 + margin))/2;

    for (int i = 0; i < 4; i++) {
      buttons[i].x = startX + (i%2)*(btnSize + margin);
      buttons[i].y = startY + (i/2)*(btnSize + margin);
      buttons[i].size = btnSize;
      buttons[i].lastToggleMs = 0;
      if (buttons[i].label=="") buttons[i].label = String(i+1);
    }
  } else if (currentLayout == LAYOUT_3x2) {
    // Layout 3x2 (3 columns, 2 rows)
    int availableW = w - margin*4;
    int availableH = h - margin*3;
    int btnSize = min(availableW/3, availableH/2);
    int startX = (w - (btnSize*3 + margin*2))/2;
    int startY = (h - (btnSize*2 + margin))/2;

    for (int i = 0; i < 6; i++) {
      buttons[i].x = startX + (i%3)*(btnSize + margin);
      buttons[i].y = startY + (i/3)*(btnSize + margin);
      buttons[i].size = btnSize;
      buttons[i].lastToggleMs = 0;
      if (buttons[i].label=="") buttons[i].label = String(i+1);
    }
  }
}

int getButtonCount() {
  return (currentLayout == LAYOUT_2x2) ? 4 : 6;
}

// --- Draw buttons ---
void drawButtons() {
  tft.fillScreen(colors.background);

  for (int i = 0; i < buttonCount; i++) {
    Btn &b = buttons[i];
    uint16_t color = b.state ? colors.active : colors.normal[i]; // Use proper color for each button
    tft.fillRect(b.x, b.y, b.size, b.size, color);
    tft.drawRect(b.x, b.y, b.size, b.size, TFT_WHITE);

    // label
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(TFT_WHITE);
    tft.drawString(b.label, b.x + b.size/2, b.y + b.size/2, 2);
  }
}

// --- Root API ---
void handleRoot() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  // If we are in AP/config mode, show a simple HTML configurator
  if (apModeActive) {
    String html = "<!doctype html><html><head><meta charset='utf-8'><title>CheapDeck Setup</title></head><body>";
    html += "<h2>CheapDeck Wi-Fi Setup</h2>";
    html += "<p>Connect to Wi-Fi network: <strong>" + apSSID + "</strong></p>";
    html += "<p>Open this page and enter your network credentials below.</p>";
    html += "<form method='POST' action='/save-credentials'>";
    html += "SSID:<br><input name='ssid' /><br>";
    html += "Password:<br><input name='password' type='password' /><br><br>";
    html += "<input type='submit' value='Save and Connect' />";
    html += "</form>";
    html += "<p>Or send JSON POST to /save-credentials: {\"ssid\":\"...\",\"password\":\"...\"}</p>";
    html += "</body></html>";
    server.send(200, "text/html", html);
    return;
  }

  server.sendHeader("Content-Type", "text/plain");
  server.send(200, "text/plain", "cheap deck api");
}

// --- API ---
void handleState() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Content-Type", "application/json");
  String payload = "{";
  for (int i = 0; i < buttonCount; i++) {
    payload += "\"" + String(i+1) + "\":" + (buttons[i].state?"true":"false");
    if (i < buttonCount-1) payload += ",";
  }
  payload += "}";
  server.send(200, "application/json", payload);
}

// --- Config API POST /config {"1":"Label1",...} ---
void handleConfig() {
  if (!server.hasArg("plain")) {
    Serial.println("ERROR: Missing body in config request");
    server.send(400,"text/plain","Missing body");
    return;
  }
  
  String body = server.arg("plain");
  Serial.println("=== CONFIG REQUEST ===");
  Serial.println("Raw body: " + body);
  
  // Parse JSON using ArduinoJson
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    Serial.printf("Config JSON parse error: %s\n", error.c_str());
    server.send(400, "text/plain", "Invalid JSON");
    return;
  }
  
  bool changed = false;
  for (int i = 0; i < buttonCount; i++) {
    String key = String(i+1);
    if (doc.containsKey(key)) {
      String newLabel = doc[key].as<String>();
      if (buttons[i].label != newLabel) {
        Serial.printf("Button %d: '%s' -> '%s'\n", i+1, buttons[i].label.c_str(), newLabel.c_str());
        buttons[i].label = newLabel;
        changed = true;
      }
    }
  }
  
  if (changed) {
    saveStates();
    drawButtons();
    Serial.println("Config updated and saved!");
  } else {
    Serial.println("No changes detected in config");
  }
  
  Serial.println("=== CONFIG COMPLETE ===");
  server.send(200, "text/plain", "OK");
}

// --- Settings API GET /settings ---
void handleGetSettings() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Content-Type", "application/json");
  
  String payload = "{";
  payload += "\"timeout\":" + String(SCREENSAVER_TIMEOUT / 1000) + ",";
  payload += "\"background\":\"" + rgb565ToHex(colors.background) + "\",";
  payload += "\"active\":\"" + rgb565ToHex(colors.active) + "\",";
  payload += "\"layout\":" + String(currentLayout) + ",";
  payload += "\"info_timeout\":" + String(INFO_MODE_TIMEOUT / 1000) + ",";
  payload += "\"info_enabled\":" + String(infoModeEnabled ? "true" : "false") + ",";
  payload += "\"colors\":[";
  for (int i = 0; i < 6; i++) {
    payload += "\"" + rgb565ToHex(colors.normal[i]) + "\"";
    if (i < 5) payload += ",";
  }
  payload += "]}";
  
  server.send(200, "application/json", payload);
}

// --- Settings API POST /settings ---
void handleSettings() {
  if (!server.hasArg("plain")) {
    Serial.println("ERROR: Missing body in settings request");
    server.send(400,"text/plain","Missing body");
    return;
  }
  
  String body = server.arg("plain");
  Serial.println("=== SETTINGS REQUEST ===");
  Serial.println("Raw body: " + body);
  
  // Parse JSON using ArduinoJson
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    Serial.printf("Settings JSON parse error: %s\n", error.c_str());
    server.send(400, "text/plain", "Invalid JSON");
    return;
  }
  
  bool changed = false;
  bool layoutChanged = false;
  
  // Parse timeout
  if (doc.containsKey("timeout")) {
    unsigned long newTimeout = doc["timeout"].as<unsigned long>() * 1000;
    if (newTimeout != SCREENSAVER_TIMEOUT) {
      SCREENSAVER_TIMEOUT = newTimeout;
      changed = true;
      Serial.printf("Timeout changed to: %lu seconds\n", SCREENSAVER_TIMEOUT / 1000);
    }
  }
  
  // Parse info mode settings
  if (doc.containsKey("info_timeout")) {
    unsigned long newInfoTimeout = doc["info_timeout"].as<unsigned long>() * 1000;
    if (newInfoTimeout != INFO_MODE_TIMEOUT) {
      INFO_MODE_TIMEOUT = newInfoTimeout;
      changed = true;
      Serial.printf("Info timeout changed to: %lu seconds\n", INFO_MODE_TIMEOUT / 1000);
    }
  }
  
  if (doc.containsKey("info_enabled")) {
    bool newInfoEnabled = doc["info_enabled"].as<bool>();
    if (newInfoEnabled != infoModeEnabled) {
      infoModeEnabled = newInfoEnabled;
      changed = true;
      Serial.printf("Info mode enabled: %s\n", infoModeEnabled ? "true" : "false");
      
      // If info mode was disabled and was active, return to buttons
      if (!infoModeEnabled && infoModeActive) {
        resetInfoMode();
      }
    }
  }
  
  // Parse layout
  if (doc.containsKey("layout")) {
    LayoutType newLayout = (LayoutType)doc["layout"].as<int>();
    if (newLayout != currentLayout) {
      currentLayout = newLayout;
      layoutChanged = true;
      changed = true;
      Serial.printf("Layout changed to: %d\n", currentLayout);
    }
  }
  
  // Parse background color
  if (doc.containsKey("background")) {
    String hexColor = doc["background"].as<String>();
    uint16_t newBg = hexToRGB565(hexColor);
    if (newBg != colors.background) {
      colors.background = newBg;
      changed = true;
      Serial.printf("Background color changed to: %s -> 0x%04X\n", hexColor.c_str(), newBg);
    }
  }
  
  // Parse active color
  if (doc.containsKey("active")) {
    String hexColor = doc["active"].as<String>();
    uint16_t newActive = hexToRGB565(hexColor);
    if (newActive != colors.active) {
      colors.active = newActive;
      changed = true;
      Serial.printf("Active color changed to: %s -> 0x%04X\n", hexColor.c_str(), newActive);
    }
  }
  
  // Parse button colors
  if (doc.containsKey("colors") && doc["colors"].is<JsonArray>()) {
    JsonArray colorArray = doc["colors"];
    for (int i = 0; i < 6 && i < colorArray.size(); i++) { // Parse all 6 colors
      String hexColor = colorArray[i].as<String>();
      uint16_t newColor = hexToRGB565(hexColor);
      if (newColor != colors.normal[i]) {
        colors.normal[i] = newColor;
        changed = true;
        Serial.printf("Button %d color changed to: %s -> 0x%04X\n", i+1, hexColor.c_str(), newColor);
      }
    }
  }
  
  if (changed) {
    saveSettings();
    if (layoutChanged) {
      setupButtonLayout();
    }
    // Don't draw buttons if info mode is active
    if (!infoModeActive) {
      drawButtons();
    }
    Serial.println("Settings updated and saved!");
  } else {
    Serial.println("No changes detected in settings");
  }
  
  Serial.println("=== SETTINGS COMPLETE ===");
  server.send(200, "text/plain", "OK");
}

void showApiUrlForStartup(const String &apiUrl, unsigned long ms) {
  tft.fillScreen(tft.color565(10,30,70));
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("API URL:", tft.width()/2, tft.height()/2 - 12, 2);
  tft.drawCentreString(apiUrl, tft.width()/2, tft.height()/2 + 12, 2);
  delay(ms);
}

void saveStates() {
  prefs.begin("buttons", false);
  for (int i = 0; i < 6; i++) { // Save all 6 buttons
    prefs.putBool(("state" + String(i)).c_str(), buttons[i].state);
    prefs.putString(("label" + String(i)).c_str(), buttons[i].label);
  }
  prefs.end();
}

void saveSettings() {
  prefs.begin("settings", false);
  prefs.putULong("timeout", SCREENSAVER_TIMEOUT);
  prefs.putUShort("bg_color", colors.background);
  prefs.putUShort("active_color", colors.active);
  prefs.putInt("layout", currentLayout);
  prefs.putULong("info_timeout", INFO_MODE_TIMEOUT);
  prefs.putBool("info_enabled", infoModeEnabled);
  for (int i = 0; i < 6; i++) {
    prefs.putUShort(("color" + String(i)).c_str(), colors.normal[i]);
  }
  prefs.end();
}

void loadSettings() {
  initDefaultColors();
  
  prefs.begin("settings", true);
  SCREENSAVER_TIMEOUT = prefs.getULong("timeout", 900000);
  colors.background = prefs.getUShort("bg_color", colors.background);
  colors.active = prefs.getUShort("active_color", colors.active);
  currentLayout = (LayoutType)prefs.getInt("layout", LAYOUT_2x2);
  INFO_MODE_TIMEOUT = prefs.getULong("info_timeout", 120000);
  infoModeEnabled = prefs.getBool("info_enabled", true);
  for (int i = 0; i < 6; i++) {
    colors.normal[i] = prefs.getUShort(("color" + String(i)).c_str(), colors.normal[i]);
  }

  // Load saved WiFi credentials if present
  savedSSID = prefs.getString("wifi_ssid", savedSSID);
  savedPassword = prefs.getString("wifi_pass", savedPassword);

  prefs.end();
}

// --- Load button states and labels from NVS ---
void loadStates() {
  prefs.begin("buttons", true); // read-only
  for (int i = 0; i < 6; i++) { // Load all 6 buttons
    buttons[i].state = prefs.getBool(("state" + String(i)).c_str(), false);
    buttons[i].label = prefs.getString(("label" + String(i)).c_str(), String(i+1));
  }
  prefs.end();
}

void initDefaultColors() {
  colors.background = tft.color565(10,30,70);
  colors.active = tft.color565(180,220,250);
  colors.normal[0] = tft.color565(70,130,180);   // steel blue
  colors.normal[1] = tft.color565(100,149,237);  // cornflower blue
  colors.normal[2] = tft.color565(72,209,204);   // medium turquoise
  colors.normal[3] = tft.color565(95,158,160);   // cadet blue
  colors.normal[4] = tft.color565(255,99,71);    // tomato
  colors.normal[5] = tft.color565(138,43,226);   // blue violet
}

// --- Enter deep sleep ---
void enterDeepSleep() {
  Serial.println("Entering deep sleep...");
  tft.fillScreen(tft.color565(0,0,0));
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("Sleep mode", tft.width()/2, tft.height()/2, 2);

  // Configure wakeup on touch IRQ pin
  esp_sleep_enable_ext0_wakeup((gpio_num_t)DEEPSLEEP_WAKEUP_PIN, DEEPSLEEP_PIN_ACT);

  delay(200); // allow screen update
  esp_deep_sleep_start();
}

// --- Color conversion functions ---
uint16_t hexToRGB565(const String& hexColor) {
  // Convert hex string (like "ff0000") to RGB565
  uint32_t hex = strtol(hexColor.c_str(), NULL, 16);
  uint8_t r = (hex >> 16) & 0xFF;
  uint8_t g = (hex >> 8) & 0xFF;
  uint8_t b = hex & 0xFF;
  
  return tft.color565(r, g, b);
}

String rgb565ToHex(uint16_t color) {
  // Convert RGB565 back to hex string for web interface
  uint8_t r = (color >> 11) * 255 / 31;
  uint8_t g = ((color >> 5) & 0x3F) * 255 / 63;
  uint8_t b = (color & 0x1F) * 255 / 31;
  
  char hexStr[7];
  sprintf(hexStr, "%02x%02x%02x", r, g, b);
  return String(hexStr);
}

void showStartupScreen() {
  // Blue background
  tft.fillScreen(tft.color565(70, 130, 180)); // Steel blue background
  
  tft.setTextDatum(MC_DATUM);
  
  // Large black "Cheap Deck" text
  tft.setTextColor(TFT_BLACK);
  tft.drawString("Cheap Deck", tft.width()/2, tft.height()/2 - 10, 4);
  
  // Small gray "Version 1.1" text
  tft.setTextColor(tft.color565(128, 128, 128)); // Gray color
  tft.drawString("Version 1.1", tft.width()/2, tft.height()/2 + 25, 2);
  
  delay(2000); // Show for 2 seconds
}

void showAPModeScreen() {
  tft.fillScreen(colors.background);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("AP Mode - Setup WiFi", tft.width()/2, tft.height()/2 - 30, 2);
  tft.drawString("Connect to Wi-Fi:", tft.width()/2, tft.height()/2 - 8, 2);
  tft.drawString(apSSID, tft.width()/2, tft.height()/2 + 10, 4);
  tft.drawString("Open http://192.168.4.1/", tft.width()/2, tft.height()/2 + 45, 2);
}

// --- New: save credentials handler ---
void handleSaveCredentials() {
  Serial.println("=== SAVE CREDENTIALS REQUEST ===");

  String newSSID = "";
  String newPass = "";

  // Prefer JSON body if provided
  if (server.hasArg("plain") && server.arg("plain").length() > 0) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(512);
    DeserializationError error = deserializeJson(doc, body);
    if (!error) {
      if (doc.containsKey("ssid")) newSSID = doc["ssid"].as<String>();
      if (doc.containsKey("password")) newPass = doc["password"].as<String>();
    } else {
      Serial.printf("JSON parse error in save-credentials: %s\n", error.c_str());
    }
  }

  // Fallback: form fields (application/x-www-form-urlencoded)
  if (newSSID.length() == 0) {
    if (server.hasArg("ssid")) newSSID = server.arg("ssid");
    if (server.hasArg("password")) newPass = server.arg("password");
  }

  if (newSSID.length() == 0) {
    Serial.println("No SSID provided");
    server.send(400, "text/plain", "Missing ssid");
    return;
  }

  Serial.printf("Attempting to save/connect to SSID: %s\n", newSSID.c_str());

  // Save to NVS
  prefs.begin("settings", false);
  prefs.putString("wifi_ssid", newSSID);
  prefs.putString("wifi_pass", newPass);
  prefs.end();

  // Try to connect using new credentials
  WiFi.softAPdisconnect(true);
  delay(200);
  WiFi.begin(newSSID.c_str(), newPass.c_str());

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Connected with new credentials. Restarting...");
    server.send(200, "text/plain", "OK");
    delay(500);
    ESP.restart();
    return;
  } else {
    // Failed - re-enable AP and inform user
    WiFi.softAP(apSSID.c_str());
    apModeActive = true;
    IPAddress apIP = WiFi.softAPIP();
    Serial.println("Failed to connect with provided credentials. AP restored.");
    server.send(500, "text/plain", "Failed to connect with provided credentials");
    showAPModeScreen();
    return;
  }
}

// --- New: handle serial commands ---
// Send one of these lines over serial to clear WiFi credentials and start AP:
//   FORGET
//   RESET_WIFI
//   CLEAR_WIFI
void handleSerialCommands() {
  if (Serial && Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();
    if (cmd.length() == 0) return;

    if (cmd == "FORGET" || cmd == "RESET_WIFI" || cmd == "CLEAR_WIFI") {
      Serial.println("Command received: clear WiFi credentials");

      // Remove saved credentials from NVS
      prefs.begin("settings", false);
      prefs.remove("wifi_ssid");
      prefs.remove("wifi_pass");
      prefs.end();

      // Reset in-memory values
      savedSSID = String(SSID);
      savedPassword = String(PASSWORD);

      // Disconnect and start AP for reconfiguration
      WiFi.disconnect(true);
      delay(100);
      WiFi.softAP(apSSID.c_str());
      apModeActive = true;

      // Show AP screen and inform user
      showAPModeScreen();
      Serial.println("WiFi credentials cleared. AP mode started (CheapDeck-Setup).");
    } else {
      Serial.printf("Unknown command: %s\n", cmd.c_str());
    }
  }
}
