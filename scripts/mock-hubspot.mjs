// Local mock of the HubSpot endpoints OpenGong Lite calls, for demos and dev
// without a real portal. Zero dependencies; state lives in memory.
//
//   node scripts/mock-hubspot.mjs        # listens on :8585
//
// Then in .env:
//   HUBSPOT_API_BASE=http://localhost:8585
//   HUBSPOT_ACCESS_TOKEN=pat-mock-token
//
// Covered endpoints (everything src/lib/hubspot.ts touches):
//   POST  /crm/v3/objects/companies/search
//   GET   /crm/v4/objects/companies/:id/associations/deals
//   GET   /crm/v4/objects/deals/:id/associations/contacts
//   POST  /crm/v3/objects/{deals,contacts}/batch/read
//   POST  /crm/v3/objects/deals/search
//   PATCH /crm/v3/objects/deals/:id
//   POST  /crm/v3/objects/{notes,tasks}
//   GET   /crm/v3/properties/deals/:name   POST /crm/v3/properties/deals
//   GET   /crm/v3/pipelines/deals/:id
//   GET   /account-info/v3/details

import http from "node:http";

const PORT = Number(process.env.MOCK_HUBSPOT_PORT || 8585);
const PORTAL_ID = 424242;

const now = Date.now();
const daysAgo = (d) => new Date(now - d * 86_400_000).toISOString();

// ── Seed data ───────────────────────────────────────────────────────────────

const companies = [
  { id: "9001", properties: { name: "Acme Corp", domain: "acme.example" } },
  { id: "9002", properties: { name: "Globex", domain: "globex.example" } },
  { id: "9003", properties: { name: "Initech", domain: "initech.example" } },
];

const deals = {
  7001: deal("Acme Corp — Team plan", 24_000, "qualifiedtobuy", 2, 3, false, false),
  7002: deal("Acme Corp — Renewal 2025", 12_000, "closedwon", 90, 91, true, true),
  7003: deal("Globex — Enterprise rollout", 85_000, "presentationscheduled", 1, 6, false, false),
  7004: deal("Globex — Pilot (lost)", 15_000, "closedlost", 120, 121, true, false),
  7005: deal("Initech — Starter", 6_000, "appointmentscheduled", 5, 5, false, false),
};

function deal(name, amount, stage, modifiedDaysAgo, createdDaysAgo, closed, won) {
  return {
    properties: {
      dealname: name,
      amount: String(amount),
      dealstage: stage,
      pipeline: "default",
      hs_lastmodifieddate: daysAgo(modifiedDaysAgo),
      notes_last_updated: daysAgo(modifiedDaysAgo),
      createdate: daysAgo(createdDaysAgo),
      hs_is_closed: String(closed),
      hs_is_closed_won: String(won),
    },
  };
}

const contacts = {
  5001: { properties: { firstname: "Priya", lastname: "Sharma", email: "priya@acme.example", jobtitle: "VP Sales" } },
  5002: { properties: { firstname: "Dev", lastname: "Patel", email: "dev@acme.example", jobtitle: "RevOps Lead" } },
  5003: { properties: { firstname: "Hank", lastname: "Scorpio", email: "hank@globex.example", jobtitle: "CEO" } },
  5004: { properties: { firstname: "Peter", lastname: "Gibbons", email: "peter@initech.example", jobtitle: "Engineer" } },
};

const companyDeals = { 9001: ["7001", "7002"], 9002: ["7003", "7004"], 9003: ["7005"] };
const dealContacts = { 7001: ["5001", "5002"], 7002: ["5001"], 7003: ["5003"], 7004: ["5003"], 7005: ["5004"] };

const pipeline = {
  id: "default",
  label: "Sales Pipeline",
  stages: [
    { id: "appointmentscheduled", label: "Appointment scheduled", displayOrder: 0, metadata: { isClosed: "false" } },
    { id: "qualifiedtobuy", label: "Qualified to buy", displayOrder: 1, metadata: { isClosed: "false" } },
    { id: "presentationscheduled", label: "Presentation scheduled", displayOrder: 2, metadata: { isClosed: "false" } },
    { id: "decisionmakerboughtin", label: "Decision maker bought-in", displayOrder: 3, metadata: { isClosed: "false" } },
    { id: "contractsent", label: "Contract sent", displayOrder: 4, metadata: { isClosed: "false" } },
    { id: "closedwon", label: "Closed won", displayOrder: 5, metadata: { isClosed: "true" } },
    { id: "closedlost", label: "Closed lost", displayOrder: 6, metadata: { isClosed: "true" } },
  ],
};

const customDealProperties = new Map(); // name -> definition
const notes = new Map();
const tasks = new Map();
let nextId = 100_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const notFound = (res, message = "resource not found") =>
  json(res, 404, { status: "error", category: "OBJECT_NOT_FOUND", message });
const withId = (id, record) => ({ id: String(id), ...record });
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });

function firstFilter(body) {
  return body?.filterGroups?.[0]?.filters?.[0] ?? null;
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ") || auth === "Bearer ") {
    return json(res, 401, { status: "error", category: "INVALID_AUTHENTICATION", message: "Authentication credentials not found." });
  }
  const body = req.method === "POST" || req.method === "PATCH" ? await readBody(req) : null;
  console.log(`${req.method} ${path}`);

  let m;

  if (path === "/account-info/v3/details") {
    return json(res, 200, { portalId: PORTAL_ID, accountType: "STANDARD", timeZone: "Asia/Kolkata" });
  }

  if (path === "/crm/v3/objects/companies/search" && req.method === "POST") {
    const f = firstFilter(body);
    const q = (f?.value ?? "").toLowerCase();
    const results = companies
      .filter((c) => c.properties.name.toLowerCase().includes(q))
      .slice(0, body?.limit ?? 10);
    return json(res, 200, { total: results.length, results });
  }

  if ((m = path.match(/^\/crm\/v4\/objects\/companies\/(\d+)\/associations\/deals$/))) {
    const ids = companyDeals[m[1]] ?? [];
    return json(res, 200, { results: ids.map((id) => ({ toObjectId: Number(id), associationTypes: [] })) });
  }

  if ((m = path.match(/^\/crm\/v4\/objects\/deals\/(\d+)\/associations\/contacts$/))) {
    const ids = dealContacts[m[1]] ?? [];
    return json(res, 200, { results: ids.map((id) => ({ toObjectId: Number(id), associationTypes: [] })) });
  }

  if (path === "/crm/v3/objects/deals/batch/read" && req.method === "POST") {
    const results = (body?.inputs ?? [])
      .map((i) => (deals[i.id] ? withId(i.id, deals[i.id]) : null))
      .filter(Boolean);
    return json(res, 200, { status: "COMPLETE", results });
  }

  if (path === "/crm/v3/objects/contacts/batch/read" && req.method === "POST") {
    const results = (body?.inputs ?? [])
      .map((i) => (contacts[i.id] ? withId(i.id, contacts[i.id]) : null))
      .filter(Boolean);
    return json(res, 200, { status: "COMPLETE", results });
  }

  if (path === "/crm/v3/objects/deals/search" && req.method === "POST") {
    const f = firstFilter(body);
    let results = Object.entries(deals).map(([id, d]) => withId(id, d));
    if (f?.propertyName === "hs_is_closed") {
      results = results.filter((d) => d.properties.hs_is_closed === f.value);
    }
    results.sort((a, b) => (a.properties.hs_lastmodifieddate < b.properties.hs_lastmodifieddate ? 1 : -1));
    return json(res, 200, { total: results.length, results: results.slice(0, body?.limit ?? 20) });
  }

  if ((m = path.match(/^\/crm\/v3\/objects\/deals\/(\d+)$/)) && req.method === "PATCH") {
    const d = deals[m[1]];
    if (!d) return notFound(res);
    Object.assign(d.properties, body?.properties ?? {});
    d.properties.hs_lastmodifieddate = new Date().toISOString();
    console.log(`  ↳ deal ${m[1]} updated:`, body?.properties);
    return json(res, 200, withId(m[1], d));
  }

  if ((m = path.match(/^\/crm\/v3\/properties\/deals\/([\w-]+)$/)) && req.method === "GET") {
    const builtin = ["dealname", "amount", "dealstage", "pipeline", "hs_lastmodifieddate", "notes_last_updated", "createdate", "hs_is_closed", "hs_is_closed_won"];
    if (builtin.includes(m[1])) return json(res, 200, { name: m[1], type: "string" });
    if (customDealProperties.has(m[1])) return json(res, 200, customDealProperties.get(m[1]));
    return notFound(res, `Property "${m[1]}" does not exist`);
  }

  if (path === "/crm/v3/properties/deals" && req.method === "POST") {
    customDealProperties.set(body.name, body);
    console.log(`  ↳ deal property created: ${body.name}`);
    return json(res, 201, body);
  }

  if (path === "/crm/v3/objects/notes" && req.method === "POST") {
    const id = String(nextId++);
    notes.set(id, body);
    console.log(`  ↳ note ${id} created for deal ${body?.associations?.[0]?.to?.id}`);
    return json(res, 201, { id, properties: body?.properties ?? {} });
  }

  if (path === "/crm/v3/objects/tasks" && req.method === "POST") {
    const id = String(nextId++);
    tasks.set(id, body);
    console.log(`  ↳ task ${id} created for deal ${body?.associations?.[0]?.to?.id}: ${body?.properties?.hs_task_subject}`);
    return json(res, 201, { id, properties: body?.properties ?? {} });
  }

  if ((m = path.match(/^\/crm\/v3\/pipelines\/deals\/([\w%-]+)$/))) {
    return json(res, 200, pipeline);
  }

  return notFound(res, `Mock has no route for ${req.method} ${path}`);
});

server.listen(PORT, () => {
  console.log(`Mock HubSpot API listening on http://localhost:${PORT}`);
  console.log(`Seeded: ${companies.length} companies, ${Object.keys(deals).length} deals, ${Object.keys(contacts).length} contacts`);
});
