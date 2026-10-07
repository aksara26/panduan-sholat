/**
 * sholat-data.js
 * -----------------------------------------------------------------
 * Data mentah untuk Panduan Tata Cara Sholat:
 *   - P        : koordinat gambar postur (SVG garis sederhana)
 *   - SHOLAT   : daftar 5 sholat fardhu beserta jumlah rakaat
 *   - ROLES    : niat sendiri / imam / makmum
 *   - V        : teks bacaan (Arab, latin, arti)
 *   - buildSteps(key, role) : menyusun urutan langkah lengkap untuk
 *                             satu sholat + satu peran
 *
 * File ini tidak menyentuh DOM sama sekali — murni data + fungsi
 * penyusun data, supaya mudah diuji terpisah dari app.js.
 * Variabel di sini sengaja dibuat global (bukan module) agar bisa
 * dipakai langsung oleh app.js lewat <script> biasa.
 * -----------------------------------------------------------------
 */
"use strict";

"use strict";

/* ---------- Data postur (tampak samping, menghadap kanan) ---------- */
var P = {
  takbir:{name:"Takbiratul ihram", head:[58,22], torso:[[58,32],[58,68]], legs:[[58,68],[58,90],[58,108],[68,108]], arm:[[58,38],[75,44],[73,28]]},
  qiyam:{name:"Berdiri (qiyam)", head:[58,22], torso:[[58,32],[58,68]], legs:[[58,68],[58,90],[58,108],[68,108]], arm:[[58,38],[73,52],[63,46]]},
  rukuk:{name:"Rukuk", head:[97,60], torso:[[87,60],[48,62]], legs:[[48,62],[48,86],[48,108],[58,108]], arm:[[82,62],[66,75],[50,87]]},
  itidal:{name:"I'tidal", head:[58,22], torso:[[58,32],[58,68]], legs:[[58,68],[58,90],[58,108],[68,108]], arm:[[58,38],[65,54],[63,70]]},
  sujud:{name:"Sujud", head:[96,96], torso:[[82,89],[40,72]], legs:[[40,72],[54,102],[24,106]], arm:[[78,88],[72,101],[90,108]]},
  duduk:{name:"Duduk di antara dua sujud", head:[50,34], torso:[[50,44],[46,92]], legs:[[46,92],[76,100],[34,107]], arm:[[50,50],[58,72],[68,95]]},
  tahiyat:{name:"Duduk tahiyat", head:[50,34], torso:[[50,44],[46,92]], legs:[[46,92],[76,100],[34,107]], arm:[[50,50],[62,70],[76,94],[86,90]]},
  salam:{name:"Salam", head:[50,34], torso:[[50,44],[46,92]], legs:[[46,92],[76,100],[34,107]], arm:[[50,50],[62,70],[76,94],[86,90]], extra:'<path class="fig-line" d="M64 24 Q78 12 92 24"/><path class="fig-line" d="M86 18 L92 24 L84 26"/>'}
};
function pts(a){return a.map(function(p){return p.join(",");}).join(" ");}
function figureSVG(k){
  var f = P[k];
  return '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<polyline class="fig-line" points="'+pts(f.legs)+'"/>' +
    '<polyline class="fig-line" points="'+pts(f.torso)+'"/>' +
    '<polyline class="fig-line" points="'+pts(f.arm)+'"/>' + (f.extra||"") +
    '<circle class="fig-head" cx="'+f.head[0]+'" cy="'+f.head[1]+'" r="9"/>' +
    '<rect class="fig-mat" x="6" y="111" width="108" height="5" rx="2.5"/></svg>';
}

/* ---------- Data bacaan ---------- */
var SHOLAT = {
  subuh:  {nama:"Subuh",  n:2, arab:"الصُّبْحِ",  lat:"fardhash shubhi",     idn:"Subuh",  jml:"رَكْعَتَيْنِ",  jl:"rak'ataini",       ji:"dua rakaat"},
  dzuhur: {nama:"Dzuhur", n:4, arab:"الظُّهْرِ",  lat:"fardhazh zhuhri",     idn:"Dzuhur", jml:"أَرْبَعَ رَكَعَاتٍ", jl:"arba'a raka'aatin", ji:"empat rakaat"},
  ashar:  {nama:"Ashar",  n:4, arab:"الْعَصْرِ",  lat:"fardhal 'ashri",      idn:"Ashar",  jml:"أَرْبَعَ رَكَعَاتٍ", jl:"arba'a raka'aatin", ji:"empat rakaat"},
  maghrib:{nama:"Maghrib",n:3, arab:"الْمَغْرِبِ", lat:"fardhal maghribi",    idn:"Maghrib",jml:"ثَلَاثَ رَكَعَاتٍ", jl:"tsalaatsa raka'aatin", ji:"tiga rakaat"},
  isya:   {nama:"Isya",   n:4, arab:"الْعِشَاءِ", lat:"fardhal 'isyaa'i",    idn:"Isya",   jml:"أَرْبَعَ رَكَعَاتٍ", jl:"arba'a raka'aatin", ji:"empat rakaat"}
};
var ORDER = ["subuh","dzuhur","ashar","maghrib","isya"];
var JAHR = {subuh:true, maghrib:true, isya:true};

var ROLES = {
  sendiri:{nama:"Sendiri", sub:"munfarid", a:"", l:"", t:""},
  imam:   {nama:"Imam",    sub:"imaaman",  a:" إِمَامًا",  l:" imaaman",   t:", sebagai imam"},
  makmum: {nama:"Makmum",  sub:"ma'muuman",a:" مَأْمُومًا", l:" ma'muuman", t:", sebagai makmum"}
};
var ROLE_ORDER = ["sendiri","imam","makmum"];
var ROLE_NOTE = {
  sendiri:null,
  imam:"Bagi imam, menambahkan kata imaaman tidak wajib dalam mazhab Syafi'i, kecuali pada beberapa sholat tertentu. Jika tidak diniatkan, sholatnya dianggap sholat sendirian, bukan berjamaah.",
  makmum:"Makmum wajib berniat sebagai makmum (ma'muuman) dalam mazhab Syafi'i, sebaiknya bersamaan dengan takbiratul ihram. Tanpa niat ini, sholat yang mengikuti imam tidak sah."
};

function niatVerse(s, role){
  var ro = ROLES[role];
  return {
    a:"أُصَلِّي فَرْضَ " + s.arab + " " + s.jml + " مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً" + ro.a + " لِلَّهِ تَعَالَى",
    l:"Ushalli " + s.lat + " " + s.jl + " mustaqbilal qiblati adaa'an" + ro.l + " lillaahi ta'aalaa.",
    t:"Aku berniat sholat fardhu " + s.idn + " " + s.ji + ", menghadap kiblat, tunai" + ro.t + ", karena Allah Ta'ala."
  };
}

var V = {
  takbir:{a:"اللَّهُ أَكْبَرُ", l:"Allaahu akbar", t:"Allah Maha Besar."},
  iftitah:[
    {a:"اللَّهُ أَكْبَرُ كَبِيرًا وَالْحَمْدُ لِلَّهِ كَثِيرًا وَسُبْحَانَ اللَّهِ بُكْرَةً وَأَصِيلًا",
     l:"Allaahu akbaru kabiiraa wal hamdu lillaahi katsiiraa wa subhaanallaahi bukratan wa ashiilaa.",
     t:"Allah Maha Besar dengan sebesar-besarnya, segala puji bagi Allah sebanyak-banyaknya, dan Maha Suci Allah pada waktu pagi dan petang."},
    {a:"إِنِّي وَجَّهْتُ وَجْهِيَ لِلَّذِي فَطَرَ السَّمَاوَاتِ وَالْأَرْضَ حَنِيفًا مُسْلِمًا وَمَا أَنَا مِنَ الْمُشْرِكِينَ",
     l:"Innii wajjahtu wajhiya lilladzii fatharas samaawaati wal ardha haniifan musliman wa maa anaa minal musyrikiin.",
     t:"Sesungguhnya aku menghadapkan wajahku kepada Zat yang menciptakan langit dan bumi dengan lurus dan berserah diri, dan aku bukan termasuk orang-orang musyrik."},
    {a:"إِنَّ صَلَاتِي وَنُسُكِي وَمَحْيَايَ وَمَمَاتِي لِلَّهِ رَبِّ الْعَالَمِينَ لَا شَرِيكَ لَهُ وَبِذَٰلِكَ أُمِرْتُ وَأَنَا مِنَ الْمُسْلِمِينَ",
     l:"Inna shalaatii wa nusukii wa mahyaaya wa mamaatii lillaahi rabbil 'aalamiin. Laa syariika lahu wa bidzaalika umirtu wa anaa minal muslimiin.",
     t:"Sesungguhnya sholatku, ibadahku, hidupku, dan matiku hanyalah untuk Allah, Tuhan semesta alam. Tidak ada sekutu bagi-Nya. Demikianlah yang diperintahkan kepadaku, dan aku termasuk orang-orang muslim."}
  ],
  taawudz:{a:"أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ", l:"A'uudzu billaahi minasy syaithaanir rajiim.", t:"Aku berlindung kepada Allah dari setan yang terkutuk."},
  fatihah:[
    {a:"بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", l:"Bismillaahir rahmaanir rahiim.", t:"Dengan nama Allah Yang Maha Pengasih, Maha Penyayang."},
    {a:"الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", l:"Alhamdu lillaahi rabbil 'aalamiin.", t:"Segala puji bagi Allah, Tuhan semesta alam."},
    {a:"الرَّحْمَٰنِ الرَّحِيمِ", l:"Ar-rahmaanir rahiim.", t:"Maha Pengasih, Maha Penyayang."},
    {a:"مَالِكِ يَوْمِ الدِّينِ", l:"Maaliki yaumid diin.", t:"Pemilik hari pembalasan."},
    {a:"إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", l:"Iyyaaka na'budu wa iyyaaka nasta'iin.", t:"Hanya kepada-Mu kami menyembah dan hanya kepada-Mu kami memohon pertolongan."},
    {a:"اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ", l:"Ihdinash shiraathal mustaqiim.", t:"Tunjukilah kami jalan yang lurus,"},
    {a:"صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ", l:"Shiraathal ladziina an'amta 'alaihim ghairil maghdhuubi 'alaihim wa ladh dhaalliin.", t:"yaitu jalan orang-orang yang Engkau beri nikmat, bukan jalan mereka yang dimurkai dan bukan pula jalan mereka yang sesat."},
    {a:"آمِينَ", l:"Aamiin.", t:"Ya Allah, kabulkanlah."}
  ],
  ikhlas:[
    {a:"قُلْ هُوَ اللَّهُ أَحَدٌ", l:"Qul huwallaahu ahad.", t:"Katakanlah (Muhammad), \"Dialah Allah, Yang Maha Esa."},
    {a:"اللَّهُ الصَّمَدُ", l:"Allaahush shamad.", t:"Allah tempat meminta segala sesuatu."},
    {a:"لَمْ يَلِدْ وَلَمْ يُولَدْ", l:"Lam yalid wa lam yuulad.", t:"(Allah) tidak beranak dan tidak pula diperanakkan."},
    {a:"وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ", l:"Wa lam yakul lahuu kufuwan ahad.", t:"Dan tidak ada sesuatu yang setara dengan Dia.\""}
  ],
  rukuk:{a:"سُبْحَانَ رَبِّيَ الْعَظِيمِ وَبِحَمْدِهِ", l:"Subhaana rabbiyal 'azhiimi wa bihamdih.", t:"Maha Suci Tuhanku Yang Maha Agung, dan dengan memuji-Nya."},
  itidal:[
    {a:"سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ", l:"Sami'allaahu liman hamidah.", t:"Allah mendengar orang yang memuji-Nya."},
    {a:"رَبَّنَا لَكَ الْحَمْدُ مِلْءَ السَّمَاوَاتِ وَمِلْءَ الْأَرْضِ وَمِلْءَ مَا شِئْتَ مِنْ شَيْءٍ بَعْدُ", l:"Rabbanaa lakal hamdu mil'as samaawaati wa mil'al ardhi wa mil'a maa syi'ta min syai'in ba'du.", t:"Wahai Tuhan kami, bagi-Mu segala puji, sepenuh langit, sepenuh bumi, dan sepenuh apa saja yang Engkau kehendaki sesudahnya."}
  ],
  sujud:{a:"سُبْحَانَ رَبِّيَ الْأَعْلَى وَبِحَمْدِهِ", l:"Subhaana rabbiyal a'laa wa bihamdih.", t:"Maha Suci Tuhanku Yang Maha Tinggi, dan dengan memuji-Nya."},
  duduk:{a:"رَبِّ اغْفِرْ لِي وَارْحَمْنِي وَاجْبُرْنِي وَارْفَعْنِي وَارْزُقْنِي وَاهْدِنِي وَعَافِنِي وَاعْفُ عَنِّي", l:"Rabbighfir lii warhamnii wajburnii warfa'nii warzuqnii wahdinii wa 'aafinii wa'fu 'annii.", t:"Ya Tuhanku, ampunilah aku, rahmatilah aku, cukupkanlah kekuranganku, angkatlah derajatku, berilah aku rezeki, tunjukilah aku, sehatkanlah aku, dan maafkanlah aku."},
  tahiyat:{a:"التَّحِيَّاتُ الْمُبَارَكَاتُ الصَّلَوَاتُ الطَّيِّبَاتُ لِلَّهِ. السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ. السَّلَامُ عَلَيْنَا وَعَلَىٰ عِبَادِ اللَّهِ الصَّالِحِينَ. أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللَّهِ",
    l:"At-tahiyyaatul mubaarakaatush shalawaatuth thayyibaatu lillaah. Assalaamu 'alaika ayyuhan nabiyyu wa rahmatullaahi wa barakaatuh. Assalaamu 'alainaa wa 'alaa 'ibaadillaahish shaalihiin. Asyhadu allaa ilaaha illallaah wa asyhadu anna Muhammadan rasuulullaah.",
    t:"Segala penghormatan yang berkah, sholawat, dan kebaikan hanya milik Allah. Semoga keselamatan tercurah kepadamu, wahai Nabi, juga rahmat Allah dan berkah-Nya. Semoga keselamatan tercurah kepada kami dan hamba-hamba Allah yang saleh. Aku bersaksi bahwa tiada tuhan selain Allah, dan aku bersaksi bahwa Muhammad adalah utusan Allah."},
  shalawat:{a:"اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ وَبَارِكْ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ فِي الْعَالَمِينَ إِنَّكَ حَمِيدٌ مَجِيدٌ",
    l:"Allaahumma shalli 'alaa Muhammad wa 'alaa aali Muhammad, kamaa shallaita 'alaa Ibraahiim wa 'alaa aali Ibraahiim, wa baarik 'alaa Muhammad wa 'alaa aali Muhammad, kamaa baarakta 'alaa Ibraahiim wa 'alaa aali Ibraahiim, fil 'aalamiina innaka hamiidum majiid.",
    t:"Ya Allah, limpahkanlah rahmat kepada Muhammad dan keluarga Muhammad, sebagaimana Engkau melimpahkan rahmat kepada Ibrahim dan keluarga Ibrahim. Berkahilah Muhammad dan keluarga Muhammad, sebagaimana Engkau memberkahi Ibrahim dan keluarga Ibrahim, di seluruh alam. Sesungguhnya Engkau Maha Terpuji lagi Maha Mulia."},
  doa:{a:"اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ جَهَنَّمَ وَمِنْ عَذَابِ الْقَبْرِ وَمِنْ فِتْنَةِ الْمَحْيَا وَالْمَمَاتِ وَمِنْ شَرِّ فِتْنَةِ الْمَسِيحِ الدَّجَّالِ",
    l:"Allaahumma innii a'uudzu bika min 'adzaabi jahannam, wa min 'adzaabil qabri, wa min fitnatil mahyaa wal mamaat, wa min syarri fitnatil masiihid dajjaal.",
    t:"Ya Allah, aku berlindung kepada-Mu dari azab Jahanam, dari azab kubur, dari fitnah kehidupan dan kematian, dan dari kejahatan fitnah Al-Masih Dajjal."},
  salam:{a:"السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ", l:"Assalaamu 'alaikum wa rahmatullaah.", t:"Semoga keselamatan dan rahmat Allah tercurah kepada kalian."}
};

/* ---------- Penyusun langkah ---------- */
function buildSteps(key, role){
  var s = SHOLAT[key], n = s.n, steps = [], r, prev;
  function add(o){ steps.push(o); }
  for (r = 1; r <= n; r++){
    prev = steps.length ? steps[steps.length-1] : null;
    var bangkit = null;
    if (prev && prev.id === "sujud2") bangkit = "Bangkit dari sujud sambil mengucapkan takbir (Allaahu akbar), lalu berdiri tegak.";
    if (prev && prev.id === "tahiyatAwal") bangkit = "Bangkit dari tahiyat awal sambil mengucapkan takbir (Allaahu akbar), lalu berdiri tegak.";

    if (r === 1){
      var niatNotes = [
        "Niat dilakukan di dalam hati, bersamaan dengan takbiratul ihram. Melafalkan niat dianjurkan dalam mazhab Syafi'i; sebagian ulama tidak melafalkannya.",
        "Angkat kedua tangan sejajar bahu atau telinga saat takbir, lalu letakkan tangan kanan di atas tangan kiri (bersedekap)."
      ];
      if (ROLE_NOTE[role]) niatNotes.push(ROLE_NOTE[role]);
      add({id:"niat", r:r, title:"Niat dan takbiratul ihram", pose:"takbir", tag:"rukun", verses:[niatVerse(s, role), V.takbir], notes:niatNotes});
      add({id:"iftitah", r:r, title:"Doa iftitah", pose:"qiyam", tag:"sunnah", verses:V.iftitah,
        notes:["Dibaca hanya pada rakaat pertama. Ada beberapa versi doa iftitah yang sah; ini versi yang umum diajarkan di Indonesia."]});
      add({id:"taawudz", r:r, title:"Ta'awudz", pose:"qiyam", tag:"sunnah", verses:[V.taawudz],
        notes:["Disunnahkan dibaca sebelum Al-Fatihah."]});
    }
    var fNotes = [];
    if (bangkit) fNotes.push(bangkit);
    fNotes.push("Al-Fatihah wajib dibaca pada setiap rakaat. Dalam mazhab Syafi'i, basmalah termasuk ayat pertama dan ikut dibaca. Ucapkan \"Aamiin\" setelah selesai.");
    if (r === 1){
      fNotes.push(JAHR[key]
        ? "Saat berjamaah, imam mengeraskan bacaan pada rakaat pertama dan kedua sholat " + s.nama + "."
        : "Sholat " + s.nama + " dibaca pelan (tidak dikeraskan).");
    }
    add({id:"fatihah"+r, r:r, title:"Membaca Al-Fatihah", pose:"qiyam", tag:"rukun", verses:V.fatihah, notes:fNotes});

    if (r <= 2){
      add({id:"surat"+r, r:r, title:"Membaca surat pendek", pose:"qiyam", tag:"sunnah", verses:V.ikhlas,
        notes:["Contoh: Surat Al-Ikhlas. Boleh surat atau ayat lain yang kamu hafal. Hanya dibaca pada rakaat pertama dan kedua."]});
    }
    add({id:"rukuk"+r, r:r, title:"Rukuk", pose:"rukuk", tag:"rukun", rep:"3 kali", verses:[V.rukuk],
      notes:[
        "Turun sambil mengucapkan takbir. Punggung rata, kedua telapak tangan memegang lutut, lalu diam sejenak (tuma'ninah).",
        "Yang rukun adalah gerakannya. Bacaan tasbih hukumnya sunnah."
      ]});
    var iNotes = ["Bangkit dari rukuk sambil membaca \"Sami'allaahu liman hamidah\", lalu berdiri tegak dan tenang (tuma'ninah), kemudian membaca bacaan kedua."];
    if (key === "subuh" && r === 2) iNotes.push("Pada rakaat kedua sholat Subuh, mazhab Syafi'i menyunnahkan doa qunut setelah i'tidal. Teks qunut tidak dimuat di sini; ikuti tuntunan gurumu.");
    add({id:"itidal"+r, r:r, title:"I'tidal", pose:"itidal", tag:"rukun", verses:V.itidal, notes:iNotes});
    add({id:"sujud1", r:r, title:"Sujud pertama", pose:"sujud", tag:"rukun", rep:"3 kali", verses:[V.sujud],
      notes:[
        "Turun sambil mengucapkan takbir. Tujuh anggota sujud menempel di lantai: dahi (bersama hidung), kedua telapak tangan, kedua lutut, dan ujung jari kedua kaki.",
        "Diam sejenak (tuma'ninah). Bacaan tasbih hukumnya sunnah."
      ]});
    add({id:"duduk", r:r, title:"Duduk di antara dua sujud", pose:"duduk", tag:"rukun", verses:[V.duduk],
      notes:["Bangkit dari sujud sambil takbir, duduk dengan tenang (tuma'ninah). Yang rukun adalah duduk tenang; bacaannya sunnah."]});
    add({id:"sujud2", r:r, title:"Sujud kedua", pose:"sujud", tag:"rukun", rep:"3 kali", verses:[V.sujud],
      notes:["Turun sambil takbir, lalu sujud seperti sujud pertama."]});

    if (r === n){
      add({id:"tahiyatAkhir", r:r, title:"Tahiyat akhir", pose:"tahiyat", tag:"rukun", verses:[V.tahiyat, V.shalawat, V.doa],
        notes:[
          "Bangkit dari sujud sambil takbir, lalu duduk. Menurut mazhab Syafi'i, duduk tahiyat akhir dengan tawarruk (pantat menyentuh lantai, kaki kiri dikeluarkan ke sisi kanan).",
          "Duduk tahiyat akhir, bacaan tahiyat, dan shalawat kepada Nabi adalah rukun. Doa perlindungan setelahnya sunnah.",
          "Gerakan jari saat tahiyat berbeda antar mazhab; ikuti tuntunan gurumu."
        ]});
      add({id:"salam", r:r, title:"Salam", pose:"salam", tag:"rukun", verses:[V.salam],
        notes:[
          "Menoleh ke kanan sambil mengucapkan salam. Salam pertama adalah rukun.",
          "Lalu menoleh ke kiri dan mengucapkan salam yang sama. Salam kedua sunnah menurut mazhab Syafi'i."
        ]});
    } else if (r === 2){
      add({id:"tahiyatAwal", r:r, title:"Tahiyat awal", pose:"tahiyat", tag:"sunnah", verses:[V.tahiyat],
        notes:[
          "Bangkit dari sujud sambil takbir, lalu duduk. Menurut mazhab Syafi'i, duduk iftirasy (duduk di atas telapak kaki kiri, telapak kaki kanan ditegakkan).",
          "Penambahan shalawat pada tahiyat awal berbeda antar mazhab; ikuti tuntunan gurumu."
        ]});
    }
  }
  var total = steps.length;
  steps.forEach(function(st, i){ st.i = i; st.total = total; });
  return steps;
}

/* ---------- Ekspor sederhana untuk Node.js (dipakai oleh test) ---------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { P: P, SHOLAT: SHOLAT, ORDER: ORDER, ROLES: ROLES, ROLE_ORDER: ROLE_ORDER, V: V, buildSteps: buildSteps, figureSVG: figureSVG, niatVerse: niatVerse };
}
