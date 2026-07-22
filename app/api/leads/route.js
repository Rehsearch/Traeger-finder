import { createLead } from "@/lib/airtable";

const BERUFLICHER_STATUS_LABELS = {
  fuehrungskraft:                    "Ich bin Führungskraft in der Pflege",
  will_fuehrungskraft_werden:       "Ich möchte Führungskraft im nächsten Schritt meiner Karriere werden",
  andere_funktion_pflege:           "Ich übe eine andere Funktion in der Pflege aus",
  pflegefachkraft:                  "Ich bin Pflegefachkraft",
  branchenfremd:                    "Ich bin branchenfremd",
};

export async function POST(req) {
  try {
    const body = await req.json();

    const fields = {
      "Name":                    body.name        || "",
      "E-Mail":                  body.email       || "",
      "Telefon":                 body.telefon     || "",
      "Beruflicher_Status":      BERUFLICHER_STATUS_LABELS[body.beruflicherStatus] || "",
      "Position":                body.position    || "",
      "Gehaltsvorstellung":      body.gehalt      || "",
      "Wechselbereitschaft":     body.wechselbereitschaft || "",
      "Dienstwagen gewünscht":   body.dienstwagen || "",
      "PLZ Wohnort":             body.plz         || "",
      "Pendelradius (km)":       body.pendelradius ? parseInt(body.pendelradius) : null,
      "Wechselgrund":            body.wechselgrund || "",
      "Quelle":                  body.quelle      || "Träger-Finder",
    };

    await createLead(fields);
    return Response.json({ success: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Fehler beim Speichern des Leads" }, { status: 500 });
  }
}
