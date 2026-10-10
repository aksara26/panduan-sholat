/* login.js — halaman masuk/daftar/lupa password sebelum panduan. */
(function(){
"use strict";

/* Tema: ikuti pilihan yang disimpan di halaman utama */
try {
  var th = localStorage.getItem("sholat.theme");
  if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th);
} catch (e) {}

/* Tujuan setelah masuk: hanya alamat yang diizinkan (mencegah open redirect) */
var ALLOWED = { "/": 1, "/admin": 1, "/#quizSection": 1 };
var next = new URLSearchParams(location.search).get("next");
if (!ALLOWED[next]) next = "/";

function $(sel, root){ return (root || document).querySelector(sel); }
var panels = {
  login: $("#f-login"), register: $("#f-register"), forgot: $("#f-forgot"),
  registered: $("#f-registered"), forgotdone: $("#f-forgotdone")
};
var tabs = $("#tabs"), tabLogin = $("#tab-login"), tabRegister = $("#tab-register");
var methodEmail = $("#method-email"), methodGoogle = $("#method-google");
var loginMethods = $("#login-methods");
var loginMethod = "email";

function chooseMethod(method, focus){
  loginMethod = method;
  var isGoogle = method === "google";
  $("#lg-google-wrap").hidden = !isGoogle;
  tabs.hidden = isGoogle;
  Object.keys(panels).forEach(function(k){
    panels[k].hidden = isGoogle || (k !== "login");
  });
  methodEmail.classList.toggle("is-active", !isGoogle);
  methodGoogle.classList.toggle("is-active", isGoogle);
  methodEmail.setAttribute("aria-pressed", String(!isGoogle));
  methodGoogle.setAttribute("aria-pressed", String(isGoogle));
  if (!isGoogle && focus) $("#f-login input[name=email]").focus();
  if (isGoogle && focus) methodGoogle.focus();
}

methodEmail.addEventListener("click", function(){ chooseMethod("email", false); });
methodGoogle.addEventListener("click", function(){ chooseMethod("google", false); });

function show(name, focus){
  Object.keys(panels).forEach(function(k){ panels[k].hidden = (k !== name); });
  var isTab = (name === "login" || name === "register");
  tabs.hidden = !isTab;
  var googleWrap = $("#lg-google-wrap");
  if (googleWrap) googleWrap.hidden = !isTab || loginMethod !== "google";
  if (loginMethods) loginMethods.hidden = !isTab;
  tabs.hidden = !isTab || loginMethod === "google";
  tabLogin.setAttribute("aria-selected", String(name === "login"));
  tabRegister.setAttribute("aria-selected", String(name === "register"));
  tabLogin.tabIndex = name === "login" ? 0 : -1;
  tabRegister.tabIndex = name === "register" ? 0 : -1;
  Array.prototype.forEach.call(document.querySelectorAll(".lg-error"), function(e){ e.hidden = true; });
  if (focus === false) return;
  var target = panels[name].querySelector("input") || panels[name].querySelector("h2");
  if (target) target.focus();
}

tabLogin.addEventListener("click", function(){ chooseMethod("email", false); show("login"); });
tabRegister.addEventListener("click", function(){ chooseMethod("email", false); show("register"); });

/* Login Google menggunakan token yang diverifikasi backend. */
GoogleAuth.render($("#lg-google-button"), function(credential){
  var box = $("#lg-google-error");
  box.hidden = true;
  API.post("/api/google-login", { credential: credential })
    .then(function(){ location.replace(next); })
    .catch(function(err){
      box.textContent = err.message;
      box.hidden = false;
    });
}, function(err){
  var box = $("#lg-google-error");
  box.textContent = err.message || "Google Login tidak dapat dimuat.";
  box.hidden = false;
});
tabs.addEventListener("keydown", function(e){        // navigasi panah antar tab
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  var goRegister = tabLogin.getAttribute("aria-selected") === "true";
  show(goRegister ? "register" : "login");
  (goRegister ? tabRegister : tabLogin).focus();
});
Array.prototype.forEach.call(document.querySelectorAll("[data-go]"), function(b){
  b.addEventListener("click", function(){
    var from = $("#f-login input[name=email]").value;
    show(b.getAttribute("data-go"));
    if (b.getAttribute("data-go") === "forgot") $("#f-forgot input[name=email]").value = from;
  });
});

/* Tampilkan / sembunyikan password */
Array.prototype.forEach.call(document.querySelectorAll(".lg-eye"), function(b){
  b.addEventListener("click", function(){
    var inp = b.parentNode.querySelector("input");
    var showIt = inp.type === "password";
    inp.type = showIt ? "text" : "password";
    b.textContent = showIt ? "Sembunyikan" : "Tampilkan";
    b.setAttribute("aria-pressed", String(showIt));
  });
});

/* Kirim formulir */
var EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
function fail(form, msg, field){
  var box = $(".lg-error", form);
  box.textContent = msg; box.hidden = false;
  if (field) form.elements[field].focus();
}
function submit(form, label, work){
  form.addEventListener("submit", function(e){
    e.preventDefault();
    var btn = $(".lg-submit", form);
    $(".lg-error", form).hidden = true;
    var p = work(form);
    if (!p) return;                         // validasi gagal
    btn.disabled = true; btn.textContent = "Memproses…";
    p.catch(function(err){ fail(form, err.message); })
     .then(function(){ btn.disabled = false; btn.textContent = label; });
  });
}

submit(panels.login, "Masuk", function(f){
  var email = f.elements.email.value.trim(), pw = f.elements.password.value;
  if (!EMAIL_RE.test(email)) { fail(f, "Isi email dengan format yang benar.", "email"); return null; }
  if (!pw) { fail(f, "Password wajib diisi.", "password"); return null; }
  return API.post("/api/login", { email: email, password: pw }).then(function(){ location.replace(next); });
});

submit(panels.register, "Buat akun", function(f){
  var nama = f.elements.nama.value.trim(), email = f.elements.email.value.trim(), pw = f.elements.password.value;
  if (nama.length < 2) { fail(f, "Nama minimal 2 karakter.", "nama"); return null; }
  if (!EMAIL_RE.test(email)) { fail(f, "Isi email dengan format yang benar.", "email"); return null; }
  if (pw.length < 8) { fail(f, "Password minimal 8 karakter.", "password"); return null; }
  return API.post("/api/register", { nama: nama, email: email, password: pw }).then(function(r){
    $("#regEmail").textContent = r.user.email;
    f.reset();
    show("registered");
  });
});

submit(panels.forgot, "Kirim tautan", function(f){
  var email = f.elements.email.value.trim();
  if (!EMAIL_RE.test(email)) { fail(f, "Isi email dengan format yang benar.", "email"); return null; }
  return API.post("/api/forgot", { email: email }).then(function(r){
    $("#forgotMsg").textContent = r.message;
    show("forgotdone");
  });
});

$("#goNext").addEventListener("click", function(){ location.replace(next); });

/* Sudah masuk? langsung ke tujuan */
API.get("/api/me").then(function(r){ if (r.user && panels.registered.hidden) location.replace(next); }).catch(function(){});
})();


// ENTRY FLOW: guest access and registration tab
(function () {
  "use strict";

  // Jangan biarkan halaman utama mengarahkan kembali ke login
  // setelah pengunjung sudah sampai di halaman login.
  try {
    localStorage.setItem("panduan-sholat-entry-shown", "1");
  } catch (e) {}

  var guest = document.getElementById("continue-guest");
  if (guest) {
    guest.addEventListener("click", function () {
      try {
        localStorage.setItem("panduan-sholat-entry-shown", "1");
      } catch (e) {}
    });
  }

  var requestedMode = new URLSearchParams(location.search).get("mode");
  if (requestedMode === "register") {
    var registerTab = document.getElementById("tab-register");
    if (registerTab) registerTab.click();
  }
})();
