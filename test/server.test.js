"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createAppServer } = require("../server");

let server;
let baseUrl;
const confessions = new Map();
const fakeSupabaseFetch = async (url, options) => {
  assert.equal(options.headers.apikey, "test-service-role-key");
  assert.equal(options.headers.Authorization, "Bearer test-service-role-key");
  const parsedUrl = new URL(url);

  if (options.method === "POST") {
    const confession = JSON.parse(options.body);
    confessions.set(confession.id, confession);
    return new Response(null, { status: 201 });
  }

  const id = parsedUrl.searchParams.get("id").slice(3);
  const confession = confessions.get(id);
  return Response.json(confession ? [confession] : []);
};

before(async () => {
  server = createAppServer({
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: "test-service-role-key",
    fetchImpl: fakeSupabaseFetch,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("serves the confession page with protective response headers", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(await response.text(), /Some things are/);
});

test("creates a hard-to-guess link and retrieves its confession", async () => {
  const created = await fetch(`${baseUrl}/api/confessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "  I am glad we met.  ", senderName: "  A friend  " }),
  });
  assert.equal(created.status, 201);
  const link = await created.json();
  assert.match(link.id, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(link.path, `/c/${link.id}`);

  const response = await fetch(`${baseUrl}/api/confessions/${link.id}`);
  assert.equal(response.status, 200);
  const confession = await response.json();
  assert.equal(confession.id, link.id);
  assert.equal(confession.message, "I am glad we met.");
  assert.equal(confession.senderName, "A friend");
  assert.ok(Number.isFinite(Date.parse(confession.createdAt)));
});

test("rejects empty or oversized confessions", async () => {
  const empty = await fetch(`${baseUrl}/api/confessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "   " }),
  });
  assert.equal(empty.status, 400);

  const oversized = await fetch(`${baseUrl}/api/confessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(2001) }),
  });
  assert.equal(oversized.status, 400);
});

test("does not reveal a confession for an invalid or unknown link", async () => {
  const malformed = await fetch(`${baseUrl}/api/confessions/short`);
  const unknown = await fetch(`${baseUrl}/api/confessions/${"a".repeat(43)}`);
  assert.equal(malformed.status, 404);
  assert.equal(unknown.status, 404);
});

test("reports a clear configuration error when Supabase credentials are missing", async (context) => {
  const unconfiguredServer = createAppServer({
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
  });
  context.after(async () => {
    await new Promise((resolve, reject) => unconfiguredServer.close((error) => error ? reject(error) : resolve()));
  });
  await new Promise((resolve) => unconfiguredServer.listen(0, "127.0.0.1", resolve));

  const response = await fetch(`http://127.0.0.1:${unconfiguredServer.address().port}/api/confessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Hello." }),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Supabase is not configured/);
});
