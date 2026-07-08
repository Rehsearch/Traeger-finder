export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const plz = searchParams.get("plz");

  if (!plz) {
    return Response.json({ error: "PLZ fehlt" }, { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(plz)}&country=de&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Rehsearch-Traeger-Finder/1.0 (pfk@rehsearch.de)" },
    });
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return Response.json({ error: "PLZ nicht gefunden" }, { status: 404 });
    }

    return Response.json({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Geocoding fehlgeschlagen" }, { status: 500 });
  }
}
