/**
 * auth.js — bar akun di header + dialog Masuk/Daftar.
 * Menyediakan global `Auth`: Auth.user, Auth.onChange(fn), Auth.openDialog(mode).
 */
var Auth = (function(){
"use strict";
var listeners = [];
var self = { user: null, ready: false };

function el(tag, cls, text){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function setUser(u){
  self.user = u; self.ready = true;
  renderBar();
  listeners.forEach(function(fn){ fn(u); });
}
self.onChange = function(fn){ listeners.push(fn); if (self.ready) fn(self.user); };

/* ---------- Bar akun ---------- */
function renderBar(){
  var box = document.getElementById("account");
  if (!box) return;
  box.textContent = "";
  if (!self.user){
    var b1 = el("button","chip","Masuk"); b1.type = "button";
    b1.addEventListener("click", function(){ openDialog("login"); });
    var b2 = el("button","chip primary-chip","Daftar"); b2.type = "button";
    b2.addEventListener("click", function(){ openDialog("register"); });
    box.appendChild(b1); box.appendChild(b2);
    return;
  }
  box.appendChild(el("span","who", self.user.nama));
  if (self.user.role === "admin" && location.pathname.indexOf("/admin") !== 0){
    var a = el("a","chip","Panel admin"); a.href = "/admin";
    box.appendChild(a);
  }
  var out = el("button","chip","Keluar"); out.type = "button";
  out.addEventListener("click", function(){
    API.post("/api/logout").then(function(){
      if (document.documentElement.getAttribute("data-gate")) location.replace("/login.html");
      else setUser(null);
    });
  });
  box.appendChild(out);
}

/* ---------- Dialog ---------- */
var dlg, form, errBox, infoBox, titleEl, submitBtn, switchBtn, forgotBtn, nameField, pwField, mode = "login";

function buildDialog(){
  dlg = el("dialog","auth-dialog");
  dlg.setAttribute("aria-labelledby","authTitle");
  form = el("form","auth-form"); form.noValidate = true;
  titleEl = el("h2",null); titleEl.id = "authTitle";
  form.appendChild(titleEl);

  function field(id, label, type, ac){
    var wrap = el("label","auth-field");
    wrap.appendChild(el("span",null,label));
    var inp = el("input"); inp.id = id; inp.name = id; inp.type = type; inp.autocomplete = ac; inp.required = true;
    wrap.appendChild(inp);
    return wrap;
  }
  nameField = field("authNama","Nama","text","name");
  form.appendChild(nameField);
  form.appendChild(field("authEmail","Email","email","email"));
  pwField = field("authPassword","Password (minimal 8 karakter)","password","current-password");
  form.appendChild(pwField);

  forgotBtn = el("button","auth-switch auth-forgot","Lupa password?"); forgotBtn.type = "button";
  forgotBtn.addEventListener("click", function(){ setMode("forgot"); });
  form.appendChild(forgotBtn);

  errBox = el("p","auth-error"); errBox.setAttribute("role","alert"); errBox.hidden = true;
  form.appendChild(errBox);
  infoBox = el("p","auth-info"); infoBox.setAttribute("role","status"); infoBox.hidden = true;
  form.appendChild(infoBox);

  var row = el("div","auth-actions");
  var cancel = el("button","btn","Batal"); cancel.type = "button";
  cancel.addEventListener("click", function(){ dlg.close(); });
  submitBtn = el("button","btn primary"); submitBtn.type = "submit";
  row.appendChild(cancel); row.appendChild(submitBtn);
  form.appendChild(row);

  switchBtn = el("button","auth-switch"); switchBtn.type = "button";
  switchBtn.addEventListener("click", function(){ setMode(mode === "register" ? "login" : mode === "forgot" ? "login" : "register"); });
  form.appendChild(switchBtn);

  form.addEventListener("submit", onSubmit);
  dlg.appendChild(form);
  document.body.appendChild(dlg);
}

function setMode(m){
  mode = m;
  var reg = m === "register", forgot = m === "forgot";
  titleEl.textContent = reg ? "Daftar akun" : forgot ? "Lupa password" : "Masuk";
  submitBtn.textContent = reg ? "Daftar" : forgot ? "Kirim tautan" : "Masuk";
  switchBtn.textContent = reg ? "Sudah punya akun? Masuk" : forgot ? "Kembali ke Masuk" : "Belum punya akun? Daftar";
  nameField.hidden = !reg;
  nameField.querySelector("input").required = reg;
  pwField.hidden = forgot;
  pwField.querySelector("input").required = !forgot;
  forgotBtn.hidden = m !== "login";
  form.elements.authPassword.autocomplete = reg ? "new-password" : "current-password";
  errBox.hidden = true; infoBox.hidden = true;
}

function onSubmit(e){
  e.preventDefault();
  errBox.hidden = true; infoBox.hidden = true;
  var email = form.elements.authEmail.value, pw = form.elements.authPassword.value;
  var url, body = { email: email };
  if (mode === "forgot") url = "/api/forgot";
  else {
    body.password = pw;
    if (mode === "register"){ body.nama = form.elements.authNama.value; url = "/api/register"; }
    else url = "/api/login";
  }
  submitBtn.disabled = true;
  API.post(url, body)
    .then(function(r){
      if (mode === "forgot"){ infoBox.textContent = r.message; infoBox.hidden = false; return; }
      form.reset(); dlg.close(); setUser(r.user);
    })
    .catch(function(err){ errBox.textContent = err.message; errBox.hidden = false; })
    .then(function(){ submitBtn.disabled = false; });
}

function openDialog(m){
  if (!dlg) buildDialog();
  setMode(m || "login");
  if (!dlg.open) dlg.showModal();
  var first = mode === "register" ? form.elements.authNama : form.elements.authEmail;
  first.focus();
}
self.openDialog = openDialog;
self.refresh = function(){
  return API.get("/api/me").then(function(r){ setUser(r.user); return r.user; });
};

/* ---------- Mulai ---------- */
API.get("/api/me").then(function(r){ setUser(r.user); }).catch(function(){ setUser(null); });
return self;
})();
