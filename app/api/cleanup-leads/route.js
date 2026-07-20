import { deleteExpiredLeads } from "@/lib/airtable";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const ergebnis = await deleteExpiredLeads(12);
    console.log("[cleanup-leads]", ergebnis);
    return Response.json({ ok: true, ...ergebnis });
  } catch (err) {
    console.error("[cleanup-leads] Fehler:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
}
