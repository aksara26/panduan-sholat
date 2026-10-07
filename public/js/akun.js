/* akun.js — halaman tujuan tautan di email: ?verify=TOKEN atau ?reset=TOKEN.
   Token dikirim lewat POST (bukan GET) supaya pemindai tautan email tidak
   menghabiskannya, lalu dihapus dari alamat halaman. */
(function(){
"use strict";
var root = document.getElementById("akunRoot");
var title = document.getElementById("akunH");
var params = new URLSearchParams(location.search);
var verify = params.get("verify"), reset = params.get("reset");
history.replaceState(null, "", location.pathname);   // buang token dari URL

function el(tag, cls, text){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function card(){ root.textContent = ""; var c = el("div","quiz-card"); root.appendChild(c); return c; }
function homeLink(text){ var a = el("a","btn primary", text || "Ke halaman utama"); a.href = "/"; return a; }

if (verify){
  title.textContent = "Verifikasi email";
  API.post("/api/verify", { token: verify }).then(function(){
    var c = card();
    c.appendChild(el("p","quiz-big","Email terverifikasi"));
    c.appendChild(el("p","quiz-desc","Terima kasih. Sekarang kamu bisa mengikuti kuis dan melihat peringkat."));
    c.appendChild(homeLink("Mulai kuis"));
  }).catch(function(e){
    var c = card();
    c.appendChild(el("p","quiz-error", e.message));
    c.appendChild(el("p","quiz-desc","Masuk lalu pilih “Kirim ulang email” di bagian kuis untuk mendapat tautan baru."));
    c.appendChild(homeLink());
  });
} else if (reset){
  title.textContent = "Atur ulang password";
  var c = card();
  var f = el("form","auth-form"); f.noValidate = true;
  var l = el("label","auth-field"); l.appendChild(el("span",null,"Password baru (minimal 8 karakter)"));
  var inp = el("input"); inp.type = "password"; inp.autocomplete = "new-password"; inp.required = true; l.appendChild(inp);
  var l2 = el("label","auth-field"); l2.appendChild(el("span",null,"Ulangi password baru"));
  var inp2 = el("input"); inp2.type = "password"; inp2.autocomplete = "new-password"; inp2.required = true; l2.appendChild(inp2);
  var err = el("p","auth-error"); err.hidden = true; err.setAttribute("role","alert");
  var sub = el("button","btn primary","Simpan password"); sub.type = "submit";
  f.appendChild(l); f.appendChild(l2); f.appendChild(err); f.appendChild(sub);
  c.appendChild(f);
  f.addEventListener("submit", function(e){
    e.preventDefault(); err.hidden = true;
    if (inp.value !== inp2.value){ err.textContent = "Kedua password tidak sama."; err.hidden = false; return; }
    sub.disabled = true;
    API.post("/api/reset", { token: reset, password: inp.value }).then(function(r){
      var d = card();
      d.appendChild(el("p","quiz-big","Password diubah"));
      d.appendChild(el("p","quiz-desc", r.message));
      d.appendChild(homeLink("Masuk sekarang"));
    }).catch(function(e2){
      err.textContent = e2.message; err.hidden = false; sub.disabled = false;
    });
  });
} else {
  var c2 = card();
  c2.appendChild(el("p","quiz-desc","Tautan tidak lengkap. Buka tautan langsung dari email yang kami kirim."));
  c2.appendChild(homeLink());
}
})();
