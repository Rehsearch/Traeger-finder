import { getCarriers } from "@/lib/airtable";

export async function GET() {
  try {
    const carriers = await getCarriers();
    return Response.json({ carriers });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Fehler beim Laden der Trägerdaten" }, { status: 500 });
  }
}
