ini isinya Panduan Sholat

Aplikasi web pembelajaran panduan sholat dengan kuis interaktif dan papan peringkat.

**Demo:** [https://panduan-sholat.panduan-sholat-aksara26.workers.dev/](https://panduan-sholat.panduan-sholat-aksara26.workers.dev/) **Repository:** [https://github.com/aksara26/panduan-sholat](https://github.com/aksara26/panduan-sholat)

## Fitur

- Panduan sholat.
- Kuis interaktif.
- Login pengguna dan dukungan Google.
- Papan peringkat.
- Panel admin.
- Tampilan responsif.

## Teknologi

- HTML, CSS, JavaScript
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Workers Assets
- Google Identity Services
- Wrangler

## Menjalankan secara lokal

Pastikan Node.js dan npm sudah terpasang.
```
npm ci
npx wrangler dev

```

Ikuti alamat lokal yang ditampilkan Wrangler. Konfigurasi database D1 dan autentikasi perlu disiapkan terlebih dahulu.

## Deployment

Setelah konfigurasi Cloudflare siap:
```
npx wrangler deploy

```

Lihat `wrangler.jsonc` untuk konfigurasi Worker.

## Struktur Proyek

- `worker.js` — backend.
- `public/` — frontend dan aset.
- `migrations/` — migrasi database.
- `wrangler.jsonc` — konfigurasi Cloudflare.

## Kontributor

- Arya Wira Pratama
- Ghofran Achmad Arafi
- Muhammad Sayyid Ihsan Elsen

## Catatan

Materi keagamaan perlu diverifikasi oleh guru atau ustadz yang kompeten sebelum dijadikan rujukan final.
