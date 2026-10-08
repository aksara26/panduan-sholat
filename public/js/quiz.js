/**
 * quiz.js — Kuis "Uji pemahaman" + Peringkat lomba.
 * Soal dan penilaian ada di server (tabel questions), jadi skor tidak bisa
 * dimanipulasi dari browser. Peringkat hanya tampil untuk user yang login.
 * Bergantung pada: api.js, auth.js (global API, Auth).
 */
(function(){
"use strict";

var quiz = { attemptId:null, questions:[], i:0, score:0, answered:false, busy:false };

function $(id){ return document.getElementById(id); }
function el(tag, cls, text){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(cls, text, fn){
  var b = el("button", cls, text); b.type = "button";
  b.addEventListener("click", fn);
  return b;
}
function fmtTime(ms){
  var s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return m + ":" + String(s % 60).padStart(2, "0");
}
function showError(root, msg){
  var old = root.querySelector(".quiz-error"); if (old) old.remove();
  var p = el("p","quiz-error", msg); p.setAttribute("role","alert");
  root.querySelector(".quiz-card").appendChild(p);
}

/* ---------- Intro ---------- */
function renderIntro(){
  var root = $("quizRoot");
  root.textContent = "";
  var card = el("div","quiz-card quiz-intro");
  if (!Auth.user){
    card.appendChild(el("p","quiz-big","Masuk untuk ikut kuis"));
    card.appendChild(el("p","quiz-desc","Kuis ini bagian dari lomba. Masuk dengan email supaya skormu tercatat dan masuk peringkat."));
    var row = el("div","quiz-row");
    row.appendChild(btn("btn primary","Masuk", function(){ Auth.openDialog("login"); }));
    row.appendChild(btn("btn","Daftar", function(){ Auth.openDialog("register"); }));
    card.appendChild(row);
  } else if (!Auth.user.emailVerified){
    card.appendChild(el("p","quiz-big","Verifikasi email dulu"));
    card.appendChild(el("p","quiz-desc","Kami mengirim tautan verifikasi ke " + Auth.user.email + ". Klik tautan itu (cek juga folder spam), lalu kembali ke sini."));
    var vrow = el("div","quiz-row");
    vrow.appendChild(btn("btn primary","Saya sudah verifikasi", function(){
      Auth.refresh().then(function(u){
        if (u && !u.emailVerified) showError($("quizRoot"), "Email belum terverifikasi. Klik tautan di emailmu terlebih dahulu.");
      });
    }));
    vrow.appendChild(btn("btn","Kirim ulang email", function(){
      API.post("/api/resend-verification").then(function(r){
        var p = el("p","auth-info", r.message); p.setAttribute("role","status");
        var old = $("quizRoot").querySelector(".auth-info,.quiz-error"); if (old) old.remove();
        card.appendChild(p);
      }).catch(function(e){ showError($("quizRoot"), e.message); });
    }));
    card.appendChild(vrow);
  } else {
    card.appendChild(el("p","quiz-big","10 soal acak"));
    card.appendChild(el("p","quiz-desc","Halo, " + Auth.user.nama + ". Soal diacak setiap kali mulai. Skor terbaikmu (dan waktu tercepat jika seri) masuk peringkat. Selesaikan dalam 30 menit."));
    card.appendChild(btn("btn primary","Mulai Kuis", startQuiz));
  }
  root.appendChild(card);
}

function startQuiz(){
  if (quiz.busy) return;
  quiz.busy = true;

  API.post("/api/quiz/start", { action: "check" })
    .then(function(r){
      quiz.busy = false;

      if (r.resume) {
        showResumeChoice();
        return;
      }

      beginQuiz("start");
    })
    .catch(function(e){
      quiz.busy = false;
      renderIntro();
      showError($("quizRoot"), e.message);
    });
}

function showResumeChoice(){
  var root = $("quizRoot");
  root.textContent = "";

  var card = el("div","quiz-card quiz-intro");

  card.appendChild(
    el("p","quiz-big","Kuis sebelumnya masih tersimpan")
  );

  card.appendChild(
    el(
      "p",
      "quiz-desc",
      "Kamu masih memiliki kuis yang belum selesai. Kamu bisa melanjutkan kuis sebelumnya atau memulai kuis baru."
    )
  );

  var row = el("div","quiz-row");

  row.appendChild(
    btn("btn primary","Lanjutkan Kuis",function(){
      beginQuiz("continue");
    })
  );

  row.appendChild(
    btn("btn","Mulai Ulang",function(){
      beginQuiz("restart");
    })
  );

  card.appendChild(row);
  root.appendChild(card);
}

function beginQuiz(action){
  if (quiz.busy) return;

  quiz.busy = true;

  API.post("/api/quiz/start", { action: action })
    .then(function(r){
      quiz.attemptId = r.attemptId;
      quiz.questions = r.questions || [];
      quiz.i = 0;
      quiz.score = Number(r.score || 0);
      quiz.answered = false;

      var answeredIds = new Set(
        (r.answeredIds || []).map(function(id){
          return Number(id);
        })
      );

      while (
        quiz.i < quiz.questions.length &&
        answeredIds.has(Number(quiz.questions[quiz.i].id))
      ) {
        quiz.i++;
      }

      if (quiz.i >= quiz.questions.length) {
        quiz.busy = false;
        finishQuiz();
        return;
      }

      renderQuestion();
    })
    .catch(function(e){
      renderIntro();
      showError($("quizRoot"), e.message);
    })
    .then(function(){
      quiz.busy = false;
    });
}
/* ---------- Soal ---------- */
function renderQuestion(){
  var root = $("quizRoot");
  root.textContent = "";
  var q = quiz.questions[quiz.i];
  var card = el("div","quiz-card");
  card.appendChild(el("p","quiz-meta","Soal " + (quiz.i+1) + " dari " + quiz.questions.length + " · Skor " + quiz.score));

  var bar = el("div","bar quiz-bar");
  bar.setAttribute("role","progressbar");
  bar.setAttribute("aria-valuemin","0");
  bar.setAttribute("aria-valuemax", String(quiz.questions.length));
  bar.setAttribute("aria-valuenow", String(quiz.i));
  var fill = el("i"); fill.style.width = (quiz.i / quiz.questions.length * 100) + "%";
  bar.appendChild(fill);
  card.appendChild(bar);

  card.appendChild(el("p","quiz-prompt", q.prompt));
  var opts = el("div","quiz-options");
  q.options.forEach(function(t){
    var b = btn("quiz-opt", t, function(){ selectAnswer(t, b); });
    opts.appendChild(b);
  });
  card.appendChild(opts);

  var explain = el("p","quiz-explain"); explain.id = "quizExplain"; explain.hidden = true;
  card.appendChild(explain);

  var nav = el("div","quiz-nav");
  var last = quiz.i === quiz.questions.length - 1;
  var next = btn("btn primary", last ? "Lihat hasil" : "Soal berikutnya", function(){
    if (!last){ quiz.i++; quiz.answered = false; renderQuestion(); }
    else finishQuiz();
  });
  next.id = "quizNext"; next.disabled = true;
  nav.appendChild(next);
  card.appendChild(nav);
  root.appendChild(card);
}

function selectAnswer(text, b){
  if (quiz.answered || quiz.busy) return;
  quiz.busy = true;
  var q = quiz.questions[quiz.i];
  API.post("/api/quiz/answer", { attemptId: quiz.attemptId, questionId: q.id, answer: text })
    .then(function(r){
      quiz.answered = true;
      if (r.correct) quiz.score++;
      Array.prototype.forEach.call(document.querySelectorAll(".quiz-opt"), function(o){
        o.disabled = true;
        if (o.textContent === r.correctAnswer) o.classList.add("correct");
        else if (o === b) o.classList.add("incorrect");
      });
      var ex = $("quizExplain");
      ex.hidden = false;
      ex.textContent = (r.correct ? "Benar. " : "Kurang tepat, jawaban yang benar: \"" + r.correctAnswer + "\". ") + r.explain;
      $("quizNext").disabled = false;
    })
    .catch(function(e){
      if (e.status === 410 || e.status === 401){ renderIntro(); }
      showError($("quizRoot"), e.message);
    })
    .then(function(){ quiz.busy = false; });
}

/* ---------- Hasil ---------- */
function finishQuiz(){
  if (quiz.busy) return;
  quiz.busy = true;
  API.post("/api/quiz/finish", { attemptId: quiz.attemptId }).then(function(r){
    renderResult(r);
    loadLeaderboard();
  }).catch(function(e){
    showError($("quizRoot"), e.message);
  }).then(function(){ quiz.busy = false; });
}

function renderResult(r){
  var root = $("quizRoot");
  root.textContent = "";
  var card = el("div","quiz-card quiz-result");
  card.appendChild(el("p","quiz-big", r.score + " / " + r.total));
  card.appendChild(el("p","quiz-desc","Waktu " + fmtTime(r.durationMs) + (r.rank ? " · Peringkatmu saat ini: #" + r.rank : "")));
  var pct = r.score / r.total;
  card.appendChild(el("p","quiz-desc", pct >= 0.8 ? "Bagus, sebagian besar sudah kamu kuasai."
    : pct >= 0.5 ? "Lumayan, beberapa bagian masih perlu diulang."
    : "Coba baca ulang bagian langkah dan rukun di atas, lalu ulangi kuisnya."));
  var row = el("div","quiz-row");
  row.appendChild(btn("btn primary","Ulangi Kuis", startQuiz));
  var a = el("a","btn","Lihat peringkat"); a.href = "#boardH";
  row.appendChild(a);
  card.appendChild(row);
  root.appendChild(card);
}

/* ---------- Peringkat ---------- */
function loadLeaderboard(){
  var box = $("boardRoot");
  if (!box) return;
  box.textContent = "";
  if (!Auth.user){
    var c = el("div","quiz-card quiz-intro");
    c.appendChild(el("p","quiz-desc","Peringkat hanya terlihat setelah kamu masuk."));
    c.appendChild(btn("btn primary","Masuk", function(){ Auth.openDialog("login"); }));
    box.appendChild(c);
    return;
  }
  if (!Auth.user.emailVerified){
    var lc = el("div","quiz-card quiz-intro");
    lc.appendChild(el("p","quiz-desc","Peringkat terlihat setelah emailmu terverifikasi."));
    box.appendChild(lc);
    return;
  }
  API.get("/api/leaderboard").then(function(r){
    var card = el("div","quiz-card");
    var info = r.myRank ? "Peringkatmu: #" + r.myRank + " dari " + r.participants + " peserta."
                        : (r.participants + " peserta. Selesaikan satu kuis untuk masuk peringkat.");
    card.appendChild(el("p","quiz-meta", info));
    if (!r.top.length){
      card.appendChild(el("p","quiz-desc","Belum ada yang menyelesaikan kuis."));
    } else {
      var wrap = el("div","table-wrap");
      var t = el("table","board");
      var cap = el("caption","sr-only","Peringkat peserta lomba"); t.appendChild(cap);
      var head = el("tr");
      ["#","Nama","Skor","Waktu"].forEach(function(h){ var th = el("th",null,h); th.scope = "col"; head.appendChild(th); });
      var thead = el("thead"); thead.appendChild(head); t.appendChild(thead);
      var tb = el("tbody");
      r.top.forEach(function(row){
        var tr = el("tr", row.me ? "me" : null);
        tr.appendChild(el("td",null, String(row.rank)));
        tr.appendChild(el("td",null, row.nama + (row.me ? " (kamu)" : "")));
        tr.appendChild(el("td",null, row.score + "/" + row.total));
        tr.appendChild(el("td",null, fmtTime(row.durationMs)));
        tb.appendChild(tr);
      });
      t.appendChild(tb); wrap.appendChild(t); card.appendChild(wrap);
    }
    box.appendChild(card);
  }).catch(function(e){
    var c = el("div","quiz-card"); c.appendChild(el("p","quiz-error", e.message)); box.appendChild(c);
  });
}

/* ---------- Mulai ---------- */
Auth.onChange(function(){
  // jangan ganggu kuis yang sedang berjalan
  if (!quiz.attemptId || !document.querySelector(".quiz-opt, .quiz-result")) renderIntro();
  loadLeaderboard();
});

})();
