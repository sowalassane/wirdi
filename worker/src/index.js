// Wirdî · serveur de notifications (Worker Cloudflare + base D1)
// - POST /api/push/sub    : enregistre ou met à jour un abonnement et ses réglages
// - POST /api/push/unsub  : supprime un abonnement
// - POST /api/push/test   : envoie tout de suite une notification d'essai
// - GET  /api/push/key    : clé publique VAPID (pour s'abonner depuis l'appli)
// - tâche planifiée chaque minute : envoie les notifications arrivées à échéance
import { sendPush } from "./webpush.js";
import { cleanCfg, nextEvent } from "./schedule.js";

const ORIGINS = /^https:\/\/(wirdi\.alatec\.fr|([a-z0-9-]+\.)?wirdi-291\.pages\.dev|sowalassane\.github\.io)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LATE = 20 * 60000; // au-delà de 20 min de retard, une notification n'a plus de sens : on passe à la suivante

function cors(req){
  const o = req.headers.get("Origin") || "";
  return ORIGINS.test(o) ? {"Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin"} : {};
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), {status, headers: Object.assign({"Content-Type": "application/json"}, cors(req))});
async function idOf(endpoint){
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  return Array.from(h.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
}
function validSub(s){
  return s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1024
    && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
}

async function upsert(env, sub, cfg){
  const id = await idOf(sub.endpoint), now = Date.now(), nx = nextEvent(cfg, now);
  await env.DB.prepare(
    "INSERT INTO subs (id, endpoint, p256dh, auth, cfg, next_at, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) " +
    "ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, cfg = ?5, next_at = ?6, updated = ?7, fails = 0"
  ).bind(id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, JSON.stringify(cfg), nx ? nx.at : null, now).run();
  return nx;
}

async function api(req, env, path){
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: cors(req)});
  if (path === "/api/push/key") return json(req, {key: env.VAPID_PUBLIC});
  if (req.method !== "POST") return json(req, {error: "method"}, 405);
  let body; try { body = await req.json(); } catch(e){ return json(req, {error: "json"}, 400); }
  const sub = body && body.sub;
  if (!validSub(sub)) return json(req, {error: "sub"}, 400);
  if (path === "/api/push/sub"){
    let cfg; try { cfg = cleanCfg(body.cfg); } catch(e){ return json(req, {error: "cfg"}, 400); }
    const nx = await upsert(env, sub, cfg);
    return json(req, {ok: true, next: nx ? {at: nx.at, title: nx.data.title} : null});
  }
  if (path === "/api/push/unsub"){
    await env.DB.prepare("DELETE FROM subs WHERE id = ?1").bind(await idOf(sub.endpoint)).run();
    return json(req, {ok: true});
  }
  if (path === "/api/push/test"){
    const row = await env.DB.prepare("SELECT id FROM subs WHERE id = ?1").bind(await idOf(sub.endpoint)).first();
    if (!row) return json(req, {error: "unknown"}, 404);
    const st = await sendPush({endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth},
      {title: "Wirdî · وِرْدِي", body: "Les notifications fonctionnent. Qu’Allah vous facilite votre wird.", tag: "test", open: "home"}, env, 600).catch(() => 0);
    return json(req, {ok: st >= 200 && st < 300, status: st});
  }
  return json(req, {error: "not found"}, 404);
}

async function tick(env){
  const now = Date.now();
  const {results} = await env.DB.prepare("SELECT * FROM subs WHERE next_at IS NOT NULL AND next_at <= ?1 ORDER BY next_at LIMIT 500").bind(now).all();
  await Promise.all(results.map(async r => {
    let cfg; try { cfg = JSON.parse(r.cfg); } catch(e){ return env.DB.prepare("DELETE FROM subs WHERE id = ?1").bind(r.id).run(); }
    let ev = nextEvent(cfg, r.next_at - 1);
    let fails = r.fails || 0;
    if (ev && now - ev.at <= LATE){
      try {
        const st = await sendPush(r, ev.data, env, 1800);
        if (st === 404 || st === 410) return env.DB.prepare("DELETE FROM subs WHERE id = ?1").bind(r.id).run();
        fails = st >= 200 && st < 300 ? 0 : fails + 1;
      } catch(e){ fails++; }
      if (fails >= 10) return env.DB.prepare("DELETE FROM subs WHERE id = ?1").bind(r.id).run();
    }
    const nx = nextEvent(cfg, ev ? Math.max(ev.at, now - LATE) : now);
    return env.DB.prepare("UPDATE subs SET next_at = ?2, fails = ?3 WHERE id = ?1").bind(r.id, nx ? nx.at : null, fails).run();
  }));
}

export default {
  async fetch(req, env){
    const path = new URL(req.url).pathname;
    if (path.startsWith("/api/push/")) {
      try { return await api(req, env, path); } catch(e){ return json(req, {error: "server"}, 500); }
    }
    return new Response("Wirdî · notifications", {status: 200});
  },
  async scheduled(event, env, ctx){ ctx.waitUntil(tick(env)); }
};
