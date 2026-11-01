// JARVIS – Gemini AI Brain
// API key உங்கள் phone-ல் மட்டும் சேமிக்கப்படும். Key URL-ல் அல்ல, header-ல் அனுப்பப்படும்.
JARVIS.gemini = (function () {
  const S = JARVIS.storage;
  const C = JARVIS.config;

  const getKey = () => S.get("apiKey", "");
  const setKey = (k) => S.set("apiKey", k);
  const clearKey = () => S.remove("apiKey");
  const getModel = () => S.get("model", C.defaultModel);
  const setModel = (m) => S.set("model", m);

  function friendlyError(status, body) {
    const msg = (body && body.error && body.error.message) || "";
    if (status === 400 && /API key/i.test(msg)) return "API key தவறாக உள்ளது. Settings-ல் சரிபாருங்கள்.";
    if (status === 400) return "கோரிக்கையில் பிழை: " + msg;
    if (status === 403) return "API key-க்கு அனுமதி இல்லை. புதிய key உருவாக்கிப் பாருங்கள்.";
    if (status === 404) return "Model பெயர் கிடைக்கவில்லை. Settings-ல் model பெயரைச் சரிபாருங்கள்.";
    if (status === 429) return "இலவச வரம்பு தீர்ந்துவிட்டது. சிறிது நேரம் கழித்து முயலுங்கள்.";
    return "Gemini பிழை (" + status + "). " + msg;
  }

  // history: [{role:"user"|"ai", text:"..."}]
  async function ask(history, opts) {
    const key = getKey();
    if (!key) throw new Error("முதலில் Settings-ல் Gemini API key சேர்க்கவும்.");
    if (!navigator.onLine) throw new Error("Internet இல்லை. Offline-ல் AI பதில் சொல்ல முடியாது.");

    const contents = history.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    let sysText = C.systemPrompt;
    if (!(opts && opts.noMemory) && JARVIS.memory) {
      const lastUser = history.filter((m) => m.role === "user").pop();
      sysText += JARVIS.memory.contextFor(lastUser ? lastUser.text : "");
    }

    let res;
    try {
      res = await fetch(C.apiBase + encodeURIComponent(getModel()) + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sysText }] },
          contents: contents
        })
      });
    } catch (e) {
      throw new Error("Network பிழை. Internet-ஐச் சரிபாருங்கள்.");
    }

    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(friendlyError(res.status, data));

    const cand = data && data.candidates && data.candidates[0];
    const text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map((p) => p.text || "").join("")
      : "";
    if (!text) throw new Error("பதில் கிடைக்கவில்லை (Gemini தடுத்திருக்கலாம்). வேறு விதமாகக் கேளுங்கள்.");
    return text;
  }

  return { ask, getKey, setKey, clearKey, getModel, setModel };
})();
