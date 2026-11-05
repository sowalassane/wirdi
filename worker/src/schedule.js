// Calcule la prochaine notification d'un abonné à partir de ses réglages (ville, méthode de calcul, choix des rappels)
import { prayerTimes, tzOffset, locDateParts } from "./prayer.js";

export const PR = {fajr: ["Fajr", "الفجر"], dhuhr: ["Dhuhr", "الظهر"], asr: ["Asr", "العصر"], maghrib: ["Maghrib", "المغرب"], isha: ["Isha", "العشاء"]};
const BEFORE = [0, 5, 10, 15, 20, 30, 45, 60];
const num = (v, lo, hi, def) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; };
const bool = (v, def) => typeof v === "boolean" ? v : def;

// Nettoie la configuration envoyée par l'appli (ne garde que les champs attendus, bornés)
export function cleanCfg(c){
  c = c && typeof c === "object" ? c : {};
  const l = c.loc || {}, p = c.pt || {}, n = c.n || {};
  const lat = +l.lat, lng = +l.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("loc");
  let tz = typeof l.tz === "string" && l.tz.length < 64 ? l.tz : "UTC";
  try { new Intl.DateTimeFormat("en-US", {timeZone: tz}); } catch(e){ tz = "UTC"; }
  const adj = {}, pr = {};
  for (const k of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) adj[k] = Math.round(num((p.adj || {})[k], -60, 60, 0));
  for (const k in PR) pr[k] = bool((n.pr || {})[k], false);
  return {
    loc: {lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, tz, name: typeof l.name === "string" ? l.name.slice(0, 60) : ""},
    pt: {
      method: ["custom", "uoif", "paris", "mwl", "isna", "egypt", "makkah"].includes(p.method) ? p.method : "custom",
      fajr: num(p.fajr, 10, 20, 18), isha: num(p.isha, 10, 20, 15), asr: +p.asr === 2 ? 2 : 1, adj,
      ishaMinTime: /^\d{1,2}:\d{2}$/.test(p.ishaMinTime || "") ? p.ishaMinTime : ""
    },
    n: {
      pr, before: BEFORE.includes(+n.before) ? +n.before : 0,
      matin: bool(n.matin, false), matinOff: Math.round(num(n.matinOff, 0, 120, 20)),
      soir: bool(n.soir, false), soirOff: Math.round(num(n.soirOff, 0, 120, 20)),
      kahf: bool(n.kahf, false), blancs: bool(n.blancs, false)
    }
  };
}

const hhmm = (dt, tz) => new Intl.DateTimeFormat("fr-FR", {hour: "2-digit", minute: "2-digit", timeZone: tz}).format(dt);
const at = (y, m, d, h, mi, tz) => { const off = tzOffset(tz, new Date(Date.UTC(y, m - 1, d, 12))); return new Date(Date.UTC(y, m - 1, d, h, mi) - off * 3600000); };
function hijri(y, m, d){
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const p = new Intl.DateTimeFormat("fr-FR-u-ca-islamic-umalqura", {day: "numeric", month: "long", timeZone: "UTC"}).formatToParts(dt);
  return {day: +p.find(x => x.type === "day").value, month: ((p.find(x => x.type === "month") || {}).value || "").replace(/^./, c => c.toUpperCase())};
}

// (les quelques millisecondes ajoutées départagent deux rappels prévus à la même minute)
// Toutes les notifications prévues pour le jour civil y-m-d (heure locale de la ville)
export function dayEvents(cfg, y, m, d){
  const {loc, pt, n} = cfg, tz = loc.tz, out = [];
  const T = prayerTimes(y, m, d, loc, pt);
  const where = loc.name ? " à " + loc.name.replace(/\s*\(ma position\)$/, "") : "";
  for (const k in PR){
    if (!n.pr[k]) continue;
    const [fr, ar] = PR[k], t = T[k];
    out.push({at: t.getTime() - n.before * 60000, ev: "pr-" + k, data: n.before
      ? {title: fr + " dans " + n.before + " min · " + ar, body: "Prière de " + fr + " à " + hhmm(t, tz) + where + ".", tag: "pr-" + k, open: "pray"}
      : {title: fr + " · " + ar + " · " + hhmm(t, tz), body: "C’est l’heure de la prière" + where + ".", tag: "pr-" + k, open: "pray"}});
  }
  if (n.matin) out.push({at: T.fajr.getTime() + n.matinOff * 60000 + 1, ev: "matin", data: {title: "Invocations du matin", body: "أذكار الصباح · Prenez quelques minutes pour vos adhkâr du matin.", tag: "matin", open: "matin"}});
  if (n.soir) out.push({at: T.asr.getTime() + n.soirOff * 60000 + 2, ev: "soir", data: {title: "Invocations du soir", body: "أذكار المساء · Prenez quelques minutes pour vos adhkâr du soir.", tag: "soir", open: "soir"}});
  if (n.kahf && new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5)
    out.push({at: at(y, m, d, 10, 0, tz).getTime() + 3, ev: "kahf", data: {title: "Vendredi : sourate Al-Kahf", body: "سورة الكهف · Il est recommandé de lire la sourate Al-Kahf le vendredi.", tag: "kahf", open: "kahf"}});
  if (n.blancs){
    // La veille au soir des 13, 14 et 15 du mois hégirien (calendrier Umm al-Qura), pour penser au jeûne
    const tm = new Date(Date.UTC(y, m - 1, d + 1, 12)), h = hijri(tm.getUTCFullYear(), tm.getUTCMonth() + 1, tm.getUTCDate());
    if (h.day >= 13 && h.day <= 15)
      out.push({at: at(y, m, d, 21, 0, tz).getTime() + 4, ev: "blanc", data: {title: "Demain : jour blanc (" + h.day + " " + h.month + ")", body: "الأيام البيض · Jeûne recommandé les 13, 14 et 15 du mois hégirien.", tag: "blanc", open: "home"}});
  }
  return out.sort((a, b) => a.at - b.at);
}

// Première notification strictement après `after` (ms), cherchée sur 40 jours ; null si aucune n'est activée
export function nextEvent(cfg, after){
  const [y, m, d] = locDateParts(cfg.loc, new Date(after - 86400000));
  for (let i = 0; i < 40; i++){
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const e = dayEvents(cfg, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()).find(x => x.at > after);
    if (e) return e;
  }
  return null;
}
