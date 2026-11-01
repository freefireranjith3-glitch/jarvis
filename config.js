// JARVIS – பொது அமைப்புகள் (Global config + namespace)
window.JARVIS = window.JARVIS || {};

JARVIS.config = {
  appName: "JARVIS SECURITY AI",
  version: "0.1.0",
  defaultModel: "gemini-3.5-flash-lite", // Settings-ல் மாற்றலாம்
  apiBase: "https://generativelanguage.googleapis.com/v1beta/models/",
  maxHistory: 40,        // chat-ல் சேமிக்கும் அதிகபட்ச செய்திகள்
  autoLockSeconds: 60,   // app background-ல் இருந்தால் இத்தனை விநாடிக்குப் பின் lock
  systemPrompt:
    "You are JARVIS, a calm, intelligent, polite personal AI assistant for one private owner. " +
    "Reply in the same language the user writes in (Tamil or English). " +
    "Keep answers clear, short and practical. Never reveal or ask for passwords, PINs or API keys."
};

// எதிர்கால modules-ஐ இங்கே பதிவு செய்தால் dashboard-ல் தானாகத் தெரியும்.
// status: "live" = வேலை செய்கிறது, "soon" = இன்னும் கட்டப்படவில்லை
JARVIS.modules = [
  { id: "chat",     icon: "🧠", name: "AI Brain",     desc: "Gemini உடன் உரையாடல்",        status: "live", view: "chat" },
  { id: "memory",   icon: "🗂️", name: "Memory",       desc: "தனிப்பட்ட தகவல் சேமிப்பு & தேடல்", status: "live", view: "memory" },
  { id: "vault",    icon: "🔐", name: "File Vault",   desc: "பாதுகாப்பான ஆவணக் களஞ்சியம்",   status: "soon" },
  { id: "security", icon: "🛡️", name: "Security",     desc: "PIN, Biometric, Privacy",     status: "live", view: "settings" },
  { id: "voice",    icon: "🎙️", name: "Voice AI",     desc: "தமிழ்/English பெண் குரல்",       status: "soon" },
  { id: "wake",     icon: "👂", name: "Hey JARVIS",   desc: "Wake-word (திட்டமிடப்பட்டது)",  status: "soon" }
];
