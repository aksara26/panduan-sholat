# Panduan Tata Cara Sholat

Web panduan sholat fardhu langkah demi langkah (gerakan, bacaan Arab, latin,
arti; mazhab Syafi'i), kini dengan **login email** (dengan **verifikasi email** dan **lupa password**),
**kuis yang dinilai server**, **peringkat lomba**, dan **panel admin**. Backend memakai Node.js + SQLite
**tanpa dependency** (`npm install` tidak diperlukan).

## Kebutuhan

- Node.js **22.13 atau lebih baru** (memakai modul bawaan `node:sqlite`; Node
  akan menampilkan peringatan "ExperimentalWarning", itu normal).

## Menjalankan

```bash
# 1) Persiapan sekali: membuat .env (JWT_SECRET acak), mengisi bank soal,
#    dan membuat akun admin pertama
ADMIN_EMAIL=emailkamu@gmail.com ADMIN_PASSWORD=passwordkuat123 npm run seed

# 2) Jalankan server
npm start          # http://localhost:3000
```

Di Windows PowerShell:

```powershell
$env:ADMIN_EMAIL="emailkamu@gmail.com"; $env:ADMIN_PASSWORD="passwordkuat123"; npm run seed
npm start
```

`npm run seed` aman diulang: soal yang sudah ada (termasuk yang kamu edit di
panel admin) tidak ditimpa. Tes otomatis: `npm test`.

> Situs tidak lagi bisa dibuka lewat `file://` atau `python -m http.server`,
> karena login dan kuis butuh server.

## Cara kerja

| Bagian | Keterangan |
|---|---|
| Panduan sholat | Publik, tanpa login |
| Daftar / Masuk | Email + password (minimal 8 karakter). Password di-hash scrypt, sesi memakai cookie `HttpOnly` + `SameSite=Strict` (7 hari) |
| Verifikasi email | Setelah daftar, tautan verifikasi (berlaku 24 jam) dikirim ke email. **Kuis dan peringkat baru terbuka setelah email terverifikasi.** Bisa kirim ulang (jeda 1 menit) |
| Lupa password | Dari dialog Masuk: tautan reset (berlaku 1 jam, sekali pakai) dikirim ke email. Respons selalu sama baik email terdaftar atau tidak. Setelah reset, semua sesi lama otomatis tidak berlaku |
| Kuis | Wajib login + email terverifikasi. 10 soal acak dari tabel `questions`; **jawaban dinilai di server**, kunci tidak pernah dikirim ke browser sebelum soal dijawab. Batas waktu 30 menit per percobaan |
| Peringkat | Hanya terlihat setelah login. Skor terbaik tiap peserta; seri dipecah oleh waktu tercepat |
| Admin (`/admin`) | Statistik, kelola user (jadikan admin/hapus, **verifikasi manual** bila email peserta bermasalah), CRUD soal kuis, reset peringkat untuk babak baru |

Pendaftaran selalu menghasilkan role `user`. Admin hanya dibuat lewat
`npm run seed` atau dipromosikan oleh admin lain.

## Struktur

```
server/
  index.js            HTTP server, file statis, header keamanan (CSP, dll.)
  api.js              Semua endpoint /api/*
  db.js               Skema SQLite (users, questions, attempts, attempt_answers)
  security.js         scrypt, JWT HS256, cookie, rate limiter
  questions.js        Membangkitkan bank soal dari public/js/sholat-data.js
  static-questions.json  11 soal fikih statis
  seed.js             .env + soal + admin pertama
  test.js             Tes end-to-end (npm test)
public/               Semua yang diakses browser
  index.html, admin.html, css/, js/
data/app.db           Database (dibuat otomatis, jangan di-commit)
```

Soal dinamis (urutan langkah, rukun/sunnah, jumlah rakaat) dibangkitkan dari
`sholat-data.js` **saat seed** lalu disimpan ke database. Jika kamu mengubah
`buildSteps()` atau teks bacaan, jalankan `npm run seed` lagi untuk menambah
soal baru (soal lama yang sudah tidak cocok bisa dinonaktifkan di panel admin).

## Mengirim email (SMTP)

Tanpa pengaturan SMTP, email **tidak benar-benar terkirim**: isinya (termasuk
tautan verifikasi/reset) hanya dicetak di konsol server. Ini cukup untuk
mencoba di komputer sendiri. Untuk lomba sungguhan, isi `.env`:

```
APP_URL=https://alamat-situsmu.id
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=emailpengirim@gmail.com
SMTP_PASS=sandi-aplikasi-16-karakter
SMTP_FROM=Panduan Sholat <emailpengirim@gmail.com>
```

- Port **465** memakai TLS langsung; port **587** memakai STARTTLS. Server menolak
  mengirim sandi SMTP tanpa enkripsi (kecuali ke localhost).
- Gmail: aktifkan verifikasi 2 langkah, lalu buat **Sandi Aplikasi**
  (jangan pakai sandi akun Gmail). Batas kirim Gmail sekitar 500 email/hari.
  Untuk peserta banyak, pertimbangkan layanan email transaksional (Brevo,
  Mailjet, dsb.) yang menyediakan SMTP; pengaturannya sama.
- `APP_URL` wajib benar, karena dipakai membentuk tautan di email.
- Email dari Gmail/layanan gratis bisa masuk **folder spam**; beri tahu peserta.
- Klien SMTP ini ditulis sendiri dengan modul bawaan Node dan diuji terhadap
  server SMTP tiruan, tapi **belum diuji ke Gmail/penyedia asli**. Coba kirim
  satu email nyata ke dirimu sendiri sebelum lomba dimulai.

## Konfigurasi (.env)

| Variabel | Fungsi |
|---|---|
| `JWT_SECRET` | Wajib, minimal 32 karakter. Dibuat otomatis oleh `npm run seed` |
| `PORT` | Default 3000 |
| `COOKIE_SECURE=1` | Set saat di belakang HTTPS (cookie `Secure` + HSTS) |
| `TRUST_PROXY=1` | Set di hosting yang memakai reverse proxy, agar rate limit membaca IP asli |
| `DB_PATH` | Lokasi file database (default `data/app.db`) |
| `APP_URL` | Alamat publik situs, untuk tautan di email |
| `SMTP_*` | Lihat bagian Mengirim email |

## Deploy

GitHub Pages **tidak bisa** (hanya statis). Pakai hosting Node.js (Render,
Railway, Fly.io, VPS). Karena SQLite adalah file, pasang *persistent disk /
volume* dan arahkan `DB_PATH` ke sana, kalau tidak data hilang saat redeploy.
Aktifkan `COOKIE_SECURE=1` dan `TRUST_PROXY=1`.

## Batasan yang perlu kamu ketahui

- Pembatas laju disimpan di memori. Login gagal dibatasi **per email** (8 kali
  per 15 menit), bukan per IP, supaya peserta di satu jaringan tidak saling
  terblokir.
- Database versi 1 yang sudah ada otomatis dimigrasi; akun lama dianggap
  sudah terverifikasi.
- Satu peserta boleh mengulang kuis; yang dihitung skor terbaiknya. Kalau
  lomba hanya boleh satu kali percobaan, itu perubahan kecil di `quizStart`.
- Peserta masih bisa berbagi akun atau membuka materi sambil menjawab; untuk
  lomba resmi pertimbangkan pengawasan di luar sistem ini.

## Status konten

**Draf.** Teks bacaan Arab, latin, dan urutan langkah di `sholat-data.js` belum
ditinjau guru ngaji atau ustadz. Minta seseorang yang paham tajwid
memeriksanya sebelum situs dipakai peserta lomba.
