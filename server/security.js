"use strict";
/* Hash password (scrypt), token JWT HS256, parser cookie, dan rate limiter.
   Semua memakai modul crypto bawaan Node. */
const crypto = require("node:crypto");

/* ---------- Password ---------- */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const key = crypto.scryptSync(password, salt, expected.length, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(key, expected);
}

/* Dipakai saat email tidak ditemukan, agar waktu respons tidak membocorkan
   apakah email terdaftar. */
const DUMMY_HASH = hashPassword("dummy-password-for-timing");

/* ---------- JWT (HS256) ---------- */
const b64 = (buf) => Buffer.from(buf).toString("base64url");

function signToken(payload, secret, ttlSeconds) {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyToken(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try { given = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

/* ---------- Token sekali pakai (verifikasi email / reset password) ---------- */
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

/* ---------- Cookie ---------- */
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i < 0) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

/* ---------- Rate limiter sederhana (di memori) ----------
   limiter(key)         -> true jika masih boleh (menghitung 1 hit)
   limiter.blocked(key) -> true jika sudah melewati batas (tanpa menghitung)
   limiter.hit(key)     -> menghitung 1 hit (mis. hanya untuk login gagal)
   limiter.clear(key)   -> reset hitungan (mis. setelah login berhasil) */
function createLimiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, 60_000).unref();
  function entry(key) {
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) { e = { n: 0, reset: now + windowMs }; hits.set(key, e); }
    return e;
  }
  const limiter = (key) => ++entry(key).n <= max;
  limiter.blocked = (key) => entry(key).n >= max;
  limiter.hit = (key) => { entry(key).n++; };
  limiter.clear = (key) => { hits.delete(key); };
  return limiter;
}

module.exports = { randomToken, hashToken, hashPassword, verifyPassword, DUMMY_HASH, signToken, verifyToken, parseCookies, createLimiter };
