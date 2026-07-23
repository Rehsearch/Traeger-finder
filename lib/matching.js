/**
 * Matching-Logik: Kandidaten-Antworten → Träger-Score
 * Reihenfolge: Hard-Filter zuerst, dann Punkte-Scoring
 */

export function matchCarriers(carriers, answers, einrichtungen = []) {
  const scoredAll = carriers.map((c) => ({ carrier: c, score: scoreCarrier(c, answers, einrichtungen) }));

  // Pro Trägername nur den besten Treffer behalten (Duplikate in Airtable möglich)
  const bestByName = new Map();
  for (const entry of scoredAll) {
    const name = (entry.carrier["Traeger"] || entry.carrier.id || "").toLowerCase().trim();
    if (!bestByName.has(name) || entry.score > bestByName.get(name).score) {
      bestByName.set(name, entry);
    }
  }

  const scored = [...bestByName.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ carrier, score }) => ({
    ...carrier,
    matchScore: score,
    matchLabel: score >= 80 ? "Sehr gute Übereinstimmung" : score >= 60 ? "Gute Übereinstimmung" : "Mögliche Übereinstimmung",
    hasDetailData: !!(carrier["Interne_Bewertung"] || carrier["Dienstwagen_Ja"]),
    nichtErfuellt: getNichtErfuellt(carrier, answers),
    erfuellt: getErfuellt(carrier, answers),
  }));
}

export function parseRadiusKm(pendelradius) {
  return pendelradius === "999" ? Infinity : parseInt(pendelradius, 10) || 50;
}

function scoreCarrier(c, a, einrichtungen = []) {
  let score = 50; // Basis

  // ─── HARD FILTER ──────────────────────────────────────────────
  // Trägertyp-Ausschluss
  const typ = (c["Traegertyp"] || "").toLowerCase();
  if (a.traegerAusschluss === "kein_privat" && typ.includes("privat")) return 0;
  if (a.traegerAusschluss === "kein_kirchlich" && typ.includes("kirchlich")) return 0;
  if (a.traegerAusschluss === "nur_kommunal" && !typ.includes("kommunal")) return 0;

  // Dienstwagen als Voraussetzung
  const dwTraeger = (c["Dienstwagen"] || c["Dienstwagen_Ja"] || "").toLowerCase();
  const dwHat     = dwTraeger.includes("ja") || dwTraeger.includes("bestätigt");
  if (a.dienstwagen === "voraussetzung" && !dwHat) return 0;

  // Versorgungsform (nur abwerten, nicht hart ausschließen)
  const vf = (c["Versorgungsform"] || "").toLowerCase();
  if (a.versorgungsform === "stationaer" && !vf.includes("stationär")) score -= 20;
  if (a.versorgungsform === "ambulant"   && !vf.includes("ambulant"))  score -= 20;

  // ─── SCORING ──────────────────────────────────────────────────
  // Dienstwagen gewünscht
  if (a.dienstwagen === "wuenschenswert" && dwHat) score += 10;

  // Gehaltsniveau
  const gehalt = (c["Gehaltsniveau"] || c["Gehaltsinfo"] || "").toLowerCase();
  score += salaryScore(gehalt, a.gehalt);

  // Region (einfaches Text-Matching)
  const region = (c["Region"] || "").toLowerCase();
  if (region.includes("bundesweit")) score += 10;
  else if (a.plz && regionMatchesPLZ(region, a.plz)) score += 15;

  // Wechselgrund → Kulturmatch
  score += cultureScore(c, a.wechselgrund);

  // Geo-Matching: Einrichtung im Pendelradius?
  const radiusKm = parseRadiusKm(a.pendelradius);
  const geoResult = geoScore(c["Traeger"], einrichtungen, a.lat, a.lng, radiusKm);
  score += geoResult;
  const geoUnbestaetigt = geoResult === 0;

  // Insolvenz-Warnung
  const besonderheiten = (c["Besonderheiten"] || "").toLowerCase();
  if (besonderheiten.includes("insolvenz")) score -= 25;

  // Kununu-Bewertung (stärker gespreizt, damit sich Träger deutlicher unterscheiden)
  const kununu = resolveKununuScore(c);
  if (kununu != null) {
    score += kununuContinuousScore(kununu) * kununuRelevanceMultiplier(a.wechselgrund);
  }

  // Interne Rehsearch-Bewertung (wenn vorhanden) — ±15 statt ±10
  const intern = parseFloat(c["Interne_Bewertung"]);
  if (!isNaN(intern)) score += (intern - 3) * 7.5; // 5: +15, 1: -15

  // Tarifvertrag
  const tarifbindung = (c["Tarifbindung"] || "").toLowerCase();
  if (tarifbindung) {
    if (tarifbindung.includes("tarif") && !tarifbindung.includes("kein")) score += 10;
    else score -= 5;
  }

  const obergrenze = geoUnbestaetigt ? 65 : 95;
  return Math.max(0, Math.min(obergrenze, score));
}

function parseKununuScore(raw) {
  if (!raw) return null;
  let parsed = parseFloat(String(raw).replace(",", "."));
  if (isNaN(parsed)) return null;
  // Airtable speichert den Score teils als ganze Zahl (z.B. 29 statt 2.9)
  if (parsed >= 10) parsed = parsed / 10;
  return parsed;
}

// Manche Träger haben kein eigenes Kununu_Score-Feld befüllt, obwohl der Wert
// bekannt ist — er steckt dann nur als Freitext in Beschreibung_Public oder
// Besonderheiten (z.B. "Kununu-Score: 2,6 / Weiterempfehlung: 42%"). Als Fallback
// wird dieser Text durchsucht, bevor der Score als "nicht vorhanden" gilt.
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

// Test (2026-07-10) — Träger "Argentum": kein Kununu_Score-Feld befüllt, Wert
// steckt nur als Freitext in Beschreibung_Public ("Kununu-Score: 2,6 / ...").
// Das war der eigentliche Bug: resolveKununuScore() lieferte vorher null, der
// Malus griff nie. Mit Freitext-Fallback + neutralen Kandidat-Antworten (answers
// = {}) ergibt matchCarriers([argentum], {}, []) jetzt: Score 30
// (50 Basis + 10 Region bundesweit + 20 Gehalt-Default - 25 Insolvenz
// - 20 Kununu <3.0 - 5 kein Tarifvertrag).

// Für die Anzeige im deutschen Komma-Format formatieren (z.B. 2.9 -> "2,9").
export function formatKununuScore(raw) {
  const parsed = parseKununuScore(raw);
  return parsed == null ? null : parsed.toFixed(1).replace(".", ",");
}

function getNichtErfuellt(c, a) {
  const reasons = [];

  const typ = (c["Traegertyp"] || "").toLowerCase();
  const traegertypAusgeschlossen =
    (a.traegerAusschluss === "kein_privat" && typ.includes("privat")) ||
    (a.traegerAusschluss === "kein_kirchlich" && typ.includes("kirchlich")) ||
    (a.traegerAusschluss === "nur_kommunal" && !typ.includes("kommunal"));
  if (traegertypAusgeschlossen) reasons.push("Trägertyp entspricht nicht deiner Präferenz");

  const dwTraeger = (c["Dienstwagen"] || c["Dienstwagen_Ja"] || "").toLowerCase();
  const dwHat     = dwTraeger.includes("ja") || dwTraeger.includes("bestätigt");
  if ((a.dienstwagen === "voraussetzung" || a.dienstwagen === "wuenschenswert") && !dwHat) {
    reasons.push("Kein Dienstwagen bestätigt");
  }

  const vf = (c["Versorgungsform"] || "").toLowerCase();
  if (a.versorgungsform === "stationaer" && !vf.includes("stationär")) reasons.push("Versorgungsform passt nicht optimal");
  if (a.versorgungsform === "ambulant"   && !vf.includes("ambulant"))  reasons.push("Versorgungsform passt nicht optimal");

  const region = (c["Region"] || "").toLowerCase();
  if (!region.includes("bundesweit") && a.plz && !regionMatchesPLZ(region, a.plz)) {
    reasons.push("Region möglicherweise nicht passend");
  }

  const gehalt = (c["Gehaltsniveau"] || c["Gehaltsinfo"] || "").toLowerCase();
  if (gehaltUnterVorstellung(gehalt, a.gehalt)) {
    reasons.push("Gehaltsniveau unter deiner Vorstellung");
  }

  return reasons;
}

function getErfuellt(c, a) {
  const reasons = [];

  const dwTraeger = (c["Dienstwagen"] || c["Dienstwagen_Ja"] || "").toLowerCase();
  const dwHat     = dwTraeger.includes("ja") || dwTraeger.includes("bestätigt");
  if ((a.dienstwagen === "voraussetzung" || a.dienstwagen === "wuenschenswert") && dwHat) {
    reasons.push("Dienstwagen vorhanden");
  }

  const vf = (c["Versorgungsform"] || "").toLowerCase();
  if (a.versorgungsform === "stationaer" && vf.includes("stationär")) reasons.push("Versorgungsform passend");
  if (a.versorgungsform === "ambulant"   && vf.includes("ambulant"))  reasons.push("Versorgungsform passend");

  const region = (c["Region"] || "").toLowerCase();
  if (region.includes("bundesweit") || (a.plz && regionMatchesPLZ(region, a.plz))) {
    reasons.push("Region passend");
  }

  const tarifbindung = (c["Tarifbindung"] || "").toLowerCase();
  if (tarifbindung.includes("tarif") && !tarifbindung.includes("kein")) {
    reasons.push("Tarifvertrag passend");
  }

  const gehalt = (c["Gehaltsniveau"] || c["Gehaltsinfo"] || "").toLowerCase();
  if (a.gehalt && !gehaltUnterVorstellung(gehalt, a.gehalt)) {
    reasons.push("Gehaltsniveau passend");
  }

  const kununu = resolveKununuScore(c);
  if (kununu != null && kununu >= 3.4) {
    reasons.push(`Gute Arbeitgeberbewertung (Kununu: ${kununu.toFixed(1).replace(".", ",")})`);
  }

  return reasons;
}

const NIVEAU_MAP = {
  "überdurchschnittlich": 3,
  "hoch":                 3,
  "gut":                  2,
  "mittel":               2,
  "durchschnittlich":     2,
  "niedrig":              1,
  "unterdurchschnittlich":1,
};

const WUNSCH_MAP = {
  "unter_60k": 1,
  "60_70k":    2,
  "70_85k":    3,
  "ueber_85k": 4,
};

function salaryScore(gehalt, wunsch) {
  const niveau = Object.entries(NIVEAU_MAP).find(([k]) => gehalt.includes(k))?.[1] ?? 2;
  const ziel   = WUNSCH_MAP[wunsch] ?? 2;
  if (niveau >= ziel)     return 20;
  if (niveau === ziel - 1) return 10;
  return 0;
}

function gehaltUnterVorstellung(gehalt, wunsch) {
  const niveau = Object.entries(NIVEAU_MAP).find(([k]) => gehalt.includes(k))?.[1] ?? 2;
  const ziel   = WUNSCH_MAP[wunsch] ?? 2;
  return niveau < ziel;
}

function cultureScore(c, grund) {
  const kultur = (c["Unternehmenskultur"] || c["Fuehrungskultur"] || "").toLowerCase();
  const scores = {
    zu_wenig_spielraum:    () => (kultur.includes("eigenverantwortung") || kultur.includes("dezentral")) ? 10 : 0,
    schlechte_kommunikation: () => (kultur.includes("transparent") || kultur.includes("flach"))          ? 10 : 0,
    keine_wertschaetzung:  () => (kultur.includes("wertschätzend") || kultur.includes("wertebasiert"))   ? 10 : 0,
    kein_entwicklungspotenzial: () => (kultur.includes("entwicklung") || kultur.includes("karriere"))    ? 10 : 0,
    instabile_fuehrung:    () => (kultur.includes("stabil") || kultur.includes("etabliert"))              ? 10 : 0,
    gehalt:                () => 0,
  };
  return (scores[grund] ?? (() => 0))();
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

// Bundesweite Dachverbände sind föderal organisiert: In der Einrichtungen-Tabelle
// steht bei vielen Häusern nur das bloße Dachverband-Kürzel (z.B. "AWO") statt des
// konkreten Regionalverbands. Ohne Einschränkung würde ein solches Kürzel per
// Substring-Match auf JEDEN Träger zutreffen, der das Kürzel im Namen trägt
// (z.B. alle 7 AWO-Regionalverbände in der Trägerdatenbank) — das erzeugt falsche
// Haus-zu-Träger-Zuordnungen. Ein bloßes Kürzel darf daher nur mit dem dafür
// vorgesehenen generischen Sammel-Träger matchen, nicht mit spezifischen
// Regionalverbänden. Sobald ein Haus in Airtable einen konkreten Regionalverbands-
// namen als Traeger_Match hinterlegt bekommt (z.B. "AWO Bezirksverband Baden e.V."),
// greift stattdessen das normale Substring-Matching darunter.
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
    if (genericTarget) {
      return name === genericTarget.toLowerCase();
    }

    return name.includes(match) || match.includes(name);
  });
}

export function geoScore(traegerName, einrichtungen, kandidatenLat, kandidatenLng, radiusKm) {
  if (kandidatenLat == null || kandidatenLng == null || !Array.isArray(einrichtungen)) return 0;

  const matched = einrichtungenFuerTraeger(traegerName, einrichtungen);
  if (matched.length === 0) return 0;

  const mitKoordinaten = matched.filter((e) => e.Latitude != null && e.Longitude != null);
  if (mitKoordinaten.length === 0) return 0;

  const distanzen = mitKoordinaten.map((e) =>
    haversineKm(kandidatenLat, kandidatenLng, parseFloat(e.Latitude), parseFloat(e.Longitude))
  );
  const minDistanz = Math.min(...distanzen);

  const distanzVerhaeltnis = minDistanz / radiusKm;
  if (distanzVerhaeltnis <= 1) {
    return 20 - distanzVerhaeltnis * 15;
  }
  return -5 - Math.min(1, distanzVerhaeltnis - 1) * 25;
}

export function findEinrichtungenImRadius(traegerName, einrichtungen, kandidatenLat, kandidatenLng, radiusKm) {
  if (kandidatenLat == null || kandidatenLng == null || !Array.isArray(einrichtungen)) return null;

  return einrichtungenFuerTraeger(traegerName, einrichtungen)
    .filter((e) => e.Latitude != null && e.Longitude != null)
    .map((e) => ({
      name: e["Einrichtungsname"],
      distanceKm: haversineKm(kandidatenLat, kandidatenLng, parseFloat(e.Latitude), parseFloat(e.Longitude)),
    }))
    .filter((e) => e.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);
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
