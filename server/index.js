"use strict";
/* Server HTTP: file statis (public/), API JSON (/api/*), header keamanan. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

// Muat .env sederhana (tanpa dotenv)
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /ganti/i.test(process.env.JWT_SECRET)) {
  console.error("JWT_SECRET belum diset (minimal 32 karakter). Jalankan `npm run seed` atau isi file .env.");
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === "production";
if (isProduction && process.env.COOKIE_SECURE !== "1") {
  console.error("COOKIE_SECURE=1 wajib di NODE_ENV=production agar session cookie hanya dikirim lewat HTTPS.");
  process.exit(1);
}
if (isProduction && !/^https:\/\//i.test(process.env.APP_URL || "")) {
  console.error("APP_URL HTTPS wajib di NODE_ENV=production.");
  process.exit(1);
}

const db = require("./db");
const sec = require("./security");
const { routes, HttpError } = require("./api");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders(res) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (process.env.COOKIE_SECURE === "1") res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new HttpError(413, "Permintaan terlalu besar.")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(v && typeof v === "object" && !Array.isArray(v) ? v : {});
      } catch { reject(new HttpError(400, "JSON tidak valid.")); }
    });
    req.on("error", reject);
  });
}

function currentUser(req) {
  const token = sec.parseCookies(req.headers.cookie).session;
  const payload = sec.verifyToken(token, process.env.JWT_SECRET);
  if (!payload) return null;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  // Sesi yang dibuat sebelum password diganti dianggap tidak berlaku
  if (!user || (payload.iat || 0) < user.pw_changed_at) return null;
  return user;
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || "unknown";
}

async function handleApi(req, res, pathname) {
  const route = routes.find((r) => r.method === req.method && r.re.test(pathname));
  if (!route) {
    const known = routes.some((r) => r.re.test(pathname));
    throw new HttpError(known ? 405 : 404, known ? "Metode tidak diizinkan." : "Endpoint tidak ditemukan.");
  }
  const mutating = req.method !== "GET";
  if (mutating) {
    // Pertahanan CSRF tambahan di luar SameSite=Strict: form lintas-situs tidak bisa
    // mengirim application/json tanpa preflight.
    const ct = String(req.headers["content-type"] || "");
    if (!ct.startsWith("application/json")) throw new HttpError(415, "Content-Type harus application/json.");
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, "Origin tidak diizinkan.");
  }
  const body = mutating ? await readBody(req) : {};
  const params = pathname.match(route.re).groups || {};
  const result = await route.handler({ req, res, body, params, user: currentUser(req), ip: clientIp(req) });
  sendJson(res, 200, result);
}

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  if (pathname === "/admin") pathname = "/admin.html";
  if (pathname.endsWith("/")) pathname += "index.html";
  let file;
  try { file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname))); }
  catch { res.writeHead(400); return res.end(); }
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Tidak ditemukan"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

if (!process.env.SMTP_HOST && process.env.MAIL_TRANSPORT !== "memory")
  console.warn("PERINGATAN: SMTP_HOST belum diatur. Email verifikasi/reset hanya dicetak di konsol ini (mode pengembangan).");
if (!process.env.APP_URL)
  console.warn(`PERINGATAN: APP_URL belum diatur; tautan di email memakai http://localhost:${PORT}. Isi APP_URL saat deploy.`);

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (pathname.startsWith("/api/")) await handleApi(req, res, pathname);
    else serveStatic(req, res, pathname);
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message, code: e.code });
    console.error(e);
    sendJson(res, 500, { error: "Terjadi kesalahan di server." });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Panduan Sholat berjalan di http://localhost:${PORT}`));
}
module.exports = server;
