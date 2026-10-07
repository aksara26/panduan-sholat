/* Pembungkus fetch untuk API server. Cookie sesi dikirim otomatis (httpOnly). */
var API = (function(){
"use strict";
function call(method, path, body){
  var opt = { method: method, headers: {}, credentials: "same-origin" };
  if (method !== "GET"){
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body || {});
  }
  return fetch(path, opt).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(data){
      if (!r.ok){
        var e = new Error(data.error || "Terjadi kesalahan (" + r.status + ").");
        e.status = r.status;
        throw e;
      }
      return data;
    });
  });
}
return {
  get:  function(p){ return call("GET", p); },
  post: function(p, b){ return call("POST", p, b); },
  put:  function(p, b){ return call("PUT", p, b); },
  patch:function(p, b){ return call("PATCH", p, b); },
  del:  function(p){ return call("DELETE", p); }
};
})();
