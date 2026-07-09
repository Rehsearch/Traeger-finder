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
  }));
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

  // Interne Bewertung (wenn vorhanden)
  const intern = parseFloat(c["Interne_Bewertung"]);
  if (!isNaN(intern)) score += (intern - 3) * 5; // 5: +10, 1: -10

  // Geo-Matching: Einrichtung im Pendelradius?
  const radiusKm = a.pendelradius === "999" ? Infinity : parseInt(a.pendelradius, 10) || 50;
  score += geoScore(c["Traeger"], einrichtungen, a.lat, a.lng, radiusKm);

  // Insolvenz-Warnung
  const besonderheiten = (c["Besonderheiten"] || "").toLowerCase();
  if (besonderheiten.includes("insolvenz")) score -= 25;

  return Math.max(0, Math.min(100, score));
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

function einrichtungenFuerTraeger(traegerName, einrichtungen) {
  const name = (traegerName || "").toLowerCase().trim();
  return einrichtungen.filter((e) => (e["Traeger_Match"] || "").toLowerCase().trim() === name);
}

export function geoScore(traegerName, einrichtungen, kandidatenLat, kandidatenLng, radiusKm) {
  if (kandidatenLat == null || kandidatenLng == null || !Array.isArray(einrichtungen)) return 0;

  const passende = einrichtungenFuerTraeger(traegerName, einrichtungen)
    .filter((e) => e.Latitude != null && e.Longitude != null)
    .map((e) => haversineKm(kandidatenLat, kandidatenLng, parseFloat(e.Latitude), parseFloat(e.Longitude)));

  if (passende.length === 0) return -30;

  const minDistanz = Math.min(...passende);
  return minDistanz <= radiusKm ? 20 : -30;
}

export function findNearestEinrichtung(traegerName, einrichtungen, kandidatenLat, kandidatenLng) {
  if (kandidatenLat == null || kandidatenLng == null || !Array.isArray(einrichtungen)) return null;

  const kandidaten = einrichtungenFuerTraeger(traegerName, einrichtungen)
    .filter((e) => e.Latitude != null && e.Longitude != null)
    .map((e) => ({
      name: e["Einrichtungsname"],
      distanceKm: haversineKm(kandidatenLat, kandidatenLng, parseFloat(e.Latitude), parseFloat(e.Longitude)),
    }));

  if (kandidaten.length === 0) return null;

  return kandidaten.sort((a, b) => a.distanceKm - b.distanceKm)[0];
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
