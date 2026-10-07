/* admin.js — panel admin: statistik, user, soal kuis, reset peringkat. */
(function(){
"use strict";
var root = document.getElementById("adminRoot");
var tab = "users";

function el(tag, cls, text){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(cls, text, fn){
  var b = el("button", cls, text); b.type = "button";
  b.addEventListener("click", fn); return b;
}
function msg(text, isErr){
  var m = el("p","adm-msg" + (isErr ? " err" : ""), text);
  m.setAttribute("role", isErr ? "alert" : "status");
  var old = document.querySelector(".adm-msg"); if (old) old.remove();
  var panel = document.getElementById("admPanel");
  if (panel) panel.prepend(m);
}
function fail(e){ msg(e.message, true); }

function gate(){
  root.textContent = "";
  if (!Auth.user){
    root.appendChild(el("p","lead","Masuk dengan akun admin untuk melanjutkan."));
    root.appendChild(btn("btn primary","Masuk", function(){ Auth.openDialog("login"); }));
    return false;
  }
  if (Auth.user.role !== "admin"){
    root.appendChild(el("p","lead","Akun ini bukan admin."));
    return false;
  }
  return true;
}

function render(){
  if (!gate()) return;
  var stats = el("div","adm-stats"); stats.id = "admStats";
  root.appendChild(stats);
  API.get("/api/admin/stats").then(function(s){
    [["Pengguna", s.users],["Admin", s.admins],["Soal aktif", s.questions],
     ["Kuis selesai", s.finishedAttempts],["Peserta di peringkat", s.participants],
     ["Rata-rata skor", s.avgScorePct + "%"]].forEach(function(p){
      var c = el("div","adm-stat"); c.appendChild(el("b",null,String(p[1]))); c.appendChild(el("span",null,p[0]));
      stats.appendChild(c);
    });
  }).catch(fail);

  var tabs = el("div","adm-tabs"); tabs.setAttribute("role","group"); tabs.setAttribute("aria-label","Bagian admin");
  [["users","Pengguna"],["questions","Soal kuis"],["board","Peringkat"]].forEach(function(t){
    var b = btn("chip", t[1], function(){ tab = t[0]; render(); });
    b.setAttribute("aria-pressed", String(tab === t[0]));
    tabs.appendChild(b);
  });
  root.appendChild(tabs);
  var panel = el("div","adm-panel"); panel.id = "admPanel";
  root.appendChild(panel);
  if (tab === "users") renderUsers(panel);
  else if (tab === "questions") renderQuestions(panel);
  else renderBoard(panel);
}

/* ---------- Pengguna ---------- */
function renderUsers(panel){
  API.get("/api/admin/users").then(function(r){
    var wrap = el("div","table-wrap"), t = el("table","adm-table");
    var head = el("tr");
    ["Nama","Email","Role","Email terverifikasi","Kuis selesai","Terdaftar",""].forEach(function(h){ head.appendChild(el("th",null,h)); });
    var th = el("thead"); th.appendChild(head); t.appendChild(th);
    var tb = el("tbody");
    r.users.forEach(function(u){
      var tr = el("tr");
      tr.appendChild(el("td",null,u.nama));
      tr.appendChild(el("td",null,u.email));
      var rt = el("td"); rt.appendChild(el("span","badge",u.role)); tr.appendChild(rt);
      var vt = el("td"); vt.appendChild(el("span", u.emailVerified ? "badge" : "badge off", u.emailVerified ? "ya" : "belum")); tr.appendChild(vt);
      tr.appendChild(el("td",null,String(u.attempts)));
      tr.appendChild(el("td",null,u.createdAt));
      var act = el("td"); var box = el("div","adm-actions");
      if (u.id !== Auth.user.id){
        var next = u.role === "admin" ? "user" : "admin";
        box.appendChild(btn("btn", next === "admin" ? "Jadikan admin" : "Jadikan user", function(){
          API.patch("/api/admin/users/" + u.id, { role: next }).then(render).catch(fail);
        }));
        if (!u.emailVerified){
          box.appendChild(btn("btn","Verifikasi manual", function(){
            API.patch("/api/admin/users/" + u.id, { verified: true }).then(render).catch(fail);
          }));
        }
        box.appendChild(btn("btn danger","Hapus", function(){
          if (!confirm("Hapus akun " + u.email + " beserta seluruh skornya?")) return;
          API.del("/api/admin/users/" + u.id).then(render).catch(fail);
        }));
      } else box.appendChild(el("span",null,"(kamu)"));
      act.appendChild(box); tr.appendChild(act);
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); panel.appendChild(wrap);
  }).catch(fail);
}

/* ---------- Soal ---------- */
function questionForm(q, onDone){
  var f = el("form","adm-form"); f.noValidate = true;
  function field(label, node){ var l = el("label"); l.appendChild(el("span",null,label)); l.appendChild(node); f.appendChild(l); return node; }
  var prompt = field("Pertanyaan", el("textarea"));
  var opts = field("Pilihan jawaban (satu per baris, 2–6)", el("textarea"));
  var correct = field("Jawaban benar (harus sama persis dengan salah satu pilihan)", el("input"));
  var explain = field("Penjelasan (opsional)", el("textarea"));
  var active = null;
  if (q){
    prompt.value = q.prompt; opts.value = q.options.join("\n"); correct.value = q.correct; explain.value = q.explain;
    active = el("input"); active.type = "checkbox"; active.checked = q.active; active.style.width = "auto"; active.style.minHeight = "0";
    var l = el("label"); l.appendChild(active); l.appendChild(document.createTextNode(" Aktif (dipakai di kuis)")); f.appendChild(l);
  }
  var row = el("div","adm-actions");
  var save = el("button","btn primary", q ? "Simpan" : "Tambah soal"); save.type = "submit";
  row.appendChild(save);
  if (q) row.appendChild(btn("btn","Batal", onDone));
  f.appendChild(row);
  f.addEventListener("submit", function(e){
    e.preventDefault();
    var body = {
      prompt: prompt.value, correct: correct.value, explain: explain.value,
      options: opts.value.split("\n").map(function(s){ return s.trim(); }).filter(Boolean)
    };
    var req;
    if (q){ body.active = active.checked; req = API.put("/api/admin/questions/" + q.id, body); }
    else req = API.post("/api/admin/questions", body);
    req.then(onDone).catch(fail);
  });
  return f;
}

function renderQuestions(panel){
  panel.appendChild(questionForm(null, render));
  API.get("/api/admin/questions").then(function(r){
    var wrap = el("div","table-wrap"), t = el("table","adm-table");
    var head = el("tr");
    ["#","Pertanyaan","Jawaban benar","Jenis",""].forEach(function(h){ head.appendChild(el("th",null,h)); });
    var th = el("thead"); th.appendChild(head); t.appendChild(th);
    var tb = el("tbody");
    r.questions.forEach(function(q){
      var tr = el("tr");
      tr.appendChild(el("td",null,String(q.id)));
      var pt = el("td",null,q.prompt);
      if (!q.active) pt.appendChild(el("span","badge off"," nonaktif"));
      tr.appendChild(pt);
      tr.appendChild(el("td",null,q.correct));
      tr.appendChild(el("td",null,q.kind));
      var act = el("td"), box = el("div","adm-actions");
      box.appendChild(btn("btn","Edit", function(){
        var holder = el("tr"), td = el("td");
        td.colSpan = 5; td.appendChild(questionForm(q, render));
        holder.appendChild(td); tr.replaceWith(holder);
      }));
      box.appendChild(btn("btn danger","Hapus", function(){
        if (!confirm("Hapus soal ini?")) return;
        API.del("/api/admin/questions/" + q.id).then(render).catch(fail);
      }));
      act.appendChild(box); tr.appendChild(act); tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); panel.appendChild(wrap);
  }).catch(fail);
}

/* ---------- Peringkat ---------- */
function renderBoard(panel){
  panel.appendChild(el("p","lead","Reset menghapus seluruh riwayat kuis dan mengosongkan peringkat. Akun pengguna tidak terhapus. Gunakan saat memulai babak lomba baru."));
  var f = el("form","adm-form"); f.noValidate = true;
  var l = el("label"); l.appendChild(el("span",null,'Ketik RESET untuk mengonfirmasi'));
  var inp = el("input"); l.appendChild(inp); f.appendChild(l);
  var b = el("button","btn danger","Reset peringkat"); b.type = "submit"; f.appendChild(b);
  f.addEventListener("submit", function(e){
    e.preventDefault();
    API.post("/api/admin/leaderboard/reset", { confirm: inp.value }).then(function(r){
      render(); setTimeout(function(){ msg(r.deleted + " riwayat kuis dihapus."); }, 300);
    }).catch(fail);
  });
  panel.appendChild(f);
}

Auth.onChange(render);
})();
