"use client";
import { useState } from "react";
import { matchCarriers } from "@/lib/matching";

const STEPS = [
  {
    id: "position",
    frage: "Welche Position suchst du?",
    optionen: [
      { value: "pdl",          label: "Pflegedienstleitung (PDL)" },
      { value: "el",           label: "Einrichtungsleitung (EL)" },
      { value: "regionalleitung", label: "Regionalleitung" },
      { value: "qm",           label: "Qualitätsmanagement" },
      { value: "sonstiges",    label: "Sonstiges" },
    ],
  },
  {
    id: "versorgungsform",
    frage: "Stationär, ambulant oder beides?",
    optionen: [
      { value: "stationaer", label: "Nur stationär" },
      { value: "ambulant",   label: "Nur ambulant" },
      { value: "beides",     label: "Beides möglich" },
    ],
  },
  {
    id: "gehalt",
    frage: "Was ist deine Gehaltsvorstellung (Jahresbrutto)?",
    optionen: [
      { value: "unter_60k", label: "Unter 60.000 €" },
      { value: "60_70k",    label: "60.000 – 70.000 €" },
      { value: "70_85k",    label: "70.000 – 85.000 €" },
      { value: "ueber_85k", label: "Über 85.000 €" },
    ],
  },
  {
    id: "dienstwagen",
    frage: "Wie wichtig ist dir ein Dienstwagen?",
    optionen: [
      { value: "voraussetzung",    label: "Voraussetzung – ohne geht es nicht" },
      { value: "wuenschenswert",   label: "Wünschenswert" },
      { value: "nicht_relevant",   label: "Nicht relevant" },
    ],
  },
  {
    id: "plz",
    frage: "Wo wohnst du – und wie weit bist du bereit zu fahren?",
    typ: "plz",
  },
  {
    id: "wechselgrund",
    frage: "Was war am letzten Arbeitgeber das größte Problem?",
    optionen: [
      { value: "zu_wenig_spielraum",       label: "Zu wenig Entscheidungsspielraum" },
      { value: "schlechte_kommunikation",  label: "Schlechte Kommunikation nach oben" },
      { value: "keine_wertschaetzung",     label: "Fehlende Wertschätzung" },
      { value: "kein_entwicklungspotenzial", label: "Kein Entwicklungspotenzial" },
      { value: "instabile_fuehrung",       label: "Instabile Unternehmensführung" },
      { value: "gehalt",                   label: "Gehalt" },
    ],
  },
  {
    id: "traegerAusschluss",
    frage: "Gibt es einen Trägertyp, den du ausschließt?",
    optionen: [
      { value: "keinen",        label: "Keinen ausschließen" },
      { value: "kein_privat",   label: "Keine privat-gewinnorientierten Träger" },
      { value: "kein_kirchlich", label: "Keine kirchlichen Träger" },
      { value: "nur_kommunal",  label: "Nur kommunale Träger" },
    ],
  },
  {
    id: "wechselbereitschaft",
    frage: "Wie aktiv suchst du aktuell?",
    optionen: [
      { value: "aktiv_kurzfristig",  label: "Aktiv – ich möchte kurzfristig wechseln" },
      { value: "aktiv_mittelfristig", label: "Aktiv – aber in Ruhe, kein Stress" },
      { value: "offen",              label: "Offen – beim richtigen Angebot gerne" },
      { value: "vergleichend",       label: "Ich schaue mich nur um und vergleiche" },
    ],
  },
];

export default function MatchingTool() {
  const [step,      setStep]      = useState(0); // 0 = Start
  const [answers,   setAnswers]   = useState({});
  const [contact,   setContact]   = useState({ name: "", email: "", telefon: "" });
  const [einwilligung, setEinwilligung] = useState(false);
  const [results,   setResults]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [submitted, setSubmitted] = useState(false);

  const totalSteps = STEPS.length;
  const currentQ   = STEPS[step - 1];
  const progress   = step === 0 ? 0 : Math.round((step / (totalSteps + 2)) * 100);

  function handleAnswer(id, value) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setStep((s) => s + 1);
  }

  function handlePlzNext() {
    if (!answers.plz) { setError("Bitte PLZ eingeben."); return; }
    setError("");
    setStep((s) => s + 1);
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    if (!einwilligung) { setError("Bitte stimme der Kontaktaufnahme zu."); return; }
    if (!contact.name || !contact.email) { setError("Name und E-Mail sind Pflichtfelder."); return; }
    setError("");
    setLoading(true);

    try {
      // 1. Träger laden
      const res      = await fetch("/api/carriers");
      const { carriers } = await res.json();

      // 2. Matching
      const top3 = matchCarriers(carriers, answers);
      setResults(top3);

      // 3. Lead speichern
      await fetch("/api/leads", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ...contact,
          ...answers,
          quelle: "Träger-Finder",
        }),
      });

      setSubmitted(true);
      setStep(totalSteps + 2);
    } catch {
      setError("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  if (step === 0) {
    return <StartScreen onStart={() => setStep(1)} />;
  }

  if (step > 0 && step <= totalSteps) {
    return (
      <Screen progress={progress} stepNum={step} totalSteps={totalSteps}>
        <QuestionStep
          question={currentQ}
          answers={answers}
          onAnswer={handleAnswer}
          onPlzNext={handlePlzNext}
          setAnswers={setAnswers}
          error={error}
          setError={setError}
          onBack={() => setStep((s) => s - 1)}
        />
      </Screen>
    );
  }

  if (step === totalSteps + 1) {
    return (
      <Screen progress={90} stepNum={totalSteps + 1} totalSteps={totalSteps}>
        <ContactStep
          contact={contact}
          setContact={setContact}
          einwilligung={einwilligung}
          setEinwilligung={setEinwilligung}
          onSubmit={handleContactSubmit}
          loading={loading}
          error={error}
          onBack={() => setStep((s) => s - 1)}
        />
      </Screen>
    );
  }

  if (step === totalSteps + 2 && results) {
    return <ResultsScreen results={results} contact={contact} />;
  }

  return null;
}

// ─── START SCREEN ─────────────────────────────────────────────────────────────
function StartScreen({ onStart }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center px-4">
      <div className="max-w-xl w-full text-center">
        <div className="inline-block bg-brand-500 text-white text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          Kostenlos &amp; anonym
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
          Welcher Pflegeträger passt wirklich zu dir?
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Beantworte 8 Fragen — wir zeigen dir die 3 Träger, die am besten zu
          deinen Anforderungen passen.
        </p>
        <div className="flex justify-center gap-6 mb-10 text-sm text-gray-500">
          <span>✓ 2 Minuten</span>
          <span>✓ Keine Anmeldung</span>
          <span>✓ Persönliche Beratung möglich</span>
        </div>
        <button
          onClick={onStart}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-10 py-4 rounded-xl text-lg transition-colors shadow-sm"
        >
          Jetzt starten →
        </button>
        <p className="mt-4 text-xs text-gray-400">Ein Service von Rehsearch GmbH</p>
      </div>
    </div>
  );
}

// ─── SCREEN WRAPPER ────────────────────────────────────────────────────────────
function Screen({ progress, stepNum, totalSteps, children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-200">
        <div
          className="h-1 bg-brand-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between max-w-2xl mx-auto w-full">
        <span className="text-sm font-medium text-brand-500">Rehsearch</span>
        <span className="text-sm text-gray-400">
          {stepNum} / {totalSteps + 1}
        </span>
      </div>
      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 pt-8 pb-16">
        <div className="w-full max-w-xl">{children}</div>
      </div>
    </div>
  );
}

// ─── QUESTION STEP ─────────────────────────────────────────────────────────────
function QuestionStep({ question, answers, onAnswer, onPlzNext, setAnswers, error, setError, onBack }) {
  if (question.typ === "plz") {
    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{question.frage}</h2>
        <p className="text-gray-500 mb-6 text-sm">
          Die PLZ hilft uns, regionale Träger zu priorisieren.
        </p>
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="PLZ (z.B. 40213)"
            maxLength={5}
            value={answers.plz || ""}
            onChange={(e) => { setError(""); setAnswers((a) => ({ ...a, plz: e.target.value })); }}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base w-36 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={answers.pendelradius || "50"}
            onChange={(e) => setAnswers((a) => ({ ...a, pendelradius: e.target.value }))}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base flex-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="30">Max. 30 km</option>
            <option value="50">Max. 50 km</option>
            <option value="100">Max. 100 km</option>
            <option value="200">Max. 200 km</option>
            <option value="999">Deutschlandweit / Umzug möglich</option>
          </select>
        </div>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onBack} className="px-4 py-3 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">← Zurück</button>
          <button onClick={onPlzNext} className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors">Weiter →</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{question.frage}</h2>
      <div className="space-y-3">
        {question.optionen.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onAnswer(question.id, opt.value)}
            className="w-full text-left border border-gray-200 hover:border-brand-500 hover:bg-brand-50 bg-white rounded-xl px-5 py-4 text-base font-medium text-gray-800 transition-all shadow-sm"
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button onClick={onBack} className="mt-5 px-4 py-2 text-sm text-gray-500 hover:text-gray-700">← Zurück</button>
    </div>
  );
}

// ─── CONTACT STEP ──────────────────────────────────────────────────────────────
function ContactStep({ contact, setContact, einwilligung, setEinwilligung, onSubmit, loading, error, onBack }) {
  return (
    <form onSubmit={onSubmit}>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Fast geschafft!</h2>
      <p className="text-gray-500 mb-6 text-sm">
        Trage deine Kontaktdaten ein, um dein persönliches Ergebnis zu sehen.
      </p>
      <div className="space-y-4 mb-6">
        <input
          type="text"
          placeholder="Name *"
          required
          value={contact.name}
          onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="email"
          placeholder="E-Mail-Adresse *"
          required
          value={contact.email}
          onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="tel"
          placeholder="Telefon (optional)"
          value={contact.telefon}
          onChange={(e) => setContact((c) => ({ ...c, telefon: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <label className="flex items-start gap-3 cursor-pointer mb-6">
        <input
          type="checkbox"
          checked={einwilligung}
          onChange={(e) => setEinwilligung(e.target.checked)}
          className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-500"
        />
        <span className="text-sm text-gray-600">
          Ich stimme zu, dass Rehsearch GmbH mich zum Zweck der Beratung bei einem
          möglichen Stellenwechsel kontaktieren darf. Meine Daten werden nicht
          weitergegeben und können jederzeit widerrufen werden.{" "}
          <a href="/datenschutz" className="underline text-brand-500" target="_blank">Datenschutzhinweis</a>
        </span>
      </label>
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="px-4 py-3 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100">← Zurück</button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-60"
        >
          {loading ? "Wird berechnet…" : "Ergebnis anzeigen →"}
        </button>
      </div>
    </form>
  );
}

// ─── RESULTS SCREEN ────────────────────────────────────────────────────────────
const META_FIELDS = ["id", "matchScore", "matchLabel", "hasDetailData"];

function getTraegerName(t) {
  if (t["Träger / Betreiber"]) return t["Träger / Betreiber"];
  const entry = Object.entries(t).find(
    ([key, value]) => !META_FIELDS.includes(key) && typeof value === "string" && value.trim() !== ""
  );
  return entry ? entry[1] : "Träger";
}

function ResultsScreen({ results, contact }) {
  console.log(JSON.stringify(results[0]));

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Deine Top-3-Träger
          </h2>
          <p className="text-gray-500">
            Basierend auf deinen Antworten — ein Berater von Rehsearch meldet
            sich bei dir, um das Ergebnis zu besprechen.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {results.map((t, i) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">
                    #{i + 1}
                  </span>
                  <h3 className="text-xl font-bold text-gray-900">
                    {getTraegerName(t)}
                  </h3>
                  <span className="text-sm text-gray-500">{t["Trägertyp"]}</span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-brand-500">
                    {t.matchScore}%
                  </div>
                  <div className="text-xs text-gray-400">{t.matchLabel}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {t["Tarifbindung"] && (
                  <Tag>{t["Tarifbindung"]}</Tag>
                )}
                {t["Dienstwagen PDL/EL"] && (
                  <Tag>🚗 {t["Dienstwagen PDL/EL"]}</Tag>
                )}
                {t["Versorgungsform"] && (
                  <Tag>{t["Versorgungsform"]}</Tag>
                )}
              </div>
              {t["Besonderheiten / Bekanntes"] && (
                <p className="text-sm text-gray-600">
                  {t["Besonderheiten / Bekanntes"]}
                </p>
              )}
              {t.hasDetailData && (
                <div className="mt-3 inline-flex items-center gap-1.5 bg-brand-50 text-brand-600 text-xs font-medium px-3 py-1 rounded-full">
                  ✓ Detailbewertung durch Rehsearch verfügbar
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-brand-500 rounded-2xl p-6 text-white text-center">
          <h3 className="text-xl font-bold mb-2">Nächster Schritt</h3>
          <p className="text-brand-100 mb-4 text-sm">
            Ein Berater von Rehsearch meldet sich in Kürze bei dir, um die
            Ergebnisse zu besprechen und konkrete nächste Schritte zu planen.
          </p>
          <a
            href="https://rehsearch.de"
            className="inline-block bg-white text-brand-600 font-semibold px-6 py-3 rounded-xl hover:bg-brand-50 transition-colors"
          >
            Zur Rehsearch Website →
          </a>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Rehsearch GmbH · Vermittlung von Führungskräften in der Pflege
        </p>
      </div>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
      {children}
    </span>
  );
}
