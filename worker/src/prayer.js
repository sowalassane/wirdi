// Calcul des horaires de prière : COPIE EXACTE des fonctions de app.js (METHODS, sunPos, julian, tzOffset, prayerTimes, locDateParts).
// Si vous modifiez le calcul dans app.js, recopiez-le ici (le test worker/test/prayer.test.mjs vérifie que les deux donnent les mêmes heures).

export const METHODS = {
 custom: {fajr: 18, isha: 15},
 uoif: {fajr: 12, isha: 12},
 paris: {fajr: 18, isha: 18},
 mwl: {fajr: 18, isha: 17},
 isna: {fajr: 15, isha: 15},
 egypt: {fajr: 19.5, isha: 17.5},
 makkah: {fajr: 18.5, ishaMin: 90}
};

const dr = d => d * Math.PI / 180, rd = r => r * 180 / Math.PI;
function sunPos(jd){
  const D = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * D) % 360, q = (280.459 + 0.98564736 * D) % 360;
  const L = (q + 1.915 * Math.sin(dr(g)) + 0.020 * Math.sin(dr(2 * g))) % 360;
  const e = 23.439 - 0.00000036 * D;
  let RA = rd(Math.atan2(Math.cos(dr(e)) * Math.sin(dr(L)), Math.cos(dr(L)))) / 15;
  RA = ((RA % 24) + 24) % 24;
  const decl = rd(Math.asin(Math.sin(dr(e)) * Math.sin(dr(L))));
  let eqt = q / 15 - RA; eqt = ((eqt + 12) % 24 + 24) % 24 - 12;
  return {decl, eqt};
}
function julian(y, m, d){ if (m <= 2){ y -= 1; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; }
function tzOffset(tz, date){
  try {
    const p = new Intl.DateTimeFormat("en-US", {timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"}).formatToParts(date);
    const g = t => +p.find(x => x.type === t).value;
    return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - Math.floor(date.getTime() / 60000) * 60000) / 3600000;
  } catch(e){ return -date.getTimezoneOffset() / 60; }
}
// Renvoie les horaires (objets Date) pour la date civile y-m-d au lieu donné
function prayerTimes(y, m, d, loc, P){
  const lat = loc.lat, lng = loc.lng;
  const M = METHODS[P.method] || METHODS.custom;
  const fa = P.method === "custom" ? +P.fajr : M.fajr, ia = P.method === "custom" ? +P.isha : M.isha;
  const jd = julian(y, m, d) - lng / (15 * 24);
  const mid = t => (12 - sunPos(jd + t).eqt + 24) % 24;
  const at = (a, t, ccw) => {
    const s = sunPos(jd + t);
    const v = (-Math.sin(dr(a)) - Math.sin(dr(s.decl)) * Math.sin(dr(lat))) / (Math.cos(dr(s.decl)) * Math.cos(dr(lat)));
    if (v < -1 || v > 1) return NaN;
    const T = rd(Math.acos(v)) / 15;
    return mid(t) + (ccw ? -T : T);
  };
  const asrT = (f, t) => { const s = sunPos(jd + t); return at(-rd(Math.atan(1 / (f + Math.tan(dr(Math.abs(lat - s.decl)))))), t, false); };
  const t = {fajr: at(fa, 5 / 24, true), sunrise: at(0.833, 6 / 24, true), dhuhr: mid(12 / 24), asr: asrT(+P.asr || 1, 13 / 24), maghrib: at(0.833, 18 / 24, false)};
  t.isha = M.ishaMin ? t.maghrib + M.ishaMin / 60 : at(ia, 18 / 24, false);
  // Hautes latitudes : méthode des angles (portion de la nuit)
  const night = 24 - (t.maghrib - t.sunrise);
  const fp = fa / 60 * night, ip = (M.ishaMin ? 0 : ia / 60 * night);
  if (isNaN(t.fajr) || t.sunrise - t.fajr > fp) t.fajr = t.sunrise - fp;
  if (!M.ishaMin && (isNaN(t.isha) || t.isha - t.maghrib > ip)) t.isha = t.maghrib + ip;
  const tz = loc.tz ? tzOffset(loc.tz, new Date(Date.UTC(y, m - 1, d, 12))) : -new Date(y, m - 1, d, 12).getTimezoneOffset() / 60;
  const out = {};
  for (const k in t){
    let h = t[k] + tz - lng / 15;
    let mins = Math.round(h * 60) + (+P.adj[k] || 0);
    if (k === "isha" && P.method === "custom" && /^\d{1,2}:\d{2}$/.test(P.ishaMinTime || "")){
      const [hh, mm] = P.ishaMinTime.split(":").map(Number); mins = Math.max(mins, hh * 60 + mm);
    }
    out[k] = new Date(Date.UTC(y, m - 1, d) + (mins - tz * 60) * 60000);
  }
  return out;
}
function locDateParts(loc, base){
  try {
    const p = new Intl.DateTimeFormat("en-CA", {timeZone: loc.tz || undefined, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(base);
    const g = t => +p.find(x => x.type === t).value; return [g("year"), g("month"), g("day")];
  } catch(e){ return [base.getFullYear(), base.getMonth() + 1, base.getDate()]; }
}

export { prayerTimes, tzOffset, locDateParts };
