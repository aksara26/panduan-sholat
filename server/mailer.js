"use strict";
/* Pengirim email lewat SMTP, ditulis dengan modul bawaan Node (net/tls).
   Konfigurasi (.env):
     SMTP_HOST, SMTP_PORT (465 = TLS langsung, 587 = STARTTLS), SMTP_USER,
     SMTP_PASS, SMTP_FROM ("Panduan Sholat <noreply@domain.id>")
   Tanpa SMTP_HOST (mode pengembangan) email hanya dicetak ke konsol.
   MAIL_TRANSPORT=memory dipakai oleh tes: email disimpan di mailer.outbox. */
const net = require("node:net");
const tls = require("node:tls");
const os = require("node:os");
const crypto = require("node:crypto");

const outbox = [];

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const wrap76 = (s) => s.replace(/(.{76})/g, "$1\r\n");
const isLoopback = (h) => ["localhost", "127.0.0.1", "::1"].includes(h);

function addrOnly(from) {
  const m = String(from).match(/<([^<>\s]+)>/);
  return m ? m[1] : String(from).trim();
}

function buildMessage({ from, to, subject, text }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${addrOnly(from).split("@")[1] || "localhost"}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];
  return headers.join("\r\n") + "\r\n\r\n" + wrap76(b64(text)) + "\r\n";
}

/* Klien SMTP minimal: EHLO, STARTTLS (jika ditawarkan), AUTH LOGIN, MAIL/RCPT/DATA. */
function smtpSend(cfg, msg) {
  return new Promise((resolve, reject) => {
    let sock, buf = "", waiter = null, done = false, encrypted = false;
    const timer = setTimeout(() => fail(new Error("SMTP timeout")), 20_000);

    function fail(err) {
      if (done) return; done = true; clearTimeout(timer);
      try { sock && sock.destroy(); } catch {}
      reject(err);
    }
    function succeed() {
      if (done) return; done = true; clearTimeout(timer);
      try { sock.end(); } catch {}
      resolve();
    }

    function onData(chunk) {
      buf += chunk.toString("utf8");
      pump();
    }
    function pump() {
      // balasan lengkap = baris "NNN " (tanpa tanda minus) di akhir
      const lines = buf.split("\r\n");
      if (lines.length < 2) return;
      const complete = lines.slice(0, -1);
      const last = complete[complete.length - 1];
      if (!/^\d{3} /.test(last) && !/^\d{3}$/.test(last)) return;
      buf = lines[lines.length - 1];
      if (waiter) { const w = waiter; waiter = null; w({ code: Number(last.slice(0, 3)), lines: complete }); }
    }
    function attach(s) {
      sock = s;
      sock.on("data", onData);
      sock.on("error", fail);
      sock.on("close", () => fail(new Error("Koneksi SMTP terputus")));
    }
    const reply = () => new Promise((r) => { waiter = r; pump(); });
    async function cmd(line, ok) {
      sock.write(line + "\r\n");
      const r = await reply();
      if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.lines.join(" ").slice(0, 200)}`);
      return r;
    }

    (async () => {
      const connectEvt = cfg.secure ? "secureConnect" : "connect";
      const s = cfg.secure
        ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
        : net.connect({ host: cfg.host, port: cfg.port });
      await new Promise((res, rej) => { s.once(connectEvt, res); s.once("error", rej); });
      encrypted = !!cfg.secure;
      attach(s);

      let r = await reply();
      if (r.code !== 220) throw new Error(`SMTP ${r.code}`);
      const me = os.hostname().replace(/[^\w.-]/g, "") || "localhost";
      r = await cmd(`EHLO ${me}`, [250]);

      if (!encrypted && r.lines.some((l) => /STARTTLS/i.test(l)) && cfg.starttls !== false) {
        await cmd("STARTTLS", [220]);
        sock.removeAllListeners("data"); sock.removeAllListeners("close"); sock.removeAllListeners("error");
        const up = tls.connect({ socket: sock, servername: cfg.host });
        await new Promise((res, rej) => { up.once("secureConnect", res); up.once("error", rej); });
        buf = ""; attach(up); encrypted = true;
        await cmd(`EHLO ${me}`, [250]);
      }

      if (cfg.user) {
        if (!encrypted && !isLoopback(cfg.host)) throw new Error("Menolak mengirim kata sandi SMTP tanpa enkripsi (pakai port 465 atau 587).");
        await cmd("AUTH LOGIN", [334]);
        await cmd(b64(cfg.user), [334]);
        await cmd(b64(cfg.pass || ""), [235]);
      }

      await cmd(`MAIL FROM:<${addrOnly(msg.from)}>`, [250]);
      await cmd(`RCPT TO:<${msg.to}>`, [250, 251]);
      await cmd("DATA", [354]);
      const data = buildMessage(msg).replace(/^\./gm, "..");
      await cmd(data + ".", [250]);
      try { sock.write("QUIT\r\n"); } catch {}
      succeed();
    })().catch(fail);
  });
}

async function sendMail({ to, subject, text }) {
  if (/[\r\n<>]/.test(to) || /[\r\n]/.test(subject)) throw new Error("Alamat atau subjek email tidak valid.");
  const from = process.env.SMTP_FROM || "Panduan Sholat <noreply@localhost>";

  if (process.env.MAIL_TRANSPORT === "memory") { outbox.push({ to, subject, text }); return; }

  if (!process.env.SMTP_HOST) {
    console.log(`\n[EMAIL — SMTP belum diatur, hanya dicetak di sini]\nKe: ${to}\nSubjek: ${subject}\n\n${text}\n`);
    return;
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  await smtpSend({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    user: process.env.SMTP_USER, pass: process.env.SMTP_PASS,
    starttls: process.env.SMTP_STARTTLS !== "0",
  }, { from, to, subject, text });
}

/* Kirim di latar belakang: kegagalan dicatat, tidak menggagalkan permintaan
   dan waktu respons tidak membocorkan apakah email terdaftar. */
function sendInBackground(mail) {
  sendMail(mail).catch((e) => console.error(`Gagal mengirim email ke ${mail.to}: ${e.message}`));
}

module.exports = { sendMail, sendInBackground, outbox, smtpSend };
