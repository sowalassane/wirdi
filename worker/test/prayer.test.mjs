// node test/prayer.test.mjs : vérifie que le calcul du serveur donne les mêmes heures que app.js
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert";
import { prayerTimes } from "../src/prayer.js";

const src = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const pick = (re) => { const m = src.match(re); assert(m, "introuvable : " + re); return m[0]; };
const code = [
  pick(/const METHODS = \{[\s\S]*?\n\};/), pick(/const dr = .*\n/), pick(/function sunPos\(jd\)\{[\s\S]*?\n\}\n/),
  pick(/function julian.*\n/), pick(/function tzOffset\(tz, date\)\{[\s\S]*?\n\}\n/), pick(/function prayerTimes\([\s\S]*?\n  return out;\n\}\n/),
  "this.app = prayerTimes;"
].join("\n");
const ctx = {Intl, Date, Math}; vm.createContext(ctx); vm.runInContext(code, ctx);

const locs = [{lat: 48.92, lng: 2.19, tz: "Europe/Paris"}, {lat: 14.72, lng: -17.47, tz: "Africa/Dakar"}, {lat: 59.33, lng: 18.07, tz: "Europe/Stockholm"}, {lat: 45.5, lng: -73.57, tz: "America/Toronto"}];
const Ps = [
  {method: "custom", fajr: 18, isha: 15, asr: 1, adj: {fajr: 0, sunrise: 0, dhuhr: 1, asr: 0, maghrib: 3, isha: 0}, ishaMinTime: "19:20"},
  {method: "uoif", fajr: 18, isha: 15, asr: 2, adj: {fajr: -2, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 5}, ishaMinTime: ""},
  {method: "makkah", fajr: 18, isha: 15, asr: 1, adj: {}, ishaMinTime: ""}
];
let n = 0;
for (const loc of locs) for (const P of Ps) for (let i = 0; i < 366; i += 7){
  const d = new Date(Date.UTC(2026, 0, 1 + i)), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
  const a = ctx.app(y, m, dd, loc, P), b = prayerTimes(y, m, dd, loc, P);
  for (const k in a){ assert.strictEqual(+a[k], +b[k], k + " " + y + "-" + m + "-" + dd); n++; }
}
console.log("ok : " + n + " horaires identiques entre app.js et le serveur");
