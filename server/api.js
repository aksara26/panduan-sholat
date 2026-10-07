"use strict";
/* Semua endpoint API. Setiap handler menerima ctx = {req, res, body, params, user, ip}
   dan mengembalikan objek JSON (atau melempar HttpError). */
const crypto = require("node:crypto");
const db = require("./db");
const sec = require("./security");
const mailer = require("./mailer");

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const QUIZ_LENGTH = 10;
const ATTEMPT_TTL_MS = 30 * 60 * 1000; // kuis harus selesai dalam 30 menit
const SESSION_SECONDS = 7 * 24 * 3600;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// Rate limit login utama berbasis IP agar satu penyerang tidak dapat mengunci akun
// korban hanya dengan mengetahui alamat emailnya.
const authLimiter = sec.createLimiter(100, 15 * 60 * 1000);
const mailLimiter = sec.createLimiter(30, 15 * 60 * 1000);
const loginFailLimiter = sec.createLimiter(8, 15 * 60 * 1000);
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAIL_COOLDOWN_MS = 60 * 1000;

/* ---------- Util ---------- */
const publicUser = (u) => ({ id: u.id, nama: u.nama, email: u.email, role: u.role, emailVerified: !!u.email_verified });
const appUrl = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
const str = (v) => (typeof v === "string" ? v.trim() : "");
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setSession(res, user) {
  const token = sec.signToken({ sub: user.id }, process.env.JWT_SECRET, SESSION_SECONDS);
  const flags = ["HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${SESSION_SECONDS}`];
  if (process.env.COOKIE_SECURE === "1") flags.push("Secure");
  res.setHeader("Set-Cookie", `session=${encodeURIComponent(token)}; ${flags.join("; ")}`);
}
function clearSession(res) {
  res.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
}

function needUser(ctx) { if (!ctx.user) throw new HttpError(401, "Silakan masuk terlebih dahulu."); return ctx.user; }
function needAdmin(ctx) {
  const u = needUser(ctx);
  if (u.role !== "admin") throw new HttpError(403, "Khusus admin.");
  return u;
}
function needVerified(ctx) {
  const u = needUser(ctx);
  if (!u.email_verified)
    throw new HttpError(403, "Verifikasi email kamu dulu. Cek kotak masuk (atau folder spam) untuk tautan verifikasi.", "EMAIL_NOT_VERIFIED");
  return u;
}
function checkMailRate(ctx) {
  if (!mailLimiter(ctx.ip)) throw new HttpError(429, "Terlalu banyak permintaan email. Coba lagi dalam beberapa menit.");
}
function checkAuthRate(ctx) {
  if (!authLimiter(ctx.ip)) throw new HttpError(429, "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.");
}
function intParam(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "ID tidak valid.");
  return n;
}

/* ---------- Auth ---------- */
function register(ctx) {
  checkAuthRate(ctx);
  const nama = str(ctx.body.nama), email = str(ctx.body.email).toLowerCase(), password = ctx.body.password;
  if (nama.length < 2 || nama.length > 50) throw new HttpError(400, "Nama harus 2–50 karakter.");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Format email tidak valid.");
  if (typeof password !== "string" || password.length < 8 || password.length > 128)
    throw new HttpError(400, "Password harus 8–128 karakter.");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email))
    throw new HttpError(409, "Email sudah terdaftar.");
  const info = db.prepare("INSERT INTO users (nama, email, password_hash, role) VALUES (?,?,?, 'user')")
    .run(nama, email, sec.hashPassword(password));
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  sendVerification(user);
  setSession(ctx.res, user);
  return { user: publicUser(user), message: "Akun dibuat. Kami mengirim tautan verifikasi ke emailmu." };
}

/* ---------- Token email: verifikasi & reset ---------- */
function issueToken(userId, type, ttlMs) {
  db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND type = ?").run(userId, type); // hanya token terbaru yang berlaku
  const raw = sec.randomToken(), now = Date.now();
  db.prepare("INSERT INTO email_tokens (user_id, type, token_hash, created_at, expires_at) VALUES (?,?,?,?,?)")
    .run(userId, type, sec.hashToken(raw), now, now + ttlMs);
  return raw;
}
function lastTokenAge(userId, type) {
  const r = db.prepare("SELECT created_at FROM email_tokens WHERE user_id = ? AND type = ? ORDER BY id DESC LIMIT 1").get(userId, type);
  return r ? Date.now() - r.created_at : Infinity;
}
/* Memakai token (sekali pakai). Mengembalikan user_id atau melempar 400. */
function consumeToken(raw, type) {
  const row = typeof raw === "string" && raw.length >= 20 && raw.length <= 100
    ? db.prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND type = ?").get(sec.hashToken(raw), type) : null;
  if (!row || row.used_at || row.expires_at < Date.now())
    throw new HttpError(400, "Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.", "TOKEN_INVALID");
  db.prepare("UPDATE email_tokens SET used_at = ? WHERE id = ?").run(Date.now(), row.id);
  return row.user_id;
}

function sendVerification(user) {
  const token = issueToken(user.id, "verify", VERIFY_TTL_MS);
  mailer.sendInBackground({
    to: user.email,
    subject: "Verifikasi email — Panduan Sholat",
    text: `Assalamu'alaikum ${user.nama},\n\nKlik tautan berikut untuk memverifikasi emailmu (berlaku 24 jam):\n\n${appUrl()}/akun.html?verify=${token}\n\nJika kamu tidak mendaftar di Panduan Sholat, abaikan email ini.`,
  });
}

function verifyEmail(ctx) {
  const userId = consumeToken(ctx.body.token, "verify");
  db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
  return { ok: true };
}

function resendVerification(ctx) {
  const user = needUser(ctx);
  if (user.email_verified) return { message: "Emailmu sudah terverifikasi." };
  checkMailRate(ctx);
  if (lastTokenAge(user.id, "verify") < MAIL_COOLDOWN_MS)
    throw new HttpError(429, "Tunggu sekitar satu menit sebelum meminta email lagi.");
  sendVerification(user);
  return { message: "Tautan verifikasi dikirim ulang. Cek kotak masuk dan folder spam." };
}

const FORGOT_REPLY = { message: "Jika email itu terdaftar, tautan untuk mengatur ulang password sudah dikirim. Cek kotak masuk dan folder spam." };

function forgotPassword(ctx) {
  checkMailRate(ctx);
  const email = str(ctx.body.email).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Format email tidak valid.");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  // Respons selalu sama, ada atau tidaknya akun, agar email tidak bisa ditebak.
  if (user && lastTokenAge(user.id, "reset") >= MAIL_COOLDOWN_MS) {
    const token = issueToken(user.id, "reset", RESET_TTL_MS);
    mailer.sendInBackground({
      to: user.email,
      subject: "Atur ulang password — Panduan Sholat",
      text: `Assalamu'alaikum ${user.nama},\n\nKami menerima permintaan mengatur ulang password. Klik tautan berikut (berlaku 1 jam):\n\n${appUrl()}/akun.html?reset=${token}\n\nJika bukan kamu yang meminta, abaikan email ini; passwordmu tidak berubah.`,
    });
  }
  return FORGOT_REPLY;
}

function resetPassword(ctx) {
  checkAuthRate(ctx);
  const password = ctx.body.password;
  if (typeof password !== "string" || password.length < 8 || password.length > 128)
    throw new HttpError(400, "Password harus 8–128 karakter.");   // dicek sebelum token dipakai
  const userId = consumeToken(ctx.body.token, "reset");
  // Membuktikan akses ke email = email terverifikasi. Sesi lama dicabut.
  db.prepare("UPDATE users SET password_hash = ?, email_verified = 1, pw_changed_at = ? WHERE id = ?")
    .run(sec.hashPassword(password), Math.floor(Date.now() / 1000), userId);
  db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND type = 'reset'").run(userId);
  return { ok: true, message: "Password berhasil diubah. Silakan masuk dengan password baru." };
}

function login(ctx) {
  checkAuthRate(ctx);
  const email = str(ctx.body.email).toLowerCase(), password = ctx.body.password;
  if (!email || typeof password !== "string") throw new HttpError(400, "Email dan password wajib diisi.");
  if (loginFailLimiter.blocked(ctx.ip))
    throw new HttpError(429, "Terlalu banyak percobaan masuk yang gagal dari jaringan ini. Coba lagi dalam 15 menit.");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  const ok = sec.verifyPassword(password, user ? user.password_hash : sec.DUMMY_HASH);
  if (!user || !ok) { loginFailLimiter.hit(ctx.ip); throw new HttpError(401, "Email atau password salah."); }
  loginFailLimiter.clear(ctx.ip);
  setSession(ctx.res, user);
  return { user: publicUser(user) };
}

function logout(ctx) { clearSession(ctx.res); return { ok: true }; }
function me(ctx) { return { user: ctx.user ? publicUser(ctx.user) : null }; }

/* ---------- Kuis (dinilai di server) ---------- */
function quizStart(ctx) {
  const user = needVerified(ctx);
  // Satu attempt aktif per akun mencegah database dibanjiri request berulang.
  // Attempt yang melewati TTL ditutup dulu agar pengguna tetap bisa memulai lagi.
  const active = db.prepare("SELECT id, started_at FROM attempts WHERE user_id = ? AND status = 'ongoing' ORDER BY id DESC LIMIT 1").get(user.id);
  if (active) {
    if (Date.now() - active.started_at <= ATTEMPT_TTL_MS)
      throw new HttpError(409, "Kamu masih memiliki kuis yang sedang berlangsung.");
    db.prepare("UPDATE attempts SET status='finished', score=0, finished_at=?, duration_ms=? WHERE id=? AND status='ongoing'")
      .run(Date.now(), ATTEMPT_TTL_MS, active.id);
  }
  const pool = db.prepare("SELECT id, prompt, options FROM questions WHERE active = 1").all();
  if (pool.length < QUIZ_LENGTH) throw new HttpError(503, "Bank soal belum cukup. Hubungi admin.");
  const picked = shuffle(pool).slice(0, QUIZ_LENGTH);
  const info = db.prepare("INSERT INTO attempts (user_id, question_ids, total, started_at) VALUES (?,?,?,?)")
    .run(user.id, JSON.stringify(picked.map((q) => q.id)), picked.length, Date.now());
  return {
    attemptId: Number(info.lastInsertRowid),
    questions: picked.map((q) => ({ id: q.id, prompt: q.prompt, options: shuffle(JSON.parse(q.options)) })),
  };
}

function getOwnAttempt(user, id) {
  const a = db.prepare("SELECT * FROM attempts WHERE id = ? AND user_id = ?").get(intParam(id), user.id);
  if (!a) throw new HttpError(404, "Kuis tidak ditemukan.");
  if (a.status !== "ongoing") throw new HttpError(409, "Kuis ini sudah selesai.");
  if (Date.now() - a.started_at > ATTEMPT_TTL_MS) throw new HttpError(410, "Waktu kuis habis. Mulai kuis baru.");
  return a;
}

function quizAnswer(ctx) {
  const user = needUser(ctx);
  const a = getOwnAttempt(user, ctx.body.attemptId);
  const qid = intParam(ctx.body.questionId);
  const answer = str(ctx.body.answer);
  if (!JSON.parse(a.question_ids).includes(qid)) throw new HttpError(400, "Soal bukan bagian kuis ini.");
  const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(qid);
  if (!q) throw new HttpError(404, "Soal sudah dihapus admin. Mulai kuis baru.");
  if (!JSON.parse(q.options).includes(answer)) throw new HttpError(400, "Jawaban tidak valid.");
  if (db.prepare("SELECT 1 FROM attempt_answers WHERE attempt_id = ? AND question_id = ?").get(a.id, qid))
    throw new HttpError(409, "Soal ini sudah dijawab.");
  const correct = answer === q.correct ? 1 : 0;
  db.prepare("INSERT INTO attempt_answers (attempt_id, question_id, answer, is_correct) VALUES (?,?,?,?)")
    .run(a.id, qid, answer, correct);
  return { correct: !!correct, correctAnswer: q.correct, explain: q.explain };
}

function quizFinish(ctx) {
  const user = needUser(ctx);
  const a = getOwnAttempt(user, ctx.body.attemptId);
  const row = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(is_correct),0) AS s FROM attempt_answers WHERE attempt_id = ?").get(a.id);
  if (row.n < a.total) throw new HttpError(400, "Masih ada soal yang belum dijawab.");
  const now = Date.now();
  db.prepare("UPDATE attempts SET status='finished', score=?, finished_at=?, duration_ms=? WHERE id=?")
    .run(row.s, now, now - a.started_at, a.id);
  return { score: row.s, total: a.total, durationMs: now - a.started_at, rank: rankOf(user.id) };
}

/* Peringkat: skor terbaik tiap user; seri dipecah oleh waktu tercepat,
   lalu yang lebih dulu menyelesaikan. */
const BEST_SQL = `
  SELECT user_id, score, total, duration_ms, finished_at FROM (
    SELECT user_id, score, total, duration_ms, finished_at,
           ROW_NUMBER() OVER (PARTITION BY user_id
                              ORDER BY score DESC, duration_ms ASC, finished_at ASC) AS rn
    FROM attempts WHERE status = 'finished'
  ) WHERE rn = 1`;

function leaderboardRows() {
  return db.prepare(`
    SELECT b.user_id, u.nama, b.score, b.total, b.duration_ms
    FROM (${BEST_SQL}) b JOIN users u ON u.id = b.user_id
    ORDER BY b.score DESC, b.duration_ms ASC, b.finished_at ASC`).all();
}
function rankOf(userId) {
  const i = leaderboardRows().findIndex((r) => r.user_id === userId);
  return i < 0 ? null : i + 1;
}

function leaderboard(ctx) {
  const user = needVerified(ctx);
  const rows = leaderboardRows();
  const top = rows.slice(0, 50).map((r, i) => ({
    rank: i + 1, nama: r.nama, score: r.score, total: r.total, durationMs: r.duration_ms, me: r.user_id === user.id,
  }));
  const idx = rows.findIndex((r) => r.user_id === user.id);
  return { top, participants: rows.length, myRank: idx < 0 ? null : idx + 1 };
}

function history(ctx) {
  const user = needUser(ctx);
  const rows = db.prepare(`SELECT id, score, total, duration_ms AS durationMs, finished_at AS finishedAt
    FROM attempts WHERE user_id = ? AND status = 'finished' ORDER BY id DESC LIMIT 20`).all(user.id);
  return { attempts: rows };
}

/* ---------- Admin ---------- */
function adminStats(ctx) {
  needAdmin(ctx);
  const one = (sql) => db.prepare(sql).get();
  return {
    users: one("SELECT COUNT(*) AS n FROM users").n,
    admins: one("SELECT COUNT(*) AS n FROM users WHERE role='admin'").n,
    questions: one("SELECT COUNT(*) AS n FROM questions WHERE active=1").n,
    finishedAttempts: one("SELECT COUNT(*) AS n FROM attempts WHERE status='finished'").n,
    avgScorePct: Math.round((one("SELECT AVG(score*100.0/total) AS a FROM attempts WHERE status='finished' AND total>0").a || 0) * 10) / 10,
    participants: leaderboardRows().length,
  };
}

function adminUsers(ctx) {
  needAdmin(ctx);
  return { users: db.prepare(`
    SELECT u.id, u.nama, u.email, u.role, u.email_verified AS emailVerified, u.created_at AS createdAt,
           (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.status='finished') AS attempts
    FROM users u ORDER BY u.id`).all() };
}

function adminSetRole(ctx) {
  const admin = needAdmin(ctx);
  const id = intParam(ctx.params.id), { role, verified } = ctx.body;
  if (role === undefined && verified === undefined) throw new HttpError(400, "Tidak ada perubahan.");
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) throw new HttpError(404, "User tidak ditemukan.");
  if (role !== undefined) {
    if (role !== "user" && role !== "admin") throw new HttpError(400, "Role tidak valid.");
    if (id === admin.id) throw new HttpError(400, "Kamu tidak bisa mengubah role akunmu sendiri.");
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  }
  if (verified !== undefined) {
    if (typeof verified !== "boolean") throw new HttpError(400, "Nilai verified tidak valid.");
    db.prepare("UPDATE users SET email_verified = ? WHERE id = ?").run(verified ? 1 : 0, id);
  }
  return { ok: true };
}

function adminDeleteUser(ctx) {
  const admin = needAdmin(ctx);
  const id = intParam(ctx.params.id);
  if (id === admin.id) throw new HttpError(400, "Kamu tidak bisa menghapus akunmu sendiri.");
  const r = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "User tidak ditemukan.");
  return { ok: true };
}

function validateQuestion(b) {
  const prompt = str(b.prompt), correct = str(b.correct), explain = str(b.explain);
  const options = Array.isArray(b.options) ? b.options.map(str).filter(Boolean) : [];
  if (prompt.length < 5 || prompt.length > 500) throw new HttpError(400, "Pertanyaan harus 5–500 karakter.");
  if (options.length < 2 || options.length > 6) throw new HttpError(400, "Pilihan jawaban harus 2–6.");
  if (new Set(options).size !== options.length) throw new HttpError(400, "Pilihan jawaban tidak boleh kembar.");
  if (!options.includes(correct)) throw new HttpError(400, "Jawaban benar harus sama persis dengan salah satu pilihan.");
  return { prompt, options, correct, explain: explain.slice(0, 1000) };
}

function adminQuestions(ctx) {
  needAdmin(ctx);
  const rows = db.prepare("SELECT id, prompt, options, correct, explain, kind, active FROM questions ORDER BY id").all();
  return { questions: rows.map((r) => ({ ...r, options: JSON.parse(r.options), active: !!r.active })) };
}

function adminAddQuestion(ctx) {
  needAdmin(ctx);
  const q = validateQuestion(ctx.body);
  try {
    const info = db.prepare("INSERT INTO questions (prompt, options, correct, explain, kind) VALUES (?,?,?,?, 'manual')")
      .run(q.prompt, JSON.stringify(q.options), q.correct, q.explain);
    return { id: Number(info.lastInsertRowid) };
  } catch (e) {
    if (/UNIQUE/.test(String(e.message))) throw new HttpError(409, "Pertanyaan yang sama sudah ada.");
    throw e;
  }
}

function adminUpdateQuestion(ctx) {
  needAdmin(ctx);
  const id = intParam(ctx.params.id);
  const cur = db.prepare("SELECT id FROM questions WHERE id = ?").get(id);
  if (!cur) throw new HttpError(404, "Soal tidak ditemukan.");
  const q = validateQuestion(ctx.body);
  const active = ctx.body.active === false ? 0 : 1;
  try {
    db.prepare("UPDATE questions SET prompt=?, options=?, correct=?, explain=?, active=? WHERE id=?")
      .run(q.prompt, JSON.stringify(q.options), q.correct, q.explain, active, id);
  } catch (e) {
    if (/UNIQUE/.test(String(e.message))) throw new HttpError(409, "Pertanyaan yang sama sudah ada.");
    throw e;
  }
  return { ok: true };
}

function adminDeleteQuestion(ctx) {
  needAdmin(ctx);
  const r = db.prepare("DELETE FROM questions WHERE id = ?").run(intParam(ctx.params.id));
  if (!r.changes) throw new HttpError(404, "Soal tidak ditemukan.");
  return { ok: true };
}

function adminResetLeaderboard(ctx) {
  needAdmin(ctx);
  if (ctx.body.confirm !== "RESET") throw new HttpError(400, 'Kirim confirm: "RESET" untuk mengonfirmasi.');
  const r = db.prepare("DELETE FROM attempts").run();
  return { deleted: Number(r.changes) };
}

/* ---------- Tabel rute ---------- */
const routes = [
  ["POST",   "/api/register",              register],
  ["POST",   "/api/login",                 login],
  ["POST",   "/api/logout",                logout],
  ["POST",   "/api/verify",                verifyEmail],
  ["POST",   "/api/resend-verification",   resendVerification],
  ["POST",   "/api/forgot",                forgotPassword],
  ["POST",   "/api/reset",                 resetPassword],
  ["GET",    "/api/me",                    me],
  ["POST",   "/api/quiz/start",            quizStart],
  ["POST",   "/api/quiz/answer",           quizAnswer],
  ["POST",   "/api/quiz/finish",           quizFinish],
  ["GET",    "/api/leaderboard",           leaderboard],
  ["GET",    "/api/quiz/history",          history],
  ["GET",    "/api/admin/stats",           adminStats],
  ["GET",    "/api/admin/users",           adminUsers],
  ["PATCH",  "/api/admin/users/:id",       adminSetRole],
  ["DELETE", "/api/admin/users/:id",       adminDeleteUser],
  ["GET",    "/api/admin/questions",       adminQuestions],
  ["POST",   "/api/admin/questions",       adminAddQuestion],
  ["PUT",    "/api/admin/questions/:id",   adminUpdateQuestion],
  ["DELETE", "/api/admin/questions/:id",   adminDeleteQuestion],
  ["POST",   "/api/admin/leaderboard/reset", adminResetLeaderboard],
].map(([method, pattern, handler]) => ({
  method, handler,
  re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"),
}));

module.exports = { routes, HttpError };
