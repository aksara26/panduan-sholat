/*
 * Kunjungan pertama menampilkan halaman login.
 * Pengunjung tetap dapat memilih "Lanjut sebagai tamu".
 * Endpoint kuis dan fitur admin tetap dilindungi backend.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var script = document.currentScript;

  // Pertahankan perilaku gate pada halaman yang memiliki data-next,
  // termasuk halaman admin.
  if (script && script.hasAttribute("data-next")) {
    root.classList.remove("gate-pending");
    return;
  }

  var path = location.pathname;
  var isHome = path === "/" || path === "/index.html";

  if (isHome) {
    try {
      if (localStorage.getItem("panduan-sholat-entry-shown") !== "1") {
        localStorage.setItem("panduan-sholat-entry-shown", "1");
        location.replace("/login.html?next=%2F");
        return;
      }
    } catch (e) {
      // Jika penyimpanan browser tidak tersedia, jangan blokir materi.
    }
  }

  root.classList.remove("gate-pending");
})();
