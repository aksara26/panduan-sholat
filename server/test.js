"use strict";
/* Tes end-to-end: menjalankan server dengan database sementara, lalu
   memeriksa alur daftar, login, kuis, peringkat, dan hak akses admin.
   Jalankan: npm test */
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sholat-test-"));
process.env.DB_PATH = path.join(tmp, "test.db");
process.env.JWT_SECRET = "x".repeat(48);
process.env.MAIL_TRANSPORT = "memory";
process.env.APP_URL = "http://app.test";
process.env.ADMIN_EMAIL = "admin@test.id";
process.env.ADMIN_PASSWORD = "adminpass123";

require("./seed");                 // soal + admin
const server = require("./index");
const mailer = require("./mailer");
const net = require("node:net");
const dbx = require("./db");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokenOf = (to, key) => {
  const m = [...mailer.outbox].reverse().find((x) => x.to === to && x.text.includes(key + "="));
  return m ? m.text.match(new RegExp(key + "=([\\w-]+)"))[1] : null;
};

function client(base) {
  let cookie = "";
  return async function call(method, url, body, extra = {}) {
    const headers = { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extra };
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0].replace(/^session=$/, "");
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data, headers: r.headers };
  };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const guest = client(base), alice = client(base), bob = client(base), admin = client(base);
  let n = 0; const ok = (name) => console.log(`  ok ${++n}  ${name}`);

  // Akses tanpa login
  assert.equal((await guest("GET", "/api/leaderboard")).status, 401); ok("peringkat butuh login");
  assert.equal((await guest("POST", "/api/quiz/start", {})).status, 401); ok("kuis butuh login");
  assert.equal((await guest("GET", "/api/admin/stats")).status, 401); ok("admin butuh login");
  assert.equal((await guest("GET", "/api/me")).data.user, null); ok("/api/me tamu = null");

  // Daftar & validasi
  assert.equal((await alice("POST", "/api/register", { nama: "Alice", email: "bad", password: "password1" })).status, 400);
  assert.equal((await alice("POST", "/api/register", { nama: "Alice", email: "a@x.id", password: "short" })).status, 400);
  const reg = await alice("POST", "/api/register", { nama: "Alice", email: "Alice@X.id", password: "password1", role: "admin" });
  assert.equal(reg.status, 200); assert.equal(reg.data.user.role, "user"); ok("daftar, role selalu user");
  assert.equal((await alice("POST", "/api/register", { nama: "A2", email: "alice@x.id", password: "password1" })).status, 409); ok("email kembar ditolak");
  assert.equal((await alice("GET", "/api/me")).data.user.email, "alice@x.id"); ok("sesi cookie bekerja");
  assert.ok(/HttpOnly/i.test(reg.headers.get("set-cookie"))); ok("cookie HttpOnly");

  // Login salah / benar
  assert.equal((await bob("POST", "/api/login", { email: "alice@x.id", password: "salahsalah" })).status, 401);
  assert.equal((await bob("POST", "/api/login", { email: "tidak@ada.id", password: "salahsalah" })).status, 401); ok("login salah ditolak");
  await bob("POST", "/api/register", { nama: "Bob", email: "bob@x.id", password: "password2" });

  // Verifikasi email
  assert.equal(reg.data.user.emailVerified, false);
  const qBlocked = await alice("POST", "/api/quiz/start", {});
  assert.equal(qBlocked.status, 403); assert.equal(qBlocked.data.code, "EMAIL_NOT_VERIFIED");
  assert.equal((await alice("GET", "/api/leaderboard")).status, 403); ok("belum verifikasi: kuis dan peringkat ditolak");
  const vTok = tokenOf("alice@x.id", "verify");
  assert.ok(vTok && mailer.outbox.find((m) => m.to === "alice@x.id").text.includes("http://app.test/akun.html?verify=")); ok("email verifikasi terkirim saat daftar");
  assert.ok(!JSON.stringify(dbx.prepare("SELECT token_hash FROM email_tokens").all()).includes(vTok)); ok("token di database hanya berupa hash");
  assert.equal((await guest("POST", "/api/verify", { token: "salah-salah-salah-salah-salah" })).data.code, "TOKEN_INVALID");
  assert.equal((await guest("POST", "/api/verify", { token: vTok })).status, 200);
  assert.equal((await guest("POST", "/api/verify", { token: vTok })).status, 400); ok("verifikasi sekali pakai");
  assert.equal((await alice("GET", "/api/me")).data.user.emailVerified, true);
  assert.equal((await bob("POST", "/api/resend-verification", {})).status, 429); ok("kirim ulang dibatasi cooldown");
  assert.equal((await guest("POST", "/api/resend-verification", {})).status, 401);
  assert.equal((await guest("POST", "/api/verify", { token: tokenOf("bob@x.id", "verify") })).status, 200);

  // CSRF: bukan JSON ditolak
  const csrf = await fetch(base + "/api/logout", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" });
  assert.equal(csrf.status, 415); ok("POST non-JSON ditolak (CSRF)");

  // Kuis: Alice jawab semua benar, Bob jawab salah semua
  async function play(c, allCorrect) {
    const s = await c("POST", "/api/quiz/start", {});
    assert.equal(s.status, 200); assert.equal(s.data.questions.length, 10);
    assert.ok(!JSON.stringify(s.data).includes("correct"), "kunci jawaban bocor ke klien");
    // Server menyimpan kunci; ambil lewat DB untuk tes
    const db = require("./db");
    for (const q of s.data.questions) {
      const row = db.prepare("SELECT correct FROM questions WHERE id=?").get(q.id);
      const ans = allCorrect ? row.correct : q.options.find((o) => o !== row.correct);
      const a = await c("POST", "/api/quiz/answer", { attemptId: s.data.attemptId, questionId: q.id, answer: ans });
      assert.equal(a.status, 200); assert.equal(a.data.correct, allCorrect);
      if (q === s.data.questions[0]) {
        assert.equal((await c("POST", "/api/quiz/answer", { attemptId: s.data.attemptId, questionId: q.id, answer: ans })).status, 409);
      }
    }
    return s.data.attemptId;
  }
  const early = await alice("POST", "/api/quiz/start", {});
  assert.equal((await alice("POST", "/api/quiz/finish", { attemptId: early.data.attemptId })).status, 400); ok("tidak bisa selesai sebelum semua dijawab");
  assert.equal((await alice("POST", "/api/quiz/start", {})).status, 409); ok("satu akun tidak bisa menumpuk attempt aktif");
  // Selesaikan attempt yang sudah dibuat tadi.
  const aId = early.data.attemptId;
  const dbForAlice = require("./db");
  for (const q of early.data.questions) {
    const row = dbForAlice.prepare("SELECT correct FROM questions WHERE id=?").get(q.id);
    const a = await alice("POST", "/api/quiz/answer", { attemptId: aId, questionId: q.id, answer: row.correct });
    assert.equal(a.status, 200);
  }
  const fin = await alice("POST", "/api/quiz/finish", { attemptId: aId });
  assert.equal(fin.data.score, 10); assert.equal(fin.data.rank, 1); ok("skor 10/10 dihitung server, rank 1");
  assert.equal((await alice("POST", "/api/quiz/finish", { attemptId: aId })).status, 409); ok("kuis selesai tidak bisa dikirim ulang");

  const bId = await play(bob, false);
  assert.equal((await alice("POST", "/api/quiz/answer", { attemptId: bId, questionId: 1, answer: "x" })).status, 404); ok("kuis milik orang lain tidak bisa diakses");
  const bfin = await bob("POST", "/api/quiz/finish", { attemptId: bId });
  assert.equal(bfin.data.score, 0); assert.equal(bfin.data.rank, 2); ok("skor 0, rank 2");

  const lb = await bob("GET", "/api/leaderboard");
  assert.equal(lb.data.top[0].nama, "Alice"); assert.equal(lb.data.top[1].me, true);
  assert.ok(!JSON.stringify(lb.data).includes("@")); ok("peringkat benar, email tidak bocor");

  // Hak akses admin
  assert.equal((await alice("GET", "/api/admin/stats")).status, 403);
  assert.equal((await alice("POST", "/api/admin/leaderboard/reset", { confirm: "RESET" })).status, 403); ok("user biasa ditolak di admin");
  assert.equal((await admin("POST", "/api/login", { email: "admin@test.id", password: "adminpass123" })).data.user.role, "admin");
  const st = await admin("GET", "/api/admin/stats");
  assert.equal(st.data.users, 3); assert.equal(st.data.finishedAttempts, 2); ok("statistik admin");

  const add = await admin("POST", "/api/admin/questions", { prompt: "Soal uji manual?", options: ["Ya", "Tidak"], correct: "Ya", explain: "Uji." });
  assert.equal(add.status, 200);
  assert.equal((await admin("POST", "/api/admin/questions", { prompt: "Soal uji manual?", options: ["Ya", "Tidak"], correct: "Ya" })).status, 409);
  assert.equal((await admin("POST", "/api/admin/questions", { prompt: "Soal salah kunci?", options: ["Ya", "Tidak"], correct: "Mungkin" })).status, 400);
  assert.equal((await admin("PUT", `/api/admin/questions/${add.data.id}`, { prompt: "Soal uji manual (edit)?", options: ["Ya", "Tidak"], correct: "Tidak", active: false })).status, 200);
  assert.equal((await admin("DELETE", `/api/admin/questions/${add.data.id}`, {})).status, 200); ok("CRUD soal + validasi");

  const users = (await admin("GET", "/api/admin/users")).data.users;
  const me = users.find((u) => u.email === "admin@test.id");
  assert.equal((await admin("DELETE", `/api/admin/users/${me.id}`, {})).status, 400);
  assert.equal((await admin("PATCH", `/api/admin/users/${me.id}`, { role: "user" })).status, 400); ok("admin tak bisa hapus/turunkan diri sendiri");
  const bobRow = users.find((u) => u.email === "bob@x.id");
  assert.equal((await admin("PATCH", `/api/admin/users/${bobRow.id}`, { role: "admin" })).status, 200);
  assert.equal((await bob("GET", "/api/admin/stats")).status, 200); ok("role berlaku seketika");
  assert.equal((await admin("DELETE", `/api/admin/users/${bobRow.id}`, {})).status, 200);
  assert.equal((await bob("GET", "/api/me")).data.user, null); ok("user terhapus = sesi tidak berlaku");

  assert.equal((await admin("POST", "/api/admin/leaderboard/reset", { confirm: "x" })).status, 400);
  assert.equal((await admin("POST", "/api/admin/leaderboard/reset", { confirm: "RESET" })).data.deleted, 1);
  assert.equal((await alice("GET", "/api/leaderboard")).data.top.length, 0); ok("reset peringkat");

  // Lupa password & reset
  const carol = client(base), carol2 = client(base);
  await carol("POST", "/api/register", { nama: "Carol", email: "carol@x.id", password: "oldpassword1" });
  await guest("POST", "/api/verify", { token: tokenOf("carol@x.id", "verify") });
  const before = mailer.outbox.length;
  const f1 = await guest("POST", "/api/forgot", { email: "tidak-ada@x.id" });
  assert.equal(f1.status, 200); assert.equal(mailer.outbox.length, before); ok("forgot email tak dikenal: respons sama, tidak ada email");
  const f2 = await guest("POST", "/api/forgot", { email: "CAROL@x.id" });
  assert.equal(f2.status, 200); assert.deepEqual(f2.data, f1.data); assert.equal(mailer.outbox.length, before + 1);
  assert.ok(mailer.outbox.at(-1).text.includes("http://app.test/akun.html?reset=")); ok("forgot email dikenal: respons identik, email terkirim");
  await guest("POST", "/api/forgot", { email: "carol@x.id" });
  assert.equal(mailer.outbox.length, before + 1); ok("forgot beruntun dibatasi cooldown");
  const rTok = tokenOf("carol@x.id", "reset");
  assert.equal((await guest("POST", "/api/reset", { token: rTok, password: "pendek" })).status, 400);
  await sleep(1100); // sesi lama harus lebih tua dari waktu ganti password
  assert.equal((await guest("POST", "/api/reset", { token: "x".repeat(43), password: "passwordbaru1" })).status, 400);
  assert.equal((await guest("POST", "/api/reset", { token: rTok, password: "passwordbaru1" })).status, 200); ok("reset: password lemah tidak menghabiskan token, token valid berhasil");
  assert.equal((await guest("POST", "/api/reset", { token: rTok, password: "passwordlain1" })).status, 400); ok("token reset sekali pakai");
  assert.equal((await carol("GET", "/api/me")).data.user, null); ok("sesi lama dicabut setelah reset");
  assert.equal((await carol2("POST", "/api/login", { email: "carol@x.id", password: "oldpassword1" })).status, 401);
  assert.equal((await carol2("POST", "/api/login", { email: "carol@x.id", password: "passwordbaru1" })).status, 200);
  assert.equal((await carol2("GET", "/api/me")).data.user.emailVerified, true); ok("login dengan password baru");
  await sleep(1100);
  await guest("POST", "/api/forgot", { email: "alice@x.id" });
  const exp = tokenOf("alice@x.id", "reset");
  dbx.prepare("UPDATE email_tokens SET expires_at = ? WHERE type='reset'").run(Date.now() - 1000);
  assert.equal((await guest("POST", "/api/reset", { token: exp, password: "passwordbaru1" })).status, 400); ok("token reset kedaluwarsa ditolak");

  // Admin verifikasi manual
  const dave = client(base);
  await dave("POST", "/api/register", { nama: "Dave", email: "dave@x.id", password: "password3" });
  assert.equal((await dave("POST", "/api/quiz/start", {})).status, 403);
  const daveRow = (await admin("GET", "/api/admin/users")).data.users.find((u) => u.email === "dave@x.id");
  assert.equal(daveRow.emailVerified, 0);
  assert.equal((await admin("PATCH", `/api/admin/users/${daveRow.id}`, { verified: true })).status, 200);
  assert.equal((await dave("POST", "/api/quiz/start", {})).status, 200); ok("admin bisa verifikasi manual");

  // Klien SMTP terhadap server SMTP palsu
  const got = { cmds: [], data: "" };
  const fake = net.createServer((sock) => {
    sock.write("220 fake\r\n");
    let buf = "", inData = false, auth = 0;
    sock.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === ".") { inData = false; sock.write("250 queued\r\n"); } else got.data += line + "\n"; continue; }
        got.cmds.push(line);
        if (auth === 1) { auth = 2; sock.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (auth === 2) { auth = 0; sock.write("235 ok\r\n"); }
        else if (/^EHLO/.test(line)) sock.write("250-fake\r\n250 AUTH LOGIN\r\n");
        else if (line === "AUTH LOGIN") { auth = 1; sock.write("334 VXNlcm5hbWU6\r\n"); }
        else if (line === "DATA") { inData = true; sock.write("354 go\r\n"); }
        else if (line === "QUIT") sock.end("221 bye\r\n");
        else sock.write("250 ok\r\n");
      }
    });
  });
  await new Promise((r) => fake.listen(0, "0.0.0.0", r));
  const fport = fake.address().port;
  await mailer.smtpSend({ host: "127.0.0.1", port: fport, secure: false, user: "u", pass: "p", starttls: false },
    { from: "Panduan <noreply@x.id>", to: "penerima@x.id", subject: "Verifikasi \u2014 Uji", text: "Halo\nhttp://app.test/akun.html?verify=abc\n.titik di awal baris" });
  assert.ok(got.cmds.includes("MAIL FROM:<noreply@x.id>") && got.cmds.includes("RCPT TO:<penerima@x.id>"));
  const bodyB64 = got.data.split("\n\n").slice(1).join("").replace(/\n/g, "");
  assert.ok(Buffer.from(bodyB64, "base64").toString().includes("verify=abc") && Buffer.from(bodyB64, "base64").toString().includes(".titik"));
  assert.ok(got.data.includes("Subject: =?UTF-8?B?")); ok("klien SMTP: AUTH, envelope, isi UTF-8 benar");
  await assert.rejects(
    mailer.smtpSend({ host: "127.0.0.2", port: fport, secure: false, user: "u", pass: "p", starttls: false }, { from: "a@x.id", to: "b@x.id", subject: "s", text: "t" }),
    /tanpa enkripsi/); ok("klien SMTP menolak kirim password tanpa enkripsi ke host non-lokal");
  fake.close();

  // Batas login gagal per IP, bukan per email: penyerang tidak dapat mengunci akun korban
  // hanya dengan mengetahui alamat emailnya.
  const eve = client(base);
  await eve("POST", "/api/register", { nama: "Eve", email: "eve@x.id", password: "password4" });
  for (let i = 0; i < 8; i++) assert.equal((await guest("POST", "/api/login", { email: "eve@x.id", password: "salah-salah" })).status, 401);
  assert.equal((await guest("POST", "/api/login", { email: "eve@x.id", password: "password4" })).status, 429); ok("rate limit login gagal berbasis IP");
  assert.equal((await guest("POST", "/api/login", { email: "carol@x.id", password: "passwordbaru1" })).status, 429); ok("IP yang diblokir membatasi percobaan login berikutnya");

  // Statis & traversal
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/admin")).status, 200);
  assert.equal((await fetch(base + "/..%2Fserver%2Fdb.js")).status, 403);
  assert.equal((await fetch(base + "/data/app.db")).status, 404);
  assert.equal((await fetch(base + "/")).headers.get("content-security-policy").includes("default-src 'self'"), true); ok("statis, anti path traversal, CSP");

  console.log(`\nSemua ${n} kelompok tes lolos.`);
  server.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})().catch((e) => { console.error("\nGAGAL:", e); process.exit(1); });
