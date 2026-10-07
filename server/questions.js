"use strict";
/* Membangkitkan bank soal dari public/js/sholat-data.js (soal dinamis) dan
   soal statis. Dipakai oleh seed.js. Soal dinamis dibuat deterministik dan
   disimpan ke database, supaya server yang menilai jawaban. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadData() {
  const file = path.join(__dirname, "..", "public", "js", "sholat-data.js");
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: "sholat-data.js" });
  return ctx; // berisi SHOLAT, ORDER, buildSteps, ...
}

const STATIC_QUESTIONS = require("./static-questions.json");

function uniqBy(arr, fn) {
  const seen = new Set();
  return arr.filter((x) => { const k = fn(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

function dynamicQuestions() {
  const d = loadData();
  const out = [];

  // 1) Urutan langkah
  d.ORDER.forEach((key) => {
    const steps = d.buildSteps(key, "sendiri");
    const titles = uniqBy(steps, (s) => s.title).map((s) => s.title);
    for (let i = 0; i < steps.length - 1; i++) {
      const cur = steps[i], nxt = steps[i + 1];
      const pool = titles.filter((t) => t !== nxt.title);
      // distraktor dipilih deterministik, bergeser menurut posisi
      const distractors = [];
      for (let k = 0; k < pool.length && distractors.length < 3; k++) {
        distractors.push(pool[(i * 2 + k) % pool.length]);
      }
      const options = uniqBy([nxt.title, ...distractors], (x) => x);
      out.push({
        prompt: `Pada sholat ${d.SHOLAT[key].nama} rakaat ke-${cur.r}, setelah "${cur.title}", langkah berikutnya adalah?`,
        options,
        correct: nxt.title,
        explain: `Urutannya: ${cur.title} → ${nxt.title} (rakaat ke-${cur.r}, sholat ${d.SHOLAT[key].nama}).`,
        kind: "dynamic",
      });
    }
  });

  // 2) Rukun atau sunnah
  const isya = d.buildSteps("isya", "sendiri");
  uniqBy(isya, (s) => s.title).forEach((s) => {
    const rukun = s.tag === "rukun";
    out.push({
      prompt: `Langkah "${s.title}" dalam sholat termasuk?`,
      options: ["Rukun", "Sunnah"],
      correct: rukun ? "Rukun" : "Sunnah",
      explain: rukun
        ? `"${s.title}" adalah salah satu dari 13 rukun sholat; jika tertinggal, sholat tidak sah.`
        : `"${s.title}" hukumnya sunnah: dianjurkan, tetapi sholat tetap sah bila ditinggalkan.`,
      kind: "dynamic",
    });
  });

  // 3) Jumlah rakaat
  d.ORDER.forEach((key) => {
    const s = d.SHOLAT[key];
    out.push({
      prompt: `Sholat ${s.nama} berjumlah berapa rakaat?`,
      options: ["2", "3", "4"],
      correct: String(s.n),
      explain: `Sholat ${s.nama} berjumlah ${s.n} rakaat.`,
      kind: "dynamic",
    });
  });

  return out;
}

function allQuestions() {
  return [
    ...STATIC_QUESTIONS.map((q) => ({ ...q, kind: "static" })),
    ...dynamicQuestions(),
  ];
}

module.exports = { allQuestions };
