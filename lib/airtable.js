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
  const table = process.env.AIRTABLE_EINRICHTUNGEN_TABLE || "Einrichtungen";
  let records = [];
  let offset  = null;

  // Kein fields[]-Filter: mindestens ein Airtable-Feldname trägt ein
  // führendes BOM-Zeichen (﻿), vermutlich aus einem CSV-Import.
  // fields[] verlangt exakte Namen und schlägt dafür mit
  // UNKNOWN_FIELD_NAME fehl, daher laden wir alle Felder und normalisieren
  // die Keys stattdessen unten.
  do {
    const url = `https://api.airtable.com/v0/${BASE}/${table}?pageSize=100${offset ? `&offset=${offset}` : ""}`;
    const res  = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
    const data = await res.json();
    records    = records.concat(data.records || []);
    offset     = data.offset || null;
  } while (offset);

  return records.map((r) => {
    const fields = {};
    for (const [key, value] of Object.entries(r.fields)) {
      fields[key.replace(/^﻿/, "")] = value;
    }
    return { id: r.id, ...fields };
  });
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

export async function deleteExpiredLeads(monate = 12) {
  const table = process.env.AIRTABLE_LEADS_TABLE || "Leads";
  const grenzdatum = new Date();
  grenzdatum.setMonth(grenzdatum.getMonth() - monate);
  const grenzdatumISO = grenzdatum.toISOString();

  const formula = encodeURIComponent(
    `AND(NOT({In_Vermittlung}), IS_BEFORE(IF({Letzter_Kontakt}, {Letzter_Kontakt}, {EIngangsdatum}), "${grenzdatumISO}"))`
  );

  let alleIds = [];
  let offset  = null;
  do {
    const url = `https://api.airtable.com/v0/${BASE}/${table}?filterByFormula=${formula}&fields[]=EIngangsdatum${offset ? `&offset=${offset}` : ""}`;
    const res  = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    alleIds    = alleIds.concat((data.records || []).map((r) => r.id));
    offset     = data.offset || null;
  } while (offset);

  let gelöscht = 0;
  for (let i = 0; i < alleIds.length; i += 10) {
    const batch = alleIds.slice(i, i + 10);
    const params = batch.map((id) => `records[]=${id}`).join("&");
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${table}?${params}`, {
      method:  "DELETE",
      headers: HEADERS,
    });
    if (!res.ok) throw new Error(await res.text());
    gelöscht += batch.length;
  }

  return { geprüft: alleIds.length, gelöscht, stichtag: grenzdatumISO };
}
