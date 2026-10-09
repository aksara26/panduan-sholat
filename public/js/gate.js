/* gate.js — hanya user yang sudah login yang boleh melihat halaman utama. */
(function(){
  var d = document.documentElement;
  var s = document.currentScript;
  var next = (s && s.getAttribute("data-next")) || "/";

  d.setAttribute("data-gate", "1");
  d.classList.add("gate-pending");

  function goLogin(){
    var url = "/login.html";
    if (next !== "/") {
      url += "?next=" + encodeURIComponent(next);
    }
    location.replace(url);
  }

  fetch("/api/me", {
    credentials: "same-origin",
    cache: "no-store"
  })
    .then(function(r){
      if (!r.ok) throw new Error("Gagal mengecek sesi.");
      return r.json();
    })
    .then(function(r){
      if (r && r.user) {
        d.classList.remove("gate-pending");
        return;
      }

      goLogin();
    })
    .catch(function(){
      goLogin();
    });
})();
