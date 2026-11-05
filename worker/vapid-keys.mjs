// Génère une paire de clés VAPID pour les notifications : node vapid-keys.mjs
const k = await crypto.subtle.generateKey({name: "ECDSA", namedCurve: "P-256"}, true, ["sign"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url");
const jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
console.log("Clé publique (VAPID_PUBLIC, dans wrangler.toml) :\n" + pub + "\n");
console.log("Clé privée (secret VAPID_PRIVATE, à garder pour vous) :\n" + jwk.d);
