export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const plz = searchParams.get("plz");

  if (!plz) {
    return Response.json({ error: "PLZ fehlt" }, { status: 400 });
  }

  try {
    const url = `http://api.positionstack.com/v1/forward?access_key=${process.env.POSITIONSTACK_API_KEY}&query=${encodeURIComponent(plz)}&country=DE`;
    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data.data) || data.data.length === 0) {
      return Response.json({ error: "PLZ nicht gefunden" }, { status: 404 });
    }

    return Response.json({ lat: data.data[0].latitude, lng: data.data[0].longitude });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Geocoding fehlgeschlagen" }, { status: 500 });
  }
}
