# Panduan Sholat

Aplikasi web pembelajaran panduan sholat yang dilengkapi kuis interaktif, autentikasi pengguna, dan papan peringkat. Proyek ini menggunakan arsitektur serverless dengan Cloudflare Workers dan Cloudflare D1.

**Demo:** [panduan-sholat](https://panduan-sholat.panduan-sholat-aksara26.workers.dev/)  
**Repository:** [aksara26/panduan-sholat](https://github.com/aksara26/panduan-sholat)

## Fitur

- **Panduan Sholat** — halaman pembelajaran panduan sholat.
- **Kuis Interaktif** — latihan soal untuk membantu pengguna menguji pemahaman.
- **Autentikasi Pengguna** — dukungan login Google dan alur login yang tersedia pada aplikasi.
- **Papan Peringkat** — menampilkan hasil kuis pengguna.
- **Panel Admin** — antarmuka pengelolaan aplikasi.
- **Tampilan Responsif** — dapat diakses melalui browser pada berbagai ukuran layar.

## Teknologi

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Cloudflare Workers
- **Database:** Cloudflare D1
- **Static Assets:** Cloudflare Workers Assets
- **Autentikasi Google:** Google Identity Services
- **Development & Deployment:** Wrangler

## Struktur Proyek

```text
panduan-sholat/
├── migrations/        # Migrasi skema database D1
├── public/            # Halaman web, stylesheet, JavaScript, dan aset
├── worker.js          # Backend Cloudflare Workers
├── wrangler.jsonc     # Konfigurasi Cloudflare Workers
├── package.json       # Metadata dan perintah proyek
└── package-lock.json  # Versi dependensi yang terkunci
```

## Menjalankan Secara Lokal

### Persyaratan

- Node.js dan npm
- Akun Cloudflare untuk kebutuhan pengembangan atau deployment
- Konfigurasi database D1 dan autentikasi sesuai lingkungan yang digunakan

### Instalasi

1. Clone repository:

   ```bash
   git clone https://github.com/aksara26/panduan-sholat.git
   cd panduan-sholat
   ```

2. Instal dependensi:

   ```bash
   npm ci
   ```

3. Jalankan server pengembangan:

   ```bash
   npx wrangler dev
   ```

4. Buka alamat lokal yang ditampilkan Wrangler di terminal.

> Pastikan binding database, migrasi D1, dan konfigurasi autentikasi telah disiapkan. Lihat `wrangler.jsonc` untuk mengetahui konfigurasi yang digunakan proyek.

## Database

Proyek menggunakan Cloudflare D1 sebagai database SQL. Berkas migrasi skema tersedia di direktori `migrations/`.

Untuk melihat perintah dan opsi migrasi yang tersedia:

```bash
npx wrangler d1 migrations --help
```

Periksa nama database dan konfigurasi binding di `wrangler.jsonc` sebelum menjalankan migrasi. Gunakan database lokal ketika menguji perubahan, dan tinjau migrasi sebelum menerapkannya ke database produksi.

## Deployment

Proyek di-deploy melalui Cloudflare Workers.

Setelah konfigurasi akun, binding database, dan variabel lingkungan telah disiapkan, deployment dapat dilakukan dengan:

```bash
npx wrangler deploy
```

Periksa konfigurasi di `wrangler.jsonc` sebelum melakukan deployment. Jangan memasukkan password, token akses, atau kredensial privat ke repository.

## Kontributor

- **Arya Wira Pratama**
- **Ghofran Achmad Arafi**
- **Muhammad Sayyid Ihsan Elsen**

## Tujuan Proyek

Panduan Sholat dikembangkan sebagai aplikasi pembelajaran sekaligus sarana praktik pengembangan frontend, backend serverless, autentikasi pengguna, pengelolaan database, dan deployment aplikasi web.

## Catatan

Konten keagamaan sebaiknya ditinjau oleh guru atau ustadz yang kompeten sebelum dijadikan rujukan final dalam praktik ibadah.
