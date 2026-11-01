JARVIS Voice Control Module
===========================

Included:
- js/voice.js: browser speech recognition + speech synthesis helper
- integration-snippet.txt: minimal HTML and JavaScript wiring examples

Important limitations:
- This is a browser module, not an Android-native always-on wake-word service.
- "Hey JARVIS" detection works only while speech recognition is actively running.
- Browsers may stop recognition when the tab is backgrounded, the screen is locked,
  the browser is closed, or the device applies battery restrictions.
- Microphone permission and a secure HTTPS origin are required.
- Speech recognition availability varies by browser/device and may use an online
  recognition service. Do not use it for highly sensitive conversations.
- The module does not automatically send speech to Gemini. The app must handle
  the `jarvis:voice-command` event and decide what to do with the recognized text.

Install:
1. Copy js/voice.js into your repository's js/ folder.
2. Add this script after the other JARVIS scripts, before </body>:
   <script src="js/voice.js"></script>
3. Add the example buttons from integration-snippet.txt to the desired screen.
4. Connect the `jarvis:voice-command` event to your existing chat submit logic.
   Inspect your current app.js/chat.js first; do not overwrite those files blindly.

If your current script paths are at the repository root rather than js/,
adjust the script path to match your actual folder structure.
