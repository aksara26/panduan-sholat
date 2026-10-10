/* Google Identity Services: tombol Google untuk halaman login dan dialog. */
(function () {
  "use strict";
  var CLIENT_ID = "72944218543-ue1dsjpufsh347menn7mq9ed8okr3q8j.apps.googleusercontent.com";
  var loading;

  function load() {
    if (window.google && google.accounts && google.accounts.id) {
      return Promise.resolve();
    }
    if (!loading) {
      loading = new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = function () {
          loading = null;
          reject(new Error("Layanan Google Login tidak dapat dimuat."));
        };
        document.head.appendChild(script);
      });
    }
    return loading;
  }

  function render(container, onCredential, onError) {
    if (!container) return;
    container.textContent = "Memuat tombol Google…";
    load().then(function () {
      container.textContent = "";
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: function (response) {
          if (!response || !response.credential) {
            onError(new Error("Google tidak mengirim kredensial yang valid."));
            return;
          }
          onCredential(response.credential);
        },
        auto_select: false
      });
      google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 280,
        logo_alignment: "left"
      });
    }).catch(onError);
  }

  window.GoogleAuth = { render: render };
})();
