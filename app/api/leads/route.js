import { createLead } from "@/lib/airtable";

export async function POST(req) {
  try {
    const body = await req.json();

    const fields = {
      "Name":                    body.name        || "",
      "E-Mail":                  body.email       || "",
      "Telefon":                 body.telefon     || "",
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
