"use strict";

const { createServer } = require("node:http");
const { randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ASSETS = {
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    const error = new Error("Expected a JSON request.");
    error.status = 415;
    throw error;
  }

  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    const error = new Error("Request body is too large.");
    error.status = 413;
    throw error;
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function createAppServer({
  supabaseUrl = process.env.SUPABASE_URL,
  supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl = fetch,
  publicDir = path.join(__dirname, "public"),
} = {}) {
  async function requestSupabase(endpoint, options) {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      const error = new Error("Supabase is not configured on the server.");
      error.status = 503;
      throw error;
    }

    let baseUrl;
    try {
      baseUrl = new URL(supabaseUrl);
    } catch {
      throw new Error("SUPABASE_URL must be a valid URL.");
    }
    if (!["http:", "https:"].includes(baseUrl.protocol)) {
      throw new Error("SUPABASE_URL must use HTTP or HTTPS.");
    }

    const response = await fetchImpl(new URL(endpoint, baseUrl), {
      ...options,
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Supabase request failed with status ${response.status}.`);
    }
    return response;
  }

  async function insertConfession(confession) {
    await requestSupabase("/rest/v1/confessions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(confession),
    });
  }

  async function findConfession(id) {
    const query = new URLSearchParams({
      select: "id,message,sender_name,created_at",
      id: `eq.${id}`,
      limit: "1",
    });
    const response = await requestSupabase(`/rest/v1/confessions?${query}`, {
      method: "GET",
    });
    const rows = await response.json();
    if (!Array.isArray(rows)) {
      throw new Error("Supabase returned an invalid confession response.");
    }
    const row = rows[0];
    return row ? {
      id: row.id,
      message: row.message,
      senderName: row.sender_name,
      createdAt: row.created_at,
    } : null;
  }

  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    response.setHeader("Cache-Control", "no-store");

    try {
      const url = new URL(request.url || "/", "http://localhost");
      const { pathname } = url;

      if (request.method === "POST" && pathname === "/api/confessions") {
        const body = await readJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return sendJson(response, 400, { error: "Please send a confession." });
        }

        if (typeof body.message !== "string" || !body.message.trim()) {
          return sendJson(response, 400, { error: "Write a confession before creating a link." });
        }
        const message = body.message.trim();
        if (message.length > MAX_MESSAGE_LENGTH) {
          return sendJson(response, 400, { error: "Keep your confession under 2,000 characters." });
        }
        if (body.senderName !== undefined && body.senderName !== null && typeof body.senderName !== "string") {
          return sendJson(response, 400, { error: "The name must be text." });
        }
        const senderName = typeof body.senderName === "string" ? body.senderName.trim() : "";
        if (senderName.length > MAX_NAME_LENGTH) {
          return sendJson(response, 400, { error: "Keep your name under 60 characters." });
        }

        const id = randomBytes(32).toString("base64url");
        const createdAt = new Date().toISOString();
        await insertConfession({
          id,
          message,
          sender_name: senderName || null,
          created_at: createdAt,
        });
        return sendJson(response, 201, { id, path: `/c/${id}` });
      }

      const confessionMatch = pathname.match(/^\/api\/confessions\/([A-Za-z0-9_-]+)$/);
      if (request.method === "GET" && confessionMatch) {
        const id = confessionMatch[1];
        if (!TOKEN_PATTERN.test(id)) {
          return sendJson(response, 404, { error: "This confession could not be found." });
        }
        const confession = await findConfession(id);
        if (!confession) {
          return sendJson(response, 404, { error: "This confession could not be found." });
        }
        return sendJson(response, 200, confession);
      }

      if (request.method === "GET" && ASSETS[pathname]) {
        const asset = ASSETS[pathname];
        response.writeHead(200, { "Content-Type": asset.type });
        return response.end(readFileSync(path.join(publicDir, asset.file)));
      }

      if (request.method === "GET" && (pathname === "/" || /^\/c\/[A-Za-z0-9_-]+$/.test(pathname))) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return response.end(readFileSync(path.join(publicDir, "index.html")));
      }

      if (pathname.startsWith("/api/")) {
        return sendJson(response, 405, { error: "This request is not supported." });
      }
      return sendJson(response, 404, { error: "This page could not be found." });
    } catch (error) {
      if (error.status) {
        return sendJson(response, error.status, { error: error.message });
      }
      console.error("Request failed:", error);
      if (!response.headersSent) {
        return sendJson(response, 500, { error: "Something went wrong. Please try again." });
      }
      response.end();
    }
  });

  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Secret Confession is running at http://localhost:${port}`);
  });
}

module.exports = { createAppServer };
