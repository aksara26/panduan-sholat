"use strict";
/* Menyiapkan proyek: membuat .env (JWT_SECRET acak), mengisi bank soal,
   dan membuat akun admin pertama.
   Pakai:  npm run seed
           ADMIN_EMAIL=a@b.com ADMIN_PASSWORD=rahasia123 npm run seed
   Aman dijalankan berulang kali. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const envPath = path.join(__dirname, "..", ".env");
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1];

if (!get("JWT_SECRET")) {
  env += `${env && !env.endsWith("\n") ? "\n" : ""}JWT_SECRET=${crypto.randomBytes(48).toString("hex")}\n`;
  fs.writeFileSync(envPath, env, { mode: 0o600 });
  console.log("• .env dibuat dengan JWT_SECRET acak.");
}
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const db = require("./db");
const sec = require("./security");
const { allQuestions } = require("./questions");

// 1) Bank soal (soal yang sudah ada tidak ditimpa, jadi editan admin aman)
const ins = db.prepare("INSERT OR IGNORE INTO questions (prompt, options, correct, explain, kind) VALUES (?,?,?,?,?)");
let added = 0;
for (const q of allQuestions()) {
  added += Number(ins.run(q.prompt, JSON.stringify(q.options), q.correct, q.explain, q.kind).changes);
}
const total = db.prepare("SELECT COUNT(*) AS n FROM questions").get().n;
console.log(`• Bank soal: ${added} soal baru, total ${total}.`);

// 2) Admin pertama
const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
if (!email || !password || /example\.com$|ganti/i.test(email + password)) {
  console.log("• Admin: dilewati. Isi ADMIN_EMAIL dan ADMIN_PASSWORD (lihat README), lalu jalankan lagi.");
} else if (password.length < 8) {
  console.error("ADMIN_PASSWORD minimal 8 karakter."); process.exit(1);
} else {
  const row = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (row) {
    db.prepare("UPDATE users SET role='admin', email_verified=1 WHERE id = ?").run(row.id);
    console.log(`• Admin: akun ${email} sudah ada, dijadikan admin.`);
  } else {
    db.prepare("INSERT INTO users (nama, email, password_hash, role, email_verified) VALUES (?,?,?, 'admin', 1)")
      .run(process.env.ADMIN_NAME || "Admin", email, sec.hashPassword(password));
    console.log(`• Admin: akun ${email} dibuat.`);
  }
}
