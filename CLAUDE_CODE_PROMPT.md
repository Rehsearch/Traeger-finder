# Rehsearch Träger-Finder — Deployment-Anleitung für Claude Code

## Was dieses Projekt ist
Ein Next.js 14 Web-App für Rehsearch GmbH. Pflegeführungskräfte beantworten
8 Fragen und bekommen ihre Top-3 passenden Pflegeträger empfohlen.
Leads werden in Airtable gespeichert.

## Schritt 1 — Abhängigkeiten installieren
```
npm install
```

## Schritt 2 — .env.local erstellen
Erstelle eine Datei `.env.local` im Projektroot mit folgendem Inhalt
(echte Werte einsetzen):

```
AIRTABLE_API_TOKEN=<dein_airtable_token>
AIRTABLE_BASE_ID=appae42Y9ShLO1G2w
AIRTABLE_CARRIERS_TABLE=tblknvJx1iLMlFcjU
AIRTABLE_LEADS_TABLE=Leads
LEAD_NOTIFY_EMAIL=pfk@rehsearch.de
```

## Schritt 3 — Lokal testen
```
npm run dev
```
→ Öffne http://localhost:3000

## Schritt 4 — Auf Vercel deployen

1. GitHub-Repo erstellen und Code pushen:
```
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/rehsearch-gmbh/traeger-finder.git
git push -u origin main
```

2. Auf vercel.com: "New Project" → GitHub-Repo importieren

3. Environment Variables in Vercel eintragen:
   - AIRTABLE_API_TOKEN
   - AIRTABLE_BASE_ID = appae42Y9ShLO1G2w
   - AIRTABLE_CARRIERS_TABLE = tblknvJx1iLMlFcjU
   - AIRTABLE_LEADS_TABLE = Leads
   - LEAD_NOTIFY_EMAIL = pfk@rehsearch.de

4. Deploy klicken → fertig

## Schritt 5 — E-Mail-Benachrichtigung via Airtable Automation
In Airtable:
1. Zur "Leads"-Tabelle → "Automations" (oben rechts)
2. "Create automation" → Trigger: "When a record is created"
3. Action: "Send email"
4. An: pfk@rehsearch.de
5. Betreff: "Neuer Lead: {Name}"
6. Inhalt: alle relevanten Felder einfügen

## Projektstruktur
```
app/
  page.jsx              → Einstiegspunkt
  layout.jsx            → HTML-Wrapper + Metadata
  globals.css           → Tailwind
  api/
    carriers/route.js   → GET: Träger aus Airtable laden
    leads/route.js      → POST: Lead in Airtable speichern
components/
  MatchingTool.jsx      → Gesamte App-Logik + UI
lib/
  airtable.js           → Airtable API-Wrapper
  matching.js           → Matching-Algorithmus
```

## CI-Anpassung
Farben in tailwind.config.js unter `brand:` anpassen.
Standard ist Rehsearch-Grün (#1a7a5e).
