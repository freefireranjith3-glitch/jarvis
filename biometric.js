// JARVIS – Biometric (கைரேகை / முக அடையாளம்)
// Phone-ன் உண்மையான அங்கீகார அமைப்பை (WebAuthn, "platform authenticator") பயன்படுத்துகிறது.
// உங்கள் கைரேகைத் தரவு JARVIS-க்கோ browser-க்கோ கிடைக்காது; phone மட்டுமே சரிபார்க்கும்.
// JARVIS செய்வது: phone கையொப்பமிட்ட பதிலை (signature) உள்ளூரிலேயே சரிபார்ப்பது –
//   சரியான சாவி, சரியான challenge, சரியான site, மற்றும் "user verification" (கைரேகை/PIN உறுதி) நடந்ததா என்று.
// வரம்பு: இது App PIN திரையைத் திறக்க மட்டும். File Vault-ஐ இது திறக்காது (Vault-க்கு கடவுச்சொல் தேவை).
//   Server இல்லாததால், இது சாதாரணமாக உங்கள் phone-ஐ எடுப்பவரைத் தடுக்கும்; developer tools-உடன் code-ஐ மாற்றும் தாக்குதலைத் தடுக்காது.
JARVIS.biometric = (function () {
  const S = JARVIS.storage;
  const KEY = "bio";
  let supported = false;

  /* ---------- helpers ---------- */
  const b64uEnc = (buf) => {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b64uDec = (str) => {
    str = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  const eq = (a, b) => {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  };

  // WebAuthn கையொப்பம் DER வடிவில் வரும்; WebCrypto raw (r||s, 64 bytes) கேட்கும்
  function derToRaw(der) {
    const b = new Uint8Array(der);
    if (b[0] !== 0x30) throw new Error("bad der");
    let i = 2;
    if (b[1] & 0x80) i = 2 + (b[1] & 0x7f);
    const readInt = () => {
      if (b[i] !== 0x02) throw new Error("bad der");
      const len = b[i + 1];
      let v = b.slice(i + 2, i + 2 + len);
      i += 2 + len;
      while (v.length > 32 && v[0] === 0) v = v.slice(1);
      if (v.length > 32) throw new Error("bad der");
      const out = new Uint8Array(32);
      out.set(v, 32 - v.length);
      return out;
    };
    const r = readInt();
    const s = readInt();
    const raw = new Uint8Array(64);
    raw.set(r, 0);
    raw.set(s, 32);
    return raw;
  }

  // phone அளித்த பதிலைச் சரிபார்த்தல் (DOM தேவையில்லை – சோதிக்கக்கூடியது)
  async function verifyAssertion(p) {
    // p: { pubKeySpki, rpId, origin, challenge(Uint8Array), authData, clientDataJSON, signature }
    const cd = JSON.parse(new TextDecoder().decode(p.clientDataJSON));
    if (cd.type !== "webauthn.get") return false;
    if (cd.origin !== p.origin) return false;
    if (!eq(b64uDec(cd.challenge), p.challenge)) return false;

    const ad = new Uint8Array(p.authData);
    if (ad.length < 37) return false;
    const rpHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p.rpId)));
    if (!eq(ad.slice(0, 32), rpHash)) return false;
    const flags = ad[32];
    if (!(flags & 0x01)) return false; // user present
    if (!(flags & 0x04)) return false; // user verified (கைரேகை / screen lock)

    const cdHash = new Uint8Array(await crypto.subtle.digest("SHA-256", p.clientDataJSON));
    const signed = new Uint8Array(ad.length + 32);
    signed.set(ad, 0);
    signed.set(cdHash, ad.length);

    const pub = await crypto.subtle.importKey("spki", p.pubKeySpki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, derToRaw(p.signature), signed);
  }

  /* ---------- public ---------- */
  async function init() {
    try {
      supported = !!(window.PublicKeyCredential && navigator.credentials &&
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (e) { supported = false; }
    return supported;
  }

  const isSupported = () => supported;
  const isEnrolled = () => !!S.get(KEY, null);
  function remove() { S.remove(KEY); }

  function explain(e) {
    const n = e && e.name;
    if (n === "NotAllowedError") return "ரத்து செய்யப்பட்டது அல்லது அடையாளம் உறுதியாகவில்லை.";
    if (n === "InvalidStateError") return "இந்தச் சாதனத்தில் ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது.";
    if (n === "NotSupportedError") return "இந்த phone இதை ஆதரிக்கவில்லை.";
    if (n === "SecurityError") return "பாதுகாப்பான (https) முகவரியில் மட்டுமே வேலை செய்யும்.";
    return "கைரேகை பிழை. மீண்டும் முயலுங்கள்.";
  }

  // பதிவு செய்தல்: { ok:true } அல்லது { ok:false, error:"..." }
  async function enroll() {
    if (!supported) return { ok: false, error: "இந்த phone-ல் கைரேகை / screen-lock அடையாளம் கிடைக்கவில்லை. Phone Settings-ல் கைரேகை அமைத்துள்ளீர்களா?" };
    try {
      const rpId = location.hostname;
      const cred = await navigator.credentials.create({
        publicKey: {
          rp: { name: "JARVIS", id: rpId },
          user: { id: rand(16), name: "jarvis-owner", displayName: "JARVIS Owner" },
          challenge: rand(32),
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
          attestation: "none",
          timeout: 60000
        }
      });
      const r = cred && cred.response;
      if (!r || !r.getPublicKey || !r.getPublicKey()) return { ok: false, error: "இந்த Chrome பதிப்பு தேவையான வசதியை வழங்கவில்லை." };
      if (r.getPublicKeyAlgorithm && r.getPublicKeyAlgorithm() !== -7) return { ok: false, error: "இந்த phone-ன் சாவி வகை ஆதரிக்கப்படவில்லை." };
      S.set(KEY, { id: b64uEnc(cred.rawId), pub: b64uEnc(r.getPublicKey()), rpId: rpId, created: Date.now() });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: explain(e) };
    }
  }

  // அங்கீகாரம்: { ok:true } அல்லது { ok:false, error }
  async function authenticate() {
    const rec = S.get(KEY, null);
    if (!rec) return { ok: false, error: "கைரேகை இயக்கப்படவில்லை." };
    try {
      const challenge = rand(32);
      const a = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          rpId: rec.rpId,
          allowCredentials: [{ type: "public-key", id: b64uDec(rec.id), transports: ["internal"] }],
          userVerification: "required",
          timeout: 60000
        }
      });
      if (!a || b64uEnc(a.rawId) !== rec.id) return { ok: false, error: "அடையாளம் பொருந்தவில்லை." };
      const ok = await verifyAssertion({
        pubKeySpki: b64uDec(rec.pub),
        rpId: rec.rpId,
        origin: location.origin,
        challenge: challenge,
        authData: a.response.authenticatorData,
        clientDataJSON: a.response.clientDataJSON,
        signature: a.response.signature
      });
      return ok ? { ok: true } : { ok: false, error: "அடையாளச் சரிபார்ப்பு தோல்வி." };
    } catch (e) {
      return { ok: false, error: explain(e) };
    }
  }

  return { init: init, isSupported: isSupported, isEnrolled: isEnrolled, enroll: enroll, authenticate: authenticate, remove: remove, _verify: verifyAssertion, _derToRaw: derToRaw };
})();
