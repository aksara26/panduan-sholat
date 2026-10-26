// js/auth.js - Pengatur Akses dengan Dukungan Guest / Tamu
(function() {
  let currentUser = null;

  try {
    // 1. Cek apakah pengguna sudah login sebelumnya
    const savedUser = localStorage.getItem('kitamenuju_user');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
    }
  } catch (e) {
    console.error("Gagal membaca sesi pengguna:", e);
  }

  // 2. Jika belum login (kosong), berikan status akses minimal sebagai Guest / Tamu
  if (!currentUser) {
    currentUser = {
      name: 'Tamu',
      role: 'guest',
      isGuest: true
    };
    try {
      localStorage.setItem('kitamenuju_user', JSON.stringify(currentUser));
    } catch (e) {}
  }

  // 3. Simpan di objek global agar bisa diakses oleh dashboard.html & materi.html
  window.currentUser = currentUser;
})();