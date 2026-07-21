import plzCoordinates from "@/data/plz-coordinates.json";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const plz = (searchParams.get("plz") || "").trim();

  if (!plz) {
    return Response.json({ error: "PLZ fehlt" }, { status: 400 });
  }

  const treffer = plzCoordinates[plz];

  if (!treffer) {
    return Response.json({ error: "PLZ nicht gefunden" }, { status: 404 });
  }

  const [lat, lng] = treffer;
  return Response.json({ lat, lng });
}
