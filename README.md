# JARVIS SECURITY AI – v0.1

## இது என்ன?
Android phone-ல் install செய்யக்கூடிய தனிப்பட்ட AI உதவியாளர் (PWA). இலவச தொழில்நுட்பங்கள் மட்டுமே.

## Folder அமைப்பு (Architecture)
```
jarvis/
├─ index.html        ← திரைகள் (Home, Chat, Settings, Lock)
├─ style.css         ← நீல holographic வடிவமைப்பு
├─ manifest.json     ← "Add to Home screen" தகவல்
├─ sw.js             ← Offline-ல் app திறக்க உதவும்
├─ icons/            ← app icons
└─ js/
   ├─ config.js      ← அமைப்புகள் + Modules பட்டியல் (புதிய module இங்கே சேர்க்கவும்)
   ├─ storage.js     ← phone-ல் data சேமிப்பு (Memory/Vault பின்னர் பயன்படுத்தும்)
   ├─ security.js    ← PIN lock (PBKDF2 hash)
   ├─ gemini.js      ← AI Brain (Gemini)
   ├─ chat.js        ← Chat திரை
   ├─ dashboard.js   ← Home dashboard
   └─ app.js         ← எல்லாவற்றையும் இணைக்கும் மையம்
```
எதிர்கால modules: `js/memory.js`, `js/vault.js`, `js/voice.js`, `js/wake.js` என்று தனி file ஆகச் சேர்த்து, `config.js`-ல் `status:"live"` என மாற்றினால் போதும்.

## தற்போது உண்மையாக வேலை செய்வது
- Gemini chat (உங்கள் இலவச API key)
- Futuristic dashboard (கடிகாரம், நிலை, modules)
- PIN lock: PBKDF2 hash, 5 தவறுக்குப் பின் 30 விநாடி தடை, background-ல் 60 விநாடிக்குப் பின் தானாகப் பூட்டு
- Offline-ல் app திறக்கும்; chat வரலாறு phone-ல் இருக்கும்

## இன்னும் இல்லாதவை (நேர்மையாக)
- Memory, File Vault, Voice, Hey JARVIS, Biometric – "விரைவில்" எனக் குறிக்கப்பட்டுள்ளன, போலி செயல்பாடு இல்லை.
- PIN தற்போது திரையை மட்டும் பூட்டுகிறது; data encryption Vault கட்டத்தில் வரும்.
- API key phone-ன் browser storage-ல் உள்ளது (குறியாக்கம் இல்லை). Phone-ஐ மற்றவர்களுடன் பகிர வேண்டாம்.

## API key பாதுகாப்பு
Key code-ல் எழுதப்படவில்லை. GitHub-ல் upload செய்யும்போது உங்கள் key அதில் இருக்காது.
