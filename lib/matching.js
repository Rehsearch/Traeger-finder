/**
 * Matching-Logik: Kandidaten-Antworten → Träger-Score
 * Reihenfolge: Hard-Filter zuerst, dann Punkte-Scoring
 */

export function matchCarriers(carriers, answers) {
  const scored = carriers
    .map((c) => ({ carrier: c, score: scoreCarrier(c, answers) }))
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ carrier, score }) => ({
    ...carrier,
    matchScore: score,
    matchLabel: score >= 80 ? "Sehr gute Übereinstimmung" : score >= 60 ? "Gute Übereinstimmung" : "Mögliche Übereinstimmung",
    hasDetailData: !!(carrier["Interne_Bewertung"] || carrier["Dienstwagen_Ja"]),
  }));
}

function scoreCarrier(c, a) {
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

  return Math.max(0, Math.min(100, score));
}

function salaryScore(gehalt, wunsch) {
  const niveauMap = {
    "überdurchschnittlich": 3,
    "hoch":                 3,
    "gut":                  2,
    "mittel":               2,
    "durchschnittlich":     2,
    "niedrig":              1,
    "unterdurchschnittlich":1,
  };
  const wunschMap = {
    "unter_60k": 1,
    "60_70k":    2,
    "70_85k":    3,
    "ueber_85k": 4,
  };
  const niveau = Object.entries(niveauMap).find(([k]) => gehalt.includes(k))?.[1] ?? 2;
  const ziel   = wunschMap[wunsch] ?? 2;
  if (niveau >= ziel)     return 20;
  if (niveau === ziel - 1) return 10;
  return 0;
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
