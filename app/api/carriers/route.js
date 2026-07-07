import { getCarriers } from "@/lib/airtable";

export async function GET() {
  try {
    const carriers = await getCarriers();
    console.log("ERSTER TRÄGER FELDER:", JSON.stringify(Object.keys(carriers[0])));
    console.log("ERSTER TRÄGER WERTE:", JSON.stringify(carriers[0]));
    return Response.json({ carriers });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Fehler beim Laden der Trägerdaten" }, { status: 500 });
  }
}
