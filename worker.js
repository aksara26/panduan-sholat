import crypto from "node:crypto";

const QUIZ_LENGTH = 10;
const ATTEMPT_TTL_MS = 30 * 60 * 1000;
const SESSION_SECONDS = 7 * 24 * 3600;
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAIL_COOLDOWN_MS = 60 * 1000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const text = (v) => typeof v === "string" ? v.trim() : "";

const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { "cache-control": "no-store", ...headers }
  });

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function publicUser(u) {
  return {
    id: u.id,
    nama: u.nama,
    email: u.email,
    role: u.role,
    emailVerified: !!u.email_verified
  };
}

function cookies(req) {
  const out = {};
  for (const p of String(req.headers.get("cookie") || "").split(";")) {
    const i = p.indexOf("=");
    if (i < 0) continue;
    try {
      out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    } catch {}
  }
  return out;
}

function sessionCookie(token, secure = true) {
  const flags = [
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${SESSION_SECONDS}`
  ];
  if (secure) flags.push("Secure");
  return `session=${encodeURIComponent(token)}; ${flags.join("; ")}`;
}

function clearCookie(secure = true) {
  return `session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

function secret(env) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET belum diset atau terlalu pendek.");
  }
  return env.JWT_SECRET;
}

function signToken(payload, sec, ttl) {
  const h = Buffer.from(JSON.stringify({
    alg: "HS256",
    typ: "JWT"
  })).toString("base64url");

  const now = Math.floor(Date.now() / 1000);

  const p = Buffer.from(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + ttl
  })).toString("base64url");

  const s = crypto
    .createHmac("sha256", sec)
    .update(`${h}.${p}`)
    .digest("base64url");

  return `${h}.${p}.${s}`;
}

function verifyToken(token, sec) {
  try {
    const [h, p, s] = String(token || "").split(".");
    if (!h || !p || !s) return null;

    const expected = crypto
      .createHmac("sha256", sec)
      .update(`${h}.${p}`)
      .digest();

    const got = Buffer.from(s, "base64url");

    if (
      got.length !== expected.length ||
      !crypto.timingSafeEqual(got, expected)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(p, "base64url").toString("utf8")
    );

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function sha256(s) {
  return crypto
    .createHash("sha256")
    .update(String(s))
    .digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(
    password,
    salt,
    100000,
    32,
    "sha256"
  );

  return `pbkdf2$100000$${salt.toString("hex")}$${key.toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    const [kind, it, saltHex, keyHex] = String(stored).split("$");

    if (kind !== "pbkdf2" || Number(it) !== 100000) {
      return false;
    }

    const expected = Buffer.from(keyHex, "hex");

    const key = crypto.pbkdf2Sync(
      password,
      Buffer.from(saltHex, "hex"),
      Number(it),
      expected.length,
      "sha256"
    );

    return (
      key.length === expected.length &&
      crypto.timingSafeEqual(key, expected)
    );
  } catch {
    return false;
  }
}

function intParam(v) {
  const n = Number(v);

  if (!Number.isInteger(n) || n < 1) {
    throw new HttpError(400, "ID tidak valid.");
  }

  return n;
}

function appUrl(req, env) {
  return (env.APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
}

function ip(req) {
  return req.headers.get("CF-Connecting-IP") || "unknown";
}

async function readBody(req) {
  const ct = req.headers.get("content-type") || "";

  if (!ct.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "Content-Type harus application/json."
    );
  }

  const len = Number(req.headers.get("content-length") || 0);

  if (len > 65536) {
    throw new HttpError(413, "Body terlalu besar.");
  }

  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "JSON tidak valid.");
  }
}

async function currentUser(req, env) {
  const c = cookies(req);

  const p = verifyToken(
    c.session,
    secret(env)
  );

  if (!p?.sub) return null;

  const u = await env.DB
    .prepare("SELECT * FROM users WHERE id=?")
    .bind(Number(p.sub))
    .first();

  if (!u) return null;

  if (Number(u.pw_changed_at || 0) > Number(p.iat || 0)) {
    return null;
  }

  return u;
}

function needUser(u) {
  if (!u) {
    throw new HttpError(
      401,
      "Silakan masuk terlebih dahulu."
    );
  }

  return u;
}

function needAdmin(u) {
  needUser(u);

  if (u.role !== "admin") {
    throw new HttpError(403, "Khusus admin.");
  }

  return u;
}

function needVerified(u) {
  needUser(u);

  if (!u.email_verified) {
    throw new HttpError(
      403,
      "Verifikasi email kamu dulu. Cek kotak masuk atau folder spam.",
      "EMAIL_NOT_VERIFIED"
    );
  }

  return u;
}

const limits = new Map();

function allow(key, max, windowMs) {
  const now = Date.now();
  const e = limits.get(key);

  if (!e || e.reset <= now) {
    limits.set(key, {
      n: 1,
      reset: now + windowMs
    });
    return true;
  }

  if (e.n >= max) {
    return false;
  }

  e.n++;
  return true;
}

function hit(key, windowMs) {
  const now = Date.now();
  const e = limits.get(key);

  if (!e || e.reset <= now) {
    limits.set(key, {
      n: 1,
      reset: now + windowMs
    });
  } else {
    e.n++;
  }
}

async function issueToken(env, userId, type, ttl) {
  await env.DB
    .prepare(
      "DELETE FROM email_tokens WHERE user_id=? AND type=?"
    )
    .bind(userId, type)
    .run();

  const raw = randomToken();
  const now = Date.now();

  await env.DB
    .prepare(
      `INSERT INTO email_tokens
       (user_id,type,token_hash,created_at,expires_at)
       VALUES(?,?,?,?,?)`
    )
    .bind(
      userId,
      type,
      sha256(raw),
      now,
      now + ttl
    )
    .run();

  return raw;
}

async function lastTokenAge(env, userId, type) {
  const r = await env.DB
    .prepare(
      `SELECT created_at
       FROM email_tokens
       WHERE user_id=? AND type=?
       ORDER BY id DESC LIMIT 1`
    )
    .bind(userId, type)
    .first();

  return r ? Date.now() - Number(r.created_at) : Infinity;
}

async function consumeToken(env, raw, type) {
  if (
    typeof raw !== "string" ||
    raw.length < 20 ||
    raw.length > 100
  ) {
    throw new HttpError(
      400,
      "Tautan tidak valid atau sudah kedaluwarsa.",
      "TOKEN_INVALID"
    );
  }

  const r = await env.DB
    .prepare(
      `SELECT *
       FROM email_tokens
       WHERE token_hash=? AND type=?`
    )
    .bind(sha256(raw), type)
    .first();

  if (
    !r ||
    r.used_at ||
    Number(r.expires_at) < Date.now()
  ) {
    throw new HttpError(
      400,
      "Tautan tidak valid atau sudah kedaluwarsa.",
      "TOKEN_INVALID"
    );
  }

  await env.DB
    .prepare(
      "UPDATE email_tokens SET used_at=? WHERE id=?"
    )
    .bind(Date.now(), r.id)
    .run();

  return r.user_id;
}

async function sendMail(env, { to, subject, text: body }) {
  if (!env.RESEND_API_KEY) {
    console.log(
      `[EMAIL DEV]\nTo: ${to}\nSubject: ${subject}\n\n${body}`
    );
    return;
  }

  const from =
    env.RESEND_FROM ||
    "Panduan Sholat <onboarding@resend.dev>";

  const r = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: body
      })
    }
  );

  if (!r.ok) {
    throw new Error(`Email provider error ${r.status}: ${await r.text()}`);
  }
}

async function sendVerification(req, env, user) {
  const token = await issueToken(
    env,
    user.id,
    "verify",
    VERIFY_TTL_MS
  );

  await sendMail(env, {
    to: user.email,
    subject: "Verifikasi email — Panduan Sholat",
    text:
      `Assalamu'alaikum ${user.nama},\n\n` +
      `Klik tautan berikut untuk memverifikasi emailmu ` +
      `(berlaku 24 jam):\n\n` +
      `${appUrl(req, env)}/akun.html?verify=${token}\n\n` +
      `Jika kamu tidak mendaftar di Panduan Sholat, abaikan email ini.`
  });
}

async function register(req, env, b) {
  const key = `auth:${ip(req)}`;

  if (!allow(key, 100, 900000)) {
    throw new HttpError(
      429,
      "Terlalu banyak percobaan. Coba lagi dalam beberapa menit."
    );
  }

  const nama = text(b.nama);
  const email = text(b.email).toLowerCase();
  const password = b.password;

  if (nama.length < 2 || nama.length > 50) {
    throw new HttpError(
      400,
      "Nama harus 2–50 karakter."
    );
  }

  if (!EMAIL_RE.test(email)) {
    throw new HttpError(
      400,
      "Format email tidak valid."
    );
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    throw new HttpError(
      400,
      "Password harus 8–128 karakter."
    );
  }

  if (
    await env.DB
      .prepare("SELECT 1 FROM users WHERE email=?")
      .bind(email)
      .first()
  ) {
    throw new HttpError(
      409,
      "Email sudah terdaftar."
    );
  }

  const h = hashPassword(password);

  const r = await env.DB
    .prepare(
      "INSERT INTO users(nama,email,password_hash,role) VALUES(?,?,?,'user')"
    )
    .bind(nama, email, h)
    .run();

  const u = await env.DB
    .prepare("SELECT * FROM users WHERE id=?")
    .bind(r.meta.last_row_id)
    .first();

  try {
    await sendVerification(req, env, u);
  } catch (e) {
    console.error("verification email:", e);
  }

  return {
    user: publicUser(u),
    message:
      "Akun dibuat. Kami mengirim tautan verifikasi ke emailmu."
  };
}

async function login(req, env, b) {
  const key = `auth:${ip(req)}`;

  if (!allow(key, 100, 900000)) {
    throw new HttpError(
      429,
      "Terlalu banyak percobaan. Coba lagi dalam beberapa menit."
    );
  }

  const email = text(b.email).toLowerCase();
  const password = b.password;

  if (!email || typeof password !== "string") {
    throw new HttpError(
      400,
      "Email dan password wajib diisi."
    );
  }

  const fk = `login:${ip(req)}`;
  const failed = limits.get(fk);

  if (
    failed?.n >= 8 &&
    failed?.reset > Date.now()
  ) {
    throw new HttpError(
      429,
      "Terlalu banyak percobaan masuk yang gagal dari jaringan ini. Coba lagi dalam 15 menit."
    );
  }

  const u = await env.DB
    .prepare("SELECT * FROM users WHERE email=?")
    .bind(email)
    .first();

  const ok =
    u &&
    verifyPassword(password, u.password_hash);

  if (!ok) {
    hit(fk, 900000);

    throw new HttpError(
      401,
      "Email atau password salah."
    );
  }

  limits.delete(fk);

  const token = signToken(
    { sub: u.id },
    secret(env),
    SESSION_SECONDS
  );

  return {
    user: publicUser(u),
    __cookie: sessionCookie(
      token,
      new URL(req.url).protocol === "https:"
    )
  };
}

async function forgot(req, env, b) {
  const key = `mail:${ip(req)}`;

  if (!allow(key, 30, 900000)) {
    throw new HttpError(
      429,
      "Terlalu banyak permintaan email. Coba lagi dalam beberapa menit."
    );
  }

  const email = text(b.email).toLowerCase();

  if (!EMAIL_RE.test(email)) {
    throw new HttpError(
      400,
      "Format email tidak valid."
    );
  }

  const u = await env.DB
    .prepare("SELECT * FROM users WHERE email=?")
    .bind(email)
    .first();

  if (
    u &&
    await lastTokenAge(env, u.id, "reset") >=
      MAIL_COOLDOWN_MS
  ) {
    const token = await issueToken(
      env,
      u.id,
      "reset",
      RESET_TTL_MS
    );

    try {
      await sendMail(env, {
        to: u.email,
        subject: "Atur ulang password — Panduan Sholat",
        text:
          `Assalamu'alaikum ${u.nama},\n\n` +
          `Kami menerima permintaan mengatur ulang password. ` +
          `Klik tautan berikut (berlaku 1 jam):\n\n` +
          `${appUrl(req, env)}/akun.html?reset=${token}\n\n` +
          `Jika bukan kamu yang meminta, abaikan email ini.`
      });
    } catch (e) {
      console.error("reset email:", e);
    }
  }

  return {
    message:
      "Jika email itu terdaftar, tautan untuk mengatur ulang password sudah dikirim. Cek kotak masuk dan folder spam."
  };
}

async function quizStart(env, u, action = "start") {
  needVerified(u);

  const active = await env.DB
    .prepare(
      `SELECT id, started_at
       FROM attempts
       WHERE user_id=? AND status='ongoing'
       ORDER BY id DESC LIMIT 1`
    )
    .bind(u.id)
    .first();

  if (active) {
    const age = Date.now() - Number(active.started_at);

    if (age <= ATTEMPT_TTL_MS) {
      if (action === "check") {
        return {
          resume: true,
          attemptId: Number(active.id)
        };
      }

      if (action === "continue") {
        const a = await env.DB
          .prepare("SELECT * FROM attempts WHERE id=? AND user_id=?")
          .bind(active.id, u.id)
          .first();

        const ids = JSON.parse(a.question_ids);

        if (!ids.length) {
          throw new HttpError(
            409,
            "Kuis sebelumnya tidak memiliki soal. Mulai kuis baru."
          );
        }

        const placeholders = ids.map(() => "?").join(",");

        const { results: questions } = await env.DB
          .prepare(
            `SELECT id,prompt,options
             FROM questions
             WHERE id IN (${placeholders})`
          )
          .bind(...ids)
          .all();

        const ordered = ids
          .map(id => questions.find(q => Number(q.id) === Number(id)))
          .filter(Boolean);

        const { results: answers } = await env.DB
          .prepare(
            `SELECT question_id,is_correct
             FROM attempt_answers
             WHERE attempt_id=?`
          )
          .bind(active.id)
          .all();

        const answeredIds = answers.map(row => Number(row.question_id));

        const score = answers.reduce(
          (sum, row) => sum + Number(row.is_correct || 0),
          0
        );

        return {
          resume: true,
          attemptId: Number(active.id),
          score,
          answeredIds,
          questions: ordered.map(q => ({
            id: q.id,
            prompt: q.prompt,
            options: shuffle(JSON.parse(q.options))
          }))
        };
      }

      if (action === "restart") {
        await env.DB
          .prepare(
            `UPDATE attempts
             SET status='finished',
                 score=0,
                 finished_at=?,
                 duration_ms=?
             WHERE id=? AND status='ongoing'`
          )
          .bind(
            Date.now(),
            age,
            active.id
          )
          .run();
      } else {
        return {
          resume: true,
          attemptId: Number(active.id)
        };
      }
    } else {
      await env.DB
        .prepare(
          `UPDATE attempts
           SET status='finished',
               score=0,
               finished_at=?,
               duration_ms=?
           WHERE id=? AND status='ongoing'`
        )
        .bind(
          Date.now(),
          ATTEMPT_TTL_MS,
          active.id
        )
        .run();

      if (action === "check") {
        return { resume: false };
      }
    }
  } else if (action === "check") {
    return { resume: false };
  }

  const { results: pool } = await env.DB
    .prepare(
      "SELECT id,prompt,options FROM questions WHERE active=1"
    )
    .all();

  if (pool.length < QUIZ_LENGTH) {
    throw new HttpError(
      503,
      "Bank soal belum cukup. Hubungi admin."
    );
  }

  const picked = shuffle(pool).slice(
    0,
    QUIZ_LENGTH
  );

  const r = await env.DB
    .prepare(
      `INSERT INTO attempts
       (user_id,question_ids,total,started_at)
       VALUES(?,?,?,?)`
    )
    .bind(
      u.id,
      JSON.stringify(picked.map(q => q.id)),
      picked.length,
      Date.now()
    )
    .run();

  return {
    resume: false,
    attemptId: Number(r.meta.last_row_id),
    score: 0,
    answeredIds: [],
    questions: picked.map(q => ({
      id: q.id,
      prompt: q.prompt,
      options: shuffle(JSON.parse(q.options))
    }))
  };
}

async function ownAttempt(env, u, id) {
  const a = await env.DB
    .prepare(
      "SELECT * FROM attempts WHERE id=? AND user_id=?"
    )
    .bind(intParam(id), u.id)
    .first();

  if (!a) {
    throw new HttpError(
      404,
      "Kuis tidak ditemukan."
    );
  }

  if (a.status !== "ongoing") {
    throw new HttpError(
      409,
      "Kuis ini sudah selesai."
    );
  }

  if (
    Date.now() -
      Number(a.started_at) >
    ATTEMPT_TTL_MS
  ) {
    throw new HttpError(
      410,
      "Waktu kuis habis. Mulai kuis baru."
    );
  }

  return a;
}

async function leaderboardRows(env) {
  const q = `
    SELECT
      b.user_id,
      u.nama,
      b.score,
      b.total,
      b.duration_ms,
      b.finished_at
    FROM (
      SELECT
        user_id,
        score,
        total,
        duration_ms,
        finished_at,
        ROW_NUMBER() OVER (
          PARTITION BY user_id
          ORDER BY score DESC,
                   duration_ms ASC,
                   finished_at ASC
        ) rn
      FROM attempts
      WHERE status='finished'
    ) b
    JOIN users u ON u.id=b.user_id
    WHERE b.rn=1
    ORDER BY
      b.score DESC,
      b.duration_ms ASC,
      b.finished_at ASC
  `;

  return (await env.DB.prepare(q).all()).results;
}

async function rankOf(env, id) {
  const rows = await leaderboardRows(env);
  const i = rows.findIndex(
    r => r.user_id === id
  );

  return i < 0 ? null : i + 1;
}

function validateQuestion(b) {
  const prompt = text(b.prompt);
  const correct = text(b.correct);
  const explain = text(b.explain);

  const options = Array.isArray(b.options)
    ? b.options.map(text).filter(Boolean)
    : [];

  if (prompt.length < 5 || prompt.length > 500) {
    throw new HttpError(
      400,
      "Pertanyaan harus 5–500 karakter."
    );
  }

  if (options.length < 2 || options.length > 6) {
    throw new HttpError(
      400,
      "Pilihan jawaban harus 2–6."
    );
  }

  if (
    new Set(options).size !== options.length
  ) {
    throw new HttpError(
      400,
      "Pilihan jawaban tidak boleh kembar."
    );
  }

  if (!options.includes(correct)) {
    throw new HttpError(
      400,
      "Jawaban benar harus sama persis dengan salah satu pilihan."
    );
  }

  return {
    prompt,
    options,
    correct,
    explain: explain.slice(0, 1000)
  };
}

async function handleApi(req, env, u) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  let b = {};

  if (
    method !== "GET" &&
    method !== "HEAD"
  ) {
    b = await readBody(req);
  }

  const idMatch =
    path.match(/^\/api\/admin\/users\/(\d+)$/);

  const qMatch =
    path.match(/^\/api\/admin\/questions\/(\d+)$/);

  if (
    method === "POST" &&
    path === "/api/register"
  ) {
    return register(req, env, b);
  }

  if (
    method === "POST" &&
    path === "/api/login"
  ) {
    return login(req, env, b);
  }

  if (
    method === "POST" &&
    path === "/api/logout"
  ) {
    return {
      ok: true,
      __clearCookie: true
    };
  }

  if (
    method === "GET" &&
    path === "/api/me"
  ) {
    return {
      user: u ? publicUser(u) : null
    };
  }

  if (
    method === "POST" &&
    path === "/api/verify"
  ) {
    const uid = await consumeToken(
      env,
      b.token,
      "verify"
    );

    await env.DB
      .prepare(
        "UPDATE users SET email_verified=1 WHERE id=?"
      )
      .bind(uid)
      .run();

    return { ok: true };
  }

  if (
    method === "POST" &&
    path === "/api/resend-verification"
  ) {
    needUser(u);

    if (u.email_verified) {
      return {
        message: "Emailmu sudah terverifikasi."
      };
    }

    const key = `mail:${ip(req)}`;

    if (!allow(key, 30, 900000)) {
      throw new HttpError(
        429,
        "Terlalu banyak permintaan email. Coba lagi dalam beberapa menit."
      );
    }

    if (
      await lastTokenAge(
        env,
        u.id,
        "verify"
      ) < MAIL_COOLDOWN_MS
    ) {
      throw new HttpError(
        429,
        "Tunggu sekitar satu menit sebelum meminta email lagi."
      );
    }

    try {
      await sendVerification(
        req,
        env,
        u
      );
    } catch (e) {
      console.error(e);
    }

    return {
      message:
        "Tautan verifikasi dikirim ulang. Cek kotak masuk dan folder spam."
    };
  }

  if (
    method === "POST" &&
    path === "/api/forgot"
  ) {
    return forgot(req, env, b);
  }

  if (
    method === "POST" &&
    path === "/api/reset"
  ) {
    const key = `auth:${ip(req)}`;

    if (!allow(key, 100, 900000)) {
      throw new HttpError(
        429,
        "Terlalu banyak percobaan. Coba lagi dalam beberapa menit."
      );
    }

    if (
      typeof b.password !== "string" ||
      b.password.length < 8 ||
      b.password.length > 128
    ) {
      throw new HttpError(
        400,
        "Password harus 8–128 karakter."
      );
    }

    const uid = await consumeToken(
      env,
      b.token,
      "reset"
    );

    await env.DB
      .prepare(
        `UPDATE users
         SET password_hash=?,
             email_verified=1,
             pw_changed_at=?
         WHERE id=?`
      )
      .bind(
        hashPassword(b.password),
        Math.floor(Date.now() / 1000),
        uid
      )
      .run();

    await env.DB
      .prepare(
        `DELETE FROM email_tokens
         WHERE user_id=? AND type='reset'`
      )
      .bind(uid)
      .run();

    return {
      ok: true,
      message:
        "Password berhasil diubah. Silakan masuk dengan password baru."
    };
  }

  if (
    method === "POST" &&
    path === "/api/quiz/start"
  ) {
    return quizStart(env, u, text(b.action) || "start");
  }

  if (
    method === "POST" &&
    path === "/api/quiz/answer"
  ) {
    needUser(u);

    const a = await ownAttempt(
      env,
      u,
      b.attemptId
    );

    const qid = intParam(b.questionId);
    const answer = text(b.answer);

    const ids = JSON.parse(
      a.question_ids
    );

    if (!ids.includes(qid)) {
      throw new HttpError(
        400,
        "Soal bukan bagian kuis ini."
      );
    }

    const q = await env.DB
      .prepare(
        "SELECT * FROM questions WHERE id=?"
      )
      .bind(qid)
      .first();

    if (!q) {
      throw new HttpError(
        404,
        "Soal sudah dihapus admin. Mulai kuis baru."
      );
    }

    if (
      !JSON.parse(q.options).includes(answer)
    ) {
      throw new HttpError(
        400,
        "Jawaban tidak valid."
      );
    }

    if (
      await env.DB
        .prepare(
          `SELECT 1
           FROM attempt_answers
           WHERE attempt_id=? AND question_id=?`
        )
        .bind(a.id, qid)
        .first()
    ) {
      throw new HttpError(
        409,
        "Soal ini sudah dijawab."
      );
    }

    const correct =
      answer === q.correct ? 1 : 0;

    await env.DB
      .prepare(
        `INSERT INTO attempt_answers
         (attempt_id,question_id,answer,is_correct)
         VALUES(?,?,?,?)`
      )
      .bind(
        a.id,
        qid,
        answer,
        correct
      )
      .run();

    return {
      correct: !!correct,
      correctAnswer: q.correct,
      explain: q.explain
    };
  }

  if (
    method === "POST" &&
    path === "/api/quiz/finish"
  ) {
    needUser(u);

    const a = await ownAttempt(
      env,
      u,
      b.attemptId
    );

    const row = await env.DB
      .prepare(
        `SELECT
           COUNT(*) n,
           COALESCE(SUM(is_correct),0) s
         FROM attempt_answers
         WHERE attempt_id=?`
      )
      .bind(a.id)
      .first();

    if (
      Number(row.n) <
      Number(a.total)
    ) {
      throw new HttpError(
        400,
        "Masih ada soal yang belum dijawab."
      );
    }

    const now = Date.now();
    const duration =
      now - Number(a.started_at);

    await env.DB
      .prepare(
        `UPDATE attempts
         SET status='finished',
             score=?,
             finished_at=?,
             duration_ms=?
         WHERE id=?`
      )
      .bind(
        Number(row.s),
        now,
        duration,
        a.id
      )
      .run();

    return {
      score: Number(row.s),
      total: Number(a.total),
      durationMs: duration,
      rank: await rankOf(env, u.id)
    };
  }

  if (
    method === "GET" &&
    path === "/api/leaderboard"
  ) {
    needVerified(u);

    const rows =
      await leaderboardRows(env);

    const top = rows
      .slice(0, 50)
      .map((r, i) => ({
        rank: i + 1,
        nama: r.nama,
        score: r.score,
        total: r.total,
        durationMs: r.duration_ms,
        me: r.user_id === u.id
      }));

    const i = rows.findIndex(
      r => r.user_id === u.id
    );

    return {
      top,
      participants: rows.length,
      myRank: i < 0 ? null : i + 1
    };
  }

  if (
    method === "GET" &&
    path === "/api/quiz/history"
  ) {
    needUser(u);

    const { results } =
      await env.DB
        .prepare(
          `SELECT
             id,
             score,
             total,
             duration_ms durationMs,
             finished_at finishedAt
           FROM attempts
           WHERE user_id=?
             AND status='finished'
           ORDER BY id DESC
           LIMIT 20`
        )
        .bind(u.id)
        .all();

    return {
      attempts: results
    };
  }

  if (
    method === "GET" &&
    path === "/api/admin/stats"
  ) {
    needAdmin(u);

    const one = async sql =>
      await env.DB
        .prepare(sql)
        .first();

    const avg = await one(
      `SELECT
         AVG(score*100.0/total) a
       FROM attempts
       WHERE status='finished'
         AND total>0`
    );

    const rows =
      await leaderboardRows(env);

    return {
      users: Number(
        (await one(
          "SELECT COUNT(*) n FROM users"
        )).n
      ),

      admins: Number(
        (await one(
          "SELECT COUNT(*) n FROM users WHERE role='admin'"
        )).n
      ),

      questions: Number(
        (await one(
          "SELECT COUNT(*) n FROM questions WHERE active=1"
        )).n
      ),

      finishedAttempts: Number(
        (await one(
          "SELECT COUNT(*) n FROM attempts WHERE status='finished'"
        )).n
      ),

      avgScorePct:
        Math.round(
          Number(avg.a || 0) * 10
        ) / 10,

      participants: rows.length
    };
  }

  if (
    method === "GET" &&
    path === "/api/admin/users"
  ) {
    needAdmin(u);

    const { results } =
      await env.DB
        .prepare(
          `SELECT
             u.id,
             u.nama,
             u.email,
             u.role,
             u.email_verified emailVerified,
             u.created_at createdAt,
             (
               SELECT COUNT(*)
               FROM attempts a
               WHERE a.user_id=u.id
                 AND a.status='finished'
             ) attempts
           FROM users u
           ORDER BY u.id`
        )
        .all();

    return {
      users: results
    };
  }

  if (
    idMatch &&
    (method === "PATCH" ||
      method === "DELETE")
  ) {
    needAdmin(u);

    const id = intParam(
      idMatch[1]
    );

    if (method === "DELETE") {
      if (id === u.id) {
        throw new HttpError(
          400,
          "Kamu tidak bisa menghapus akunmu sendiri."
        );
      }

      const r = await env.DB
        .prepare(
          "DELETE FROM users WHERE id=?"
        )
        .bind(id)
        .run();

      if (!r.meta.changes) {
        throw new HttpError(
          404,
          "User tidak ditemukan."
        );
      }

      return { ok: true };
    }

    if (
      b.role === undefined &&
      b.verified === undefined
    ) {
      throw new HttpError(
        400,
        "Tidak ada perubahan."
      );
    }

    if (
      !(await env.DB
        .prepare(
          "SELECT 1 FROM users WHERE id=?"
        )
        .bind(id)
        .first())
    ) {
      throw new HttpError(
        404,
        "User tidak ditemukan."
      );
    }

    if (b.role !== undefined) {
      if (
        b.role !== "user" &&
        b.role !== "admin"
      ) {
        throw new HttpError(
          400,
          "Role tidak valid."
        );
      }

      if (id === u.id) {
        throw new HttpError(
          400,
          "Kamu tidak bisa mengubah role akunmu sendiri."
        );
      }

      await env.DB
        .prepare(
          "UPDATE users SET role=? WHERE id=?"
        )
        .bind(b.role, id)
        .run();
    }

    if (b.verified !== undefined) {
      if (
        typeof b.verified !== "boolean"
      ) {
        throw new HttpError(
          400,
          "Nilai verified tidak valid."
        );
      }

      await env.DB
        .prepare(
          "UPDATE users SET email_verified=? WHERE id=?"
        )
        .bind(
          b.verified ? 1 : 0,
          id
        )
        .run();
    }

    return { ok: true };
  }

  if (
    method === "GET" &&
    path === "/api/admin/questions"
  ) {
    needAdmin(u);

    const { results } =
      await env.DB
        .prepare(
          `SELECT
             id,
             prompt,
             options,
             correct,
             explain,
             kind,
             active
           FROM questions
           ORDER BY id`
        )
        .all();

    return {
      questions: results.map(r => ({
        ...r,
        options: JSON.parse(r.options),
        active: !!r.active
      }))
    };
  }

  if (
    method === "POST" &&
    path === "/api/admin/questions"
  ) {
    needAdmin(u);

    const q = validateQuestion(b);

    try {
      const r = await env.DB
        .prepare(
          `INSERT INTO questions
           (prompt,options,correct,explain,kind)
           VALUES(?,?,?,?,'manual')`
        )
        .bind(
          q.prompt,
          JSON.stringify(q.options),
          q.correct,
          q.explain
        )
        .run();

      return {
        id: Number(r.meta.last_row_id)
      };
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) {
        throw new HttpError(
          409,
          "Pertanyaan yang sama sudah ada."
        );
      }

      throw e;
    }
  }

  if (
    qMatch &&
    (method === "PUT" ||
      method === "DELETE")
  ) {
    needAdmin(u);

    const id = intParam(
      qMatch[1]
    );

    if (method === "DELETE") {
      const r = await env.DB
        .prepare(
          "DELETE FROM questions WHERE id=?"
        )
        .bind(id)
        .run();

      if (!r.meta.changes) {
        throw new HttpError(
          404,
          "Soal tidak ditemukan."
        );
      }

      return { ok: true };
    }

    if (
      !(await env.DB
        .prepare(
          "SELECT id FROM questions WHERE id=?"
        )
        .bind(id)
        .first())
    ) {
      throw new HttpError(
        404,
        "Soal tidak ditemukan."
      );
    }

    const q = validateQuestion(b);
    const active =
      b.active === false ? 0 : 1;

    try {
      await env.DB
        .prepare(
          `UPDATE questions
           SET prompt=?,
               options=?,
               correct=?,
               explain=?,
               active=?
           WHERE id=?`
        )
        .bind(
          q.prompt,
          JSON.stringify(q.options),
          q.correct,
          q.explain,
          active,
          id
        )
        .run();
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) {
        throw new HttpError(
          409,
          "Pertanyaan yang sama sudah ada."
        );
      }

      throw e;
    }

    return { ok: true };
  }

  if (
    method === "POST" &&
    path === "/api/admin/leaderboard/reset"
  ) {
    needAdmin(u);

    if (b.confirm !== "RESET") {
      throw new HttpError(
        400,
        'Kirim confirm: "RESET" untuk mengonfirmasi.'
      );
    }

    const r = await env.DB
      .prepare("DELETE FROM attempts")
      .run();

    return {
      deleted: Number(r.meta.changes)
    };
  }

  throw new HttpError(
    404,
    "Endpoint tidak ditemukan."
  );
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'"
  };
}

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);

      if (
        url.pathname.startsWith("/api/")
      ) {
        if (
          req.method !== "GET" &&
          req.method !== "HEAD"
        ) {
          const origin =
            req.headers.get("Origin");

          if (
            origin &&
            origin !== url.origin
          ) {
            return json(
              {
                error:
                  "Origin tidak diizinkan."
              },
              403
            );
          }
        }

        const u =
          await currentUser(req, env);

        const result =
          await handleApi(
            req,
            env,
            u
          );

        const headers = {
          ...securityHeaders()
        };

        if (result.__cookie) {
          headers["set-cookie"] =
            result.__cookie;
        }

        if (result.__clearCookie) {
          headers["set-cookie"] =
            clearCookie(
              url.protocol ===
                "https:"
            );
        }

        delete result.__cookie;
        delete result.__clearCookie;

        return json(
          result,
          200,
          headers
        );
      }

      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);

      if (e instanceof HttpError) {
        return json(
          {
            error: e.message,
            code:
              e.code ||
              "BAD_REQUEST"
          },
          e.status,
          securityHeaders()
        );
      }

      return json(
        {
          error:
            "Terjadi kesalahan server."
        },
        500,
        securityHeaders()
      );
    }
  }
};
