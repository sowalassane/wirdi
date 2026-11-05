// Envoi de notifications Web Push sans dépendance : chiffrement aes128gcm (RFC 8291) et signature VAPID (RFC 8292),
// avec l'API WebCrypto disponible dans les Workers Cloudflare (et dans Node 20+ pour les tests).

const te = new TextEncoder();

export function b64u(buf){
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(s){
  s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts){
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0;
  for (const p of parts){ out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt, ikm, info, bytes){
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name: "HKDF", hash: "SHA-256", salt, info}, k, bytes * 8));
}

// Chiffre `payload` (texte) pour l'abonnement {p256dh, auth} ; renvoie le corps binaire de la requête
export async function encrypt(payload, p256dh, auth, opts = {}){
  const uaPub = unb64u(p256dh), authSecret = unb64u(auth);
  const local = opts.localKeys || await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, {name: "ECDH", namedCurve: "P-256"}, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({name: "ECDH", public: uaKey}, local.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(te.encode(payload), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv: nonce}, key, plain));
  const rs = 4096, head = new Uint8Array(21);
  head.set(salt, 0); new DataView(head.buffer).setUint32(16, rs); head[20] = asPub.length;
  return concat(head, asPub, ct);
}

// Clé privée VAPID : `d` en base64url ; clé publique : point non compressé (65 octets) en base64url
async function vapidKey(pub, priv){
  const p = unb64u(pub);
  return crypto.subtle.importKey("jwk", {kty: "EC", crv: "P-256", x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), d: priv, ext: true}, {name: "ECDSA", namedCurve: "P-256"}, false, ["sign"]);
}
export async function vapidAuth(endpoint, pub, priv, subject){
  const aud = new URL(endpoint).origin;
  const h = b64u(te.encode(JSON.stringify({typ: "JWT", alg: "ES256"})));
  const c = b64u(te.encode(JSON.stringify({aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject})));
  const sig = await crypto.subtle.sign({name: "ECDSA", hash: "SHA-256"}, await vapidKey(pub, priv), te.encode(h + "." + c));
  return "vapid t=" + h + "." + c + "." + b64u(sig) + ", k=" + pub;
}

// Envoie une notification ; renvoie le statut HTTP du service push (201 = OK, 404/410 = abonnement expiré)
export async function sendPush(sub, data, env, ttl = 3600){
  const body = await encrypt(JSON.stringify(data), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": String(ttl), "Urgency": "high",
      "Authorization": await vapidAuth(sub.endpoint, env.VAPID_PUBLIC, env.VAPID_PRIVATE, env.VAPID_SUBJECT || "https://wirdi.alatec.fr")
    },
    body
  });
  return res.status;
}
