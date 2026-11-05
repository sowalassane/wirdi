// node test/schedule.test.mjs : vérifie l'enchaînement des notifications sur plusieurs jours
import assert from "node:assert";
import { cleanCfg, nextEvent, dayEvents } from "../src/schedule.js";

const cfg = cleanCfg({
  loc: {lat: 48.9234, lng: 2.1891, tz: "Europe/Paris", name: "Houilles"},
  pt: {method: "custom", fajr: 18, isha: 15, asr: 1, adj: {dhuhr: 1, maghrib: 3}, ishaMinTime: "19:20"},
  n: {pr: {fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true}, before: 0, matin: true, matinOff: 20, soir: true, soirOff: 0, kahf: true, blancs: true}
});
assert.strictEqual(cfg.loc.lat, 48.92);
// Enchaîne les notifications du 5 au 12 novembre 2026, comme le ferait la tâche planifiée
let t = Date.UTC(2026, 10, 5, 0, 0), seen = [], last = 0;
const fmt = ms => new Intl.DateTimeFormat("fr-FR", {weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris"}).format(ms);
while (true){
  const e = nextEvent(cfg, t); if (!e || e.at > Date.UTC(2026, 10, 12)) break;
  assert(e.at > last, "ordre"); last = e.at; t = e.at; seen.push(e);
  if (process.argv[2]) console.log(fmt(e.at), "|", e.data.title, "|", e.data.body);
}
const count = k => seen.filter(e => e.ev === k).length;
assert.strictEqual(count("pr-fajr"), 7); assert.strictEqual(count("matin"), 7); assert.strictEqual(count("soir"), 7);
assert.strictEqual(count("kahf"), 1); // vendredi 6 novembre
// Aucun rappel actif : pas d'échéance
assert.strictEqual(nextEvent(cleanCfg({loc: cfg.loc, n: {}}), Date.now()), null);
// Jours blancs : 3 rappels par mois hégirien
const b = cleanCfg({loc: cfg.loc, n: {blancs: true}});
let u = Date.UTC(2026, 0, 1), nb = 0;
for (;;){ const e = nextEvent(b, u); if (!e || e.at > Date.UTC(2026, 11, 31)) break; nb++; u = e.at; }
assert(nb >= 36 && nb <= 39, "jours blancs : " + nb);
assert.throws(() => cleanCfg({loc: {lat: 200, lng: 0}}));
console.log("ok : " + seen.length + " notifications sur une semaine, " + nb + " rappels de jours blancs en 2026");
