(function(){
"use strict";
var form=document.getElementById("feedbackForm");
var status=document.getElementById("feedbackStatus");
var submit=document.getElementById("feedbackSubmit");
if(!form||!status||!submit)return;
form.addEventListener("submit",async function(event){
  event.preventDefault();
  status.textContent="Mengirim masukan…";
  status.dataset.kind="";
  submit.disabled=true;
  var data={
    category:form.elements.category.value,
    message:form.elements.message.value.trim(),
    sourcePage:(new URLSearchParams(window.location.search).get("from")==="login")?"login":"home",
    website:form.elements.website.value
  };
  try{
    var response=await fetch("/api/feedback",{
      method:"POST",
      credentials:"same-origin",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(data)
    });
    var result=await response.json().catch(function(){return {};});
    if(!response.ok)throw new Error(result.error||"Masukan gagal dikirim.");
    status.dataset.kind="success";
    status.textContent=result.message||"Terima kasih. Masukan berhasil dikirim.";
    form.reset();
  }catch(error){
    status.dataset.kind="error";
    status.textContent=error.message||"Terjadi kesalahan. Coba lagi.";
  }finally{
    submit.disabled=false;
  }
});
})();