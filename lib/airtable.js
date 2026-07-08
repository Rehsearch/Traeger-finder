const BASE    = process.env.AIRTABLE_BASE_ID;
const TOKEN   = process.env.AIRTABLE_API_TOKEN;
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

export async function getCarriers() {
  const table = process.env.AIRTABLE_CARRIERS_TABLE;
  let records = [];
  let offset  = null;

  do {
    const url = `https://api.airtable.com/v0/${BASE}/${table}?pageSize=100${offset ? `&offset=${offset}` : ""}`;
    const res  = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
    const data = await res.json();
    records    = records.concat(data.records || []);
    offset     = data.offset || null;
  } while (offset);

  return records.map((r) => ({ id: r.id, ...r.fields }));
}

export async function getEinrichtungen() {
  const table  = process.env.AIRTABLE_EINRICHTUNGEN_TABLE || "Einrichtungen_v2";
  const fields = ["Einrichtungsname", "Latitude", "Longitude", "Traeger_Match"];
  const fieldsQuery = fields.map((f) => `fields[]=${encodeURIComponent(f)}`).join("&");
  let records = [];
  let offset  = null;

  do {
    const url = `https://api.airtable.com/v0/${BASE}/${table}?pageSize=100&${fieldsQuery}${offset ? `&offset=${offset}` : ""}`;
    const res  = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
    const data = await res.json();
    records    = records.concat(data.records || []);
    offset     = data.offset || null;
  } while (offset);

  return records.map((r) => ({ id: r.id, ...r.fields }));
}

export async function createLead(fields) {
  const table = process.env.AIRTABLE_LEADS_TABLE || "Leads";
  const res   = await fetch(`https://api.airtable.com/v0/${BASE}/${table}`, {
    method:  "POST",
    headers: HEADERS,
    body:    JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
