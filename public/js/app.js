/**
 * app.js
 * -----------------------------------------------------------------
 * Logika UI untuk Panduan Tata Cara Sholat: render tombol pilihan
 * sholat & peran, render langkah aktif, render daftar langkah,
 * navigasi (tombol/keyboard), serta preferensi tampilan (latin,
 * arti, ukuran huruf Arab, mode gelap) yang disimpan di localStorage.
 *
 * Bergantung pada variabel global dari sholat-data.js:
 *   P, SHOLAT, ORDER, ROLES, ROLE_ORDER, buildSteps, figureSVG
 * Pastikan sholat-data.js dimuat SEBELUM file ini di index.html.
 * -----------------------------------------------------------------
 */
(function(){
"use strict";

/* ---------- Status dan elemen ---------- */
var state = {key:"subuh", role:"sendiri", i:0, steps:[]};
var $ = function(id){return document.getElementById(id);};

function store(k, v){ try{ localStorage.setItem("sholat."+k, v); }catch(e){} }
function load(k){ try{ return localStorage.getItem("sholat."+k); }catch(e){ return null; } }

function el(tag, cls, text){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderPrayerButtons(){
  var box = $("prayers");
  box.textContent = "";
  ORDER.forEach(function(k){
    var s = SHOLAT[k];
    var b = el("button","prayer");
    b.type = "button";
    b.setAttribute("aria-pressed", String(k === state.key));
    var nm = el("b", null, s.nama);
    var sp = el("span", null, s.n + " rakaat");
    b.appendChild(nm); b.appendChild(sp);
    b.addEventListener("click", function(){ selectPrayer(k, true); });
    box.appendChild(b);
  });
}

function renderRoleButtons(){
  var box = $("roles");
  box.textContent = "";
  ROLE_ORDER.forEach(function(k){
    var ro = ROLES[k];
    var b = el("button","prayer");
    b.type = "button";
    b.setAttribute("aria-pressed", String(k === state.role));
    b.appendChild(el("b", null, ro.nama));
    b.appendChild(el("span", null, ro.sub));
    b.addEventListener("click", function(){ selectRole(k); });
    box.appendChild(b);
  });
}

function renderStep(scroll){
  var st = state.steps[state.i];
  var pose = P[st.pose];
  $("fig").innerHTML = figureSVG(st.pose);
  $("fig").setAttribute("aria-label", "Gambar postur: " + pose.name);
  $("postureName").textContent = pose.name;
  $("meta").textContent = "Rakaat " + st.r + " dari " + SHOLAT[state.key].n + " \u00B7 langkah " + (st.i+1) + " dari " + st.total;
  $("stepTitle").textContent = st.title;
  var tag = $("tag");
  tag.className = "tag " + st.tag;
  tag.textContent = st.tag === "rukun" ? "Rukun" : "Sunnah";
  var rep = $("rep");
  if (st.rep){ rep.hidden = false; rep.textContent = "Baca " + st.rep; } else { rep.hidden = true; }

  var vb = $("verses");
  vb.textContent = "";
  st.verses.forEach(function(v){
    var d = el("div","verse");
    var a = el("p","arab", v.a); a.setAttribute("lang","ar"); a.setAttribute("dir","rtl");
    d.appendChild(a);
    d.appendChild(el("p","latin", v.l));
    d.appendChild(el("p","arti", v.t));
    vb.appendChild(d);
  });
  var nb = $("notes");
  nb.textContent = "";
  st.notes.forEach(function(t){ nb.appendChild(el("li", null, t)); });

  $("prev").disabled = state.i === 0;
  $("next").disabled = state.i === st.total - 1;
  $("next").textContent = state.i === st.total - 1 ? "Selesai" : "Berikutnya";
  var bar = $("bar");
  bar.setAttribute("aria-valuemax", String(st.total));
  bar.setAttribute("aria-valuenow", String(st.i + 1));
  $("barFill").style.width = ((st.i + 1) / st.total * 100) + "%";

  var btns = document.querySelectorAll("#stepList button");
  Array.prototype.forEach.call(btns, function(b, idx){
    if (idx === state.i) b.setAttribute("aria-current","step"); else b.removeAttribute("aria-current");
  });

  if (scroll){
    var top = $("player").getBoundingClientRect().top;
    if (top < 0){
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      $("player").scrollIntoView({block:"start", behavior: reduce ? "auto" : "smooth"});
    }
  }
}

function renderList(){
  var box = $("stepList");
  box.textContent = "";
  var lastR = 0, ol = null;
  state.steps.forEach(function(st){
    if (st.r !== lastR){
      lastR = st.r;
      box.appendChild(el("h3", null, "Rakaat " + st.r));
      ol = el("ol");
      box.appendChild(ol);
    }
    var li = el("li");
    var b = el("button");
    b.type = "button";
    b.appendChild(el("span", null, st.title));
    b.appendChild(el("span","k", st.tag === "rukun" ? "Rukun" : "Sunnah"));
    b.addEventListener("click", function(){ go(st.i, true); });
    li.appendChild(b);
    ol.appendChild(li);
  });
}

function go(i, scroll){
  if (i < 0 || i >= state.steps.length) return;
  state.i = i;
  renderStep(scroll);
}

function selectPrayer(key, scroll){
  state.key = key;
  state.steps = buildSteps(key, state.role);
  state.i = 0;
  store("prayer", key);
  renderPrayerButtons();
  renderRoleButtons();
  renderList();
  renderStep(scroll);
}

function selectRole(role){
  state.role = role;
  state.steps = buildSteps(state.key, role);
  store("role", role);
  renderRoleButtons();
  renderList();
  renderStep(false);
}

/* ---------- Kontrol tampilan ---------- */
var sizes = [1.6, 1.85, 2.1, 2.4, 2.8];
var sizeIdx = (window.innerWidth <= 520) ? 1 : 2;
function applySize(){
  document.documentElement.style.setProperty("--fs-arab", sizes[sizeIdx] + "rem");
  $("sMinus").disabled = sizeIdx === 0;
  $("sPlus").disabled = sizeIdx === sizes.length - 1;
}
function togglePref(id, attr){
  var b = $(id);
  var on = b.getAttribute("aria-pressed") !== "true";
  b.setAttribute("aria-pressed", String(on));
  document.body.setAttribute(attr, on ? "on" : "off");
  store(attr, on ? "on" : "off");
}
function currentTheme(){
  var t = document.documentElement.getAttribute("data-theme");
  if (t) return t;
  return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}
function syncThemeButton(){
  var dark = currentTheme() === "dark";
  $("tTheme").textContent = dark ? "Mode terang" : "Mode gelap";
}

$("tLatin").addEventListener("click", function(){ togglePref("tLatin","data-latin"); });
$("tArti").addEventListener("click", function(){ togglePref("tArti","data-arti"); });
$("sMinus").addEventListener("click", function(){ if (sizeIdx > 0){ sizeIdx--; applySize(); store("size", sizeIdx); } });
$("sPlus").addEventListener("click", function(){ if (sizeIdx < sizes.length-1){ sizeIdx++; applySize(); store("size", sizeIdx); } });
$("tTheme").addEventListener("click", function(){
  var next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  store("theme", next);
  syncThemeButton();
});
$("prev").addEventListener("click", function(){ go(state.i - 1, true); });
$("next").addEventListener("click", function(){ go(state.i + 1, true); });
document.addEventListener("keydown", function(e){
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  var t = e.target && e.target.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
  if (e.key === "ArrowRight"){ go(state.i + 1, true); }
  else if (e.key === "ArrowLeft"){ go(state.i - 1, true); }
});

/* ---------- Mulai ---------- */
(function init(){
  var lp = load("data-latin"), ap = load("data-arti"), sz = load("size"), th = load("theme"), pk = load("prayer"), rl = load("role");
  if (lp === "off"){ document.body.setAttribute("data-latin","off"); $("tLatin").setAttribute("aria-pressed","false"); }
  if (ap === "off"){ document.body.setAttribute("data-arti","off"); $("tArti").setAttribute("aria-pressed","false"); }
  if (sz !== null && !isNaN(parseInt(sz,10))){ var z = parseInt(sz,10); if (z >= 0 && z < sizes.length) sizeIdx = z; }
  if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th);
  applySize();
  syncThemeButton();
  if (pk && SHOLAT[pk]) state.key = pk;
  if (rl && ROLES[rl]) state.role = rl;
  selectPrayer(state.key, false);
})();

})();
