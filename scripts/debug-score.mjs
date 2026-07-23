/**
 * Temporäres Diagnose-Skript: Punkte-Aufschlüsselung pro Träger für eine
 * gegebene Testeingabe. Lädt Träger + Einrichtungen wie /api/carriers,
 * rekonstruiert answers aus einem realen Lead und zeigt für jeden Träger,
 * welcher Scoring-Faktor wie viel beigetragen hat — inkl. Detail-Grund für
 * geoScore() (kein Traeger_Match-Treffer / Treffer ohne Koordinaten /
 * Treffer außerhalb Radius / keine Kandidaten-Koordinaten vorhanden).
 *
 * Duplizierte Logik: Die inneren Scoring-Funktionen in lib/matching.js
 * (salaryScore, cultureScore, regionMatchesPLZ, einrichtungenFuerTraeger,
 * resolveKununuScore, ...) sind nicht exportiert. Um eine echte
 * Faktor-für-Faktor-Aufschlüsselung zu bekommen, wird die Logik hier
 * repliziert. Als Absicherung gegen Drift wird am Ende JEDER Score gegen
 * matchCarriers() aus lib/matching.js (die echte, aktuelle Implementierung)
 * gegengeprüft — bei Abweichung wird das laut markiert.
 *
 * Nutzung: node scripts/debug-score.mjs
 * Voraussetzung: Dev-Server läuft auf http://localhost:3000 (npm run dev)
 */

const matchingModuleUrl = new URL("../lib/matching.js", import.meta.url);
const { matchCarriers, geoScore, parseRadiusKm } = await import(matchingModuleUrl);

const BASE_URL = "http://localhost:3000";

// ─── Testeingabe (aus dem realen Lead rekonstruiert) ────────────────────────
const LEAD_ANSWERS = {
  position: "pdl",
  gehalt: "60_70k",
  wechselbereitschaft: "aktiv_kurzfristig",
  dienstwagen: "nicht_relevant",
  plz: "95444", // Bayreuth
  pendelradius: "50", // Feld war im Lead leer, Code-Default ist 50
  wechselgrund: "zu_wenig_spielraum",
  // versorgungsform und traegerAusschluss fehlten im Lead-Datensatz
};

// Manuelle Koordinaten-Überschreibung für "was-wäre-wenn"-Tests (z.B. falls
// die echte PLZ ein Tippfehler war und du eine korrigierte PLZ testen willst).
// null = realistisches Verhalten nachstellen (siehe Geocoding-Check unten).
// Fallback, falls POSITIONSTACK_API_KEY lokal nicht gesetzt ist: reale
// Koordinaten für PLZ 95444 (Bayreuth), per Nominatim ermittelt.
const MANUAL_LAT_OVERRIDE = 49.9429498;
const MANUAL_LNG_OVERRIDE = 11.5769491;

// ─── Duplizierte interne Logik aus lib/matching.js (Stand 2026-07-17) ──────
const NIVEAU_MAP = {
  "hoch (premiumsegment)":               4,
  "überdurchschnittlich (konzern)":      4,
  "gut bis überdurchschnittlich":        3.5,
  "gut bis sehr gut":                    3.5,
  "überdurchschnittlich":                4,
  "mittel bis gut":                      2.5,
  "mittel (regional sehr unterschiedlich)": 2,
  "gut":                                 3,
  "mittel":                              2,
  "durchschnittlich":                    2,
  "niedrig":                             1,
  "unterdurchschnittlich":               1,
  "hoch":                                4,
};

const WUNSCH_MAP = {
  "unter_60k": 1,
  "60_70k": 2,
  "70_85k": 3,
  "ueber_85k": 4,
};

function salaryScore(gehalt, wunsch) {
  if (gehalt.includes("insolvenz")) return 0;

  const niveau = Object.entries(NIVEAU_MAP).find(([k]) => gehalt.includes(k))?.[1] ?? 2;
  const ziel = WUNSCH_MAP[wunsch] ?? 2;
  const diff = niveau - ziel;
  if (diff >= 0) return 20;
  return Math.max(-10, 20 + diff * 10);
}

function cultureScore(c, grund) {
  const kultur = (c["Unternehmenskultur"] || c["Fuehrungskultur"] || "").toLowerCase();
  const scores = {
    zu_wenig_spielraum: () => (kultur.includes("eigenverantwortung") || kultur.includes("dezentral")) ? 10 : 0,
    schlechte_kommunikation: () => (kultur.includes("transparent") || kultur.includes("flach")) ? 10 : 0,
    keine_wertschaetzung: () => (kultur.includes("wertschätzend") || kultur.includes("wertebasiert")) ? 10 : 0,
    kein_entwicklungspotenzial: () => (kultur.includes("entwicklung") || kultur.includes("karriere")) ? 10 : 0,
    instabile_fuehrung: () => (kultur.includes("stabil") || kultur.includes("etabliert")) ? 10 : 0,
    gehalt: () => 0,
  };
  return (scores[grund] ?? (() => 0))();
}

function regionMatchesPLZ(region, plz) {
  const plzNum = parseInt(plz, 10);
  const plzMap = [
    { range: [1000, 19999], labels: ["berlin", "brandenburg", "mecklenburg", "sachsen-anhalt"] },
    { range: [20000, 29999], labels: ["hamburg", "schleswig", "bremen", "niedersachsen"] },
    { range: [30000, 39999], labels: ["niedersachsen", "sachsen-anhalt"] },
    { range: [40000, 59999], labels: ["nrw", "nordrhein"] },
    { range: [60000, 69999], labels: ["hessen", "frankfurt"] },
    { range: [70000, 79999], labels: ["baden-württemberg", "stuttgart"] },
    { range: [80000, 89999], labels: ["bayern", "münchen"] },
    { range: [90000, 99999], labels: ["bayern", "franken"] },
  ];
  const match = plzMap.find((e) => plzNum >= e.range[0] && plzNum <= e.range[1]);
  if (!match) return false;
  return match.labels.some((l) => region.includes(l));
}

function parseKununuScore(raw) {
  if (!raw) return null;
  let parsed = parseFloat(String(raw).replace(",", "."));
  if (isNaN(parsed)) return null;
  if (parsed >= 10) parsed = parsed / 10;
  return parsed;
}

function extractKununuFromText(text) {
  if (!text) return null;
  const match = String(text).match(/Kununu[-\s]?Score:?\s*(\d+(?:[.,]\d+)?)/i);
  return match ? parseKununuScore(match[1]) : null;
}

function resolveKununuScore(c) {
  const direct = parseKununuScore(c["Kununu_Score"]);
  if (direct != null) return direct;
  return extractKununuFromText(c["Beschreibung_Public"]) ?? extractKununuFromText(c["Besonderheiten"]);
}

const KUNUNU_ANKER = [
  [1.0, -20],
  [3.0, 0],
  [3.4, 5],
  [3.8, 12],
  [4.2, 20],
  [5.0, 20],
];

function kununuContinuousScore(kununu) {
  if (kununu <= KUNUNU_ANKER[0][0]) return KUNUNU_ANKER[0][1];
  if (kununu >= KUNUNU_ANKER[KUNUNU_ANKER.length - 1][0]) return KUNUNU_ANKER[KUNUNU_ANKER.length - 1][1];
  for (let i = 0; i < KUNUNU_ANKER.length - 1; i++) {
    const [x0, y0] = KUNUNU_ANKER[i];
    const [x1, y1] = KUNUNU_ANKER[i + 1];
    if (kununu >= x0 && kununu <= x1) {
      const t = (kununu - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

const KUNUNU_HOHE_RELEVANZ = new Set([
  "zu_wenig_spielraum",
  "schlechte_kommunikation",
  "keine_wertschaetzung",
  "instabile_fuehrung",
]);

function kununuRelevanceMultiplier(wechselgrund) {
  return KUNUNU_HOHE_RELEVANZ.has(wechselgrund) ? 1.5 : 1.0;
}

const GENERIC_TRAEGER_ALIASES = {
  awo: "AWO (Arbeiterwohlfahrt)",
  diakonie: "Diakonie / Ev. Werk für Diakonie und Entwicklung",
  caritas: "Caritas (Caritasverband Deutschland)",
  drk: "DRK (Deutsches Rotes Kreuz)",
  asb: "ASB (Arbeiter-Samariter-Bund)",
  malteser: "Malteser Hilfsdienst gGmbH",
  johanniter: "Johanniter Seniorenhäuser GmbH",
};

function einrichtungenFuerTraeger(traegerName, einrichtungen) {
  const name = (traegerName || "").toLowerCase().trim();
  if (!name) return [];
  return einrichtungen.filter((e) => {
    const match = (e["Traeger_Match"] || "").toLowerCase().trim();
    if (!match) return false;
    const genericTarget = GENERIC_TRAEGER_ALIASES[match];
    if (genericTarget) return name === genericTarget.toLowerCase();
    return name.includes(match) || match.includes(name);
  });
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Erklärt, warum geoScore() das liefert, was es liefert.
function explainGeo(traegerName, einrichtungen, lat, lng, radiusKm) {
  if (lat == null || lng == null) {
    return { punkte: 0, grund: "Keine Kandidaten-Koordinaten vorhanden (Geocoding fehlgeschlagen/nicht gesetzt) → geoScore() gibt neutral 0 zurück, KEIN -30" };
  }
  const kandidaten = einrichtungenFuerTraeger(traegerName, einrichtungen);
  if (kandidaten.length === 0) {
    return { punkte: 0, grund: "Kein Traeger_Match-Eintrag in Einrichtungen-Tabelle gefunden (Datenlücke, neutral)" };
  }
  const mitKoord = kandidaten.filter((e) => e.Latitude != null && e.Longitude != null);
  if (mitKoord.length === 0) {
    return { punkte: 0, grund: `${kandidaten.length} Einrichtung(en) gefunden, aber keine hat Latitude/Longitude gesetzt (Datenlücke, neutral)` };
  }
  const distanzen = mitKoord.map((e) => haversineKm(lat, lng, parseFloat(e.Latitude), parseFloat(e.Longitude)));
  const minDistanz = Math.min(...distanzen);
  const distanzVerhaeltnis = minDistanz / radiusKm;
  if (distanzVerhaeltnis <= 1) {
    const punkte = 20 - distanzVerhaeltnis * 15;
    return { punkte, grund: `Nächste Einrichtung ${minDistanz.toFixed(1)} km entfernt, innerhalb Radius ${radiusKm} km (${(distanzVerhaeltnis * 100).toFixed(0)}% des Radius)` };
  }
  const punkte = -5 - Math.min(1, distanzVerhaeltnis - 1) * 25;
  return { punkte, grund: `Nächste Einrichtung ${minDistanz.toFixed(1)} km entfernt, AUSSERHALB Radius ${radiusKm} km (${(distanzVerhaeltnis * 100).toFixed(0)}% des Radius)` };
}

// Repliziert scoreCarrier() Schritt für Schritt mit Punkte-Label pro Faktor.
function scoreCarrierBreakdown(c, a, einrichtungen, radiusKm) {
  const steps = [];
  let score = 50;
  steps.push({ label: "Basis", punkte: 50 });

  const typ = (c["Traegertyp"] || "").toLowerCase();
  if (a.traegerAusschluss === "kein_privat" && typ.includes("privat")) return { total: 0, steps: [{ label: "HARD FILTER: Trägertyp-Ausschluss", punkte: -Infinity }], hardFiltered: true };
  if (a.traegerAusschluss === "kein_kirchlich" && typ.includes("kirchlich")) return { total: 0, steps: [{ label: "HARD FILTER: Trägertyp-Ausschluss", punkte: -Infinity }], hardFiltered: true };
  if (a.traegerAusschluss === "nur_kommunal" && !typ.includes("kommunal")) return { total: 0, steps: [{ label: "HARD FILTER: Trägertyp-Ausschluss", punkte: -Infinity }], hardFiltered: true };

  const dwTraeger = (c["Dienstwagen"] || c["Dienstwagen_Ja"] || "").toLowerCase();
  const dwHat = dwTraeger.includes("ja") || dwTraeger.includes("bestätigt");
  if (a.dienstwagen === "voraussetzung" && !dwHat) {
    return { total: 0, steps: [{ label: `HARD FILTER: Dienstwagen Voraussetzung nicht erfüllt (Dienstwagen-Feld: "${c["Dienstwagen"] || "-"}")`, punkte: -Infinity }], hardFiltered: true };
  }

  const vf = (c["Versorgungsform"] || "").toLowerCase();
  if (a.versorgungsform === "stationaer" && !vf.includes("stationär")) { score -= 20; steps.push({ label: "Versorgungsform stationär nicht erfüllt", punkte: -20 }); }
  if (a.versorgungsform === "ambulant" && !vf.includes("ambulant")) { score -= 20; steps.push({ label: "Versorgungsform ambulant nicht erfüllt", punkte: -20 }); }

  if (a.dienstwagen === "wuenschenswert" && dwHat) { score += 10; steps.push({ label: "Dienstwagen gewünscht + vorhanden", punkte: 10 }); }

  const gehalt = (c["Gehaltsniveau"] || c["Gehaltsinfo"] || "").toLowerCase();
  const sal = salaryScore(gehalt, a.gehalt);
  score += sal;
  steps.push({ label: `Gehaltsniveau (Träger: "${c["Gehaltsniveau"] || c["Gehaltsinfo"] || "-"}", gewünscht: ${a.gehalt || "-"})`, punkte: sal });

  const region = (c["Region"] || "").toLowerCase();
  if (region.includes("bundesweit")) { score += 10; steps.push({ label: `Region bundesweit ("${c["Region"]}")`, punkte: 10 }); }
  else if (a.plz && regionMatchesPLZ(region, a.plz)) { score += 15; steps.push({ label: `Region passt zur PLZ (${c["Region"]})`, punkte: 15 }); }
  else { steps.push({ label: `Region kein Treffer ("${c["Region"] || "-"}")`, punkte: 0 }); }

  const cult = cultureScore(c, a.wechselgrund);
  steps.push({ label: `Kulturmatch (Wechselgrund: ${a.wechselgrund || "-"})`, punkte: cult });
  score += cult;

  const geo = explainGeo(c["Traeger"], einrichtungen, a.lat, a.lng, radiusKm);
  score += geo.punkte;
  const geoUnbestaetigt = geo.punkte === 0;
  steps.push({ label: `Geo-Matching: ${geo.grund}`, punkte: geo.punkte });

  // Insolvenz-Hinweis: bewusst nicht im Score, nur informativ.

  const kununu = resolveKununuScore(c);
  if (kununu != null) {
    const multiplier = kununuRelevanceMultiplier(a.wechselgrund);
    const kununuPunkte = kununuContinuousScore(kununu) * multiplier;
    score += kununuPunkte;
    steps.push({ label: `Kununu-Bewertung (${kununu.toFixed(1)}, Relevanz-Multiplikator ${multiplier}x)`, punkte: kununuPunkte });
  }

  const intern = parseFloat(c["Interne_Bewertung"]);
  if (!isNaN(intern)) {
    const internPunkte = (intern - 3) * 7.5;
    score += internPunkte;
    steps.push({ label: `Interne Rehsearch-Bewertung (${intern})`, punkte: internPunkte });
  }

  const tarifbindung = (c["Tarifbindung"] || "").toLowerCase();
  if (tarifbindung) {
    const tarifPunkte = tarifbindung.includes("tarif") && !tarifbindung.includes("kein") ? 10 : -5;
    score += tarifPunkte;
    steps.push({ label: `Tarifvertrag ("${c["Tarifbindung"]}")`, punkte: tarifPunkte });
  }

  const obergrenze = geoUnbestaetigt ? 65 : 95;
  if (geoUnbestaetigt) steps.push({ label: `Obergrenze gedeckelt auf ${obergrenze}% (kein bestätigter Geo-Bezug)`, punkte: 0 });
  const clamped = Math.max(0, Math.min(obergrenze, score));
  return { total: clamped, rawTotal: score, steps, hardFiltered: false };
}

// ─── Ausführung ──────────────────────────────────────────────────────────────

console.log("=== Diagnose: Score-Aufschlüsselung ===\n");
console.log("Testeingabe (answers):", JSON.stringify(LEAD_ANSWERS, null, 2));

let lat = MANUAL_LAT_OVERRIDE;
let lng = MANUAL_LNG_OVERRIDE;

if (lat == null || lng == null) {
  try {
    const geoRes = await fetch(`${BASE_URL}/api/geocode?plz=${encodeURIComponent(LEAD_ANSWERS.plz)}`);
    if (geoRes.ok) {
      const geo = await geoRes.json();
      lat = geo.lat;
      lng = geo.lng;
      console.log(`\nGeocoding PLZ ${LEAD_ANSWERS.plz}: erfolgreich -> lat=${lat}, lng=${lng}`);
    } else {
      const err = await geoRes.json().catch(() => ({}));
      console.log(`\nGeocoding PLZ ${LEAD_ANSWERS.plz}: FEHLGESCHLAGEN (Status ${geoRes.status}, ${JSON.stringify(err)})`);
      console.log("-> Das ist vermutlich exakt das, was beim echten Lead passiert ist: PLZ 75569 ist");
      console.log("   in mehreren unabhängigen Postleitzahlen-Datenbanken (Nominatim, Zippopotam,");
      console.log("   OpenPLZ API) nicht auffindbar -- die PLZ scheint ungültig/ein Tippfehler zu sein.");
      console.log("   answers.lat/lng blieben beim echten Nutzer vermutlich undefined.");
      console.log("-> Damit gibt geoScore() für JEDEN Träger NEUTRAL 0 zurück, nicht -30!");
    }
  } catch (e) {
    console.log(`\nGeocoding-Request fehlgeschlagen: ${e.message}`);
  }
}

const answers = { ...LEAD_ANSWERS, lat, lng };
const radiusKm = parseRadiusKm(answers.pendelradius);
console.log(`\nradiusKm (aus pendelradius="${answers.pendelradius}"):`, radiusKm);

const carriersRes = await fetch(`${BASE_URL}/api/carriers`);
const { carriers, einrichtungen } = await carriersRes.json();
console.log(`\nGeladen: ${carriers.length} Träger, ${einrichtungen.length} Einrichtungen\n`);

const results = carriers.map((c) => {
  const breakdown = scoreCarrierBreakdown(c, answers, einrichtungen, radiusKm);
  return { carrier: c, ...breakdown };
});

// Cross-Check gegen die echte matchCarriers()-Implementierung
let mismatches = 0;
for (const r of results) {
  if (r.hardFiltered) continue;
  const real = matchCarriers([r.carrier], answers, einrichtungen);
  const realScore = real.length > 0 ? real[0].matchScore : 0;
  if (realScore !== r.total) {
    mismatches++;
    console.log(`⚠️  ABWEICHUNG bei "${r.carrier["Traeger"]}": Replik=${r.total}, echte matchCarriers()=${realScore}`);
  }
}
console.log(mismatches === 0
  ? "✓ Cross-Check OK: Replik-Score stimmt bei allen Trägern mit der echten matchCarriers()-Implementierung überein.\n"
  : `⚠️  ${mismatches} Abweichung(en) zwischen Replik und echter Implementierung gefunden (siehe oben) -- Replik-Logik in diesem Skript ist vermutlich veraltet.\n`);

// Geo-Statistik
const geoStats = {};
for (const r of results) {
  if (r.hardFiltered) continue;
  const geoStep = r.steps.find((s) => s.label.startsWith("Geo-Matching"));
  const key = geoStep ? `${geoStep.punkte}` : "?";
  geoStats[key] = (geoStats[key] || 0) + 1;
}
console.log("=== Geo-Score-Verteilung über alle Träger ===");
console.log(geoStats);
console.log();

// Top 10 nach Score
const top10 = [...results]
  .filter((r) => !r.hardFiltered)
  .sort((a, b) => b.total - a.total)
  .slice(0, 10);

console.log("=== Top 10 Träger nach Score ===\n");
for (const [i, r] of top10.entries()) {
  console.log(`#${i + 1} ${r.carrier["Traeger"]} — Score: ${r.total}${r.rawTotal !== r.total ? ` (roh: ${r.rawTotal}, gekappt auf 0-95)` : ""}`);
  for (const s of r.steps) {
    const sign = s.punkte > 0 ? "+" : "";
    console.log(`    ${sign}${s.punkte}  ${s.label}`);
  }
  console.log();
}

// Gezielte Einzel-Aufschlüsselung für einen bestimmten Träger (unabhängig vom Rang)
const GEZIELTER_TRAEGER = "Argentum Pflege Holding GmbH";
const gezielt = results.find((r) => r.carrier["Traeger"] === GEZIELTER_TRAEGER);
console.log(`=== Einzel-Aufschlüsselung: "${GEZIELTER_TRAEGER}" ===\n`);
if (!gezielt) {
  console.log("Träger nicht in den geladenen Daten gefunden.");
} else if (gezielt.hardFiltered) {
  console.log("Träger wurde durch einen Hard-Filter aussortiert (Score 0):", gezielt.steps[0].label);
} else {
  console.log(`Score: ${gezielt.total}${gezielt.rawTotal !== gezielt.total ? ` (roh: ${gezielt.rawTotal}, gekappt auf 0-95)` : ""}`);
  for (const s of gezielt.steps) {
    const sign = s.punkte > 0 ? "+" : "";
    console.log(`    ${sign}${s.punkte}  ${s.label}`);
  }
  const rang = [...results].filter((r) => !r.hardFiltered).sort((a, b) => b.total - a.total).findIndex((r) => r.carrier["Traeger"] === GEZIELTER_TRAEGER) + 1;
  console.log(`\nRang unter allen nicht hart-gefilterten Trägern: #${rang}`);
}
