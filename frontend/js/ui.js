function skeletonCards(n = 3) {
  return Array.from({ length: n })
    .map(
      () => `
      <div class="card">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-line-short"></div>
        <div class="skeleton" style="width:80%"></div>
      </div>`
    )
    .join("");
}

function skeletonLines(n = 3) {
  return Array.from({ length: n }).map(() => '<div class="skeleton"></div>').join("");
}

function toast(message, type = "success", duration = 3200) {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.id = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Автоподсказки адреса через Яндекс Suggest API (YANDEX_SUGGEST_API_KEY из js/config.js).
// onSelect(fullText, rawItem) вызывается при выборе варианта из списка.
function initAddressSuggest(inputEl, onSelect) {
  if (!inputEl) return;
  const field = inputEl.parentElement;
  field.style.position = "relative";
  const panel = document.createElement("div");
  panel.className = "suggest-panel";
  field.appendChild(panel);

  function closePanel() {
    panel.classList.remove("show");
  }

  const fetchSuggestions = debounce(async (query) => {
    if (!query || query.length < 3) {
      closePanel();
      return;
    }
    try {
      const url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${YANDEX_SUGGEST_API_KEY}&text=${encodeURIComponent(query)}&lang=ru_RU&results=5`;
      const res = await fetch(url);
      const data = await res.json();
      const items = data.results || [];
      if (!items.length) {
        closePanel();
        return;
      }
      panel.innerHTML = items
        .map((item, i) => {
          const title = item.title && item.title.text ? escapeHtml(item.title.text) : "";
          const subtitle = item.subtitle && item.subtitle.text ? ` <span class="muted">${escapeHtml(item.subtitle.text)}</span>` : "";
          return `<div class="suggest-item" data-i="${i}">${title}${subtitle}</div>`;
        })
        .join("");
      panel.classList.add("show");
      panel.querySelectorAll(".suggest-item").forEach((el, i) => {
        el.addEventListener("click", () => {
          const item = items[i];
          const fullText = [item.title && item.title.text, item.subtitle && item.subtitle.text].filter(Boolean).join(", ");
          inputEl.value = fullText;
          closePanel();
          if (onSelect) onSelect(fullText, item);
        });
      });
    } catch (e) {
      closePanel();
    }
  }, 300);

  inputEl.addEventListener("input", () => fetchSuggestions(inputEl.value.trim()));
  document.addEventListener("click", (e) => {
    if (e.target !== inputEl && !panel.contains(e.target)) closePanel();
  });
}

// Модалка ввода кода подтверждения email — общая для register.html (после регистрации)
// и login.html (когда вход отклонён из-за неподтверждённого email). Создаётся один раз
// и переиспользуется, чтобы не дублировать разметку/логику на двух страницах.
// onVerified(tokens) вызывается после успешного POST /auth/verify-email.
function showEmailCodeModal(email, onVerified) {
  let modal = document.getElementById("email-code-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "email-code-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal">
        <h2>Подтверждение почты</h2>
        <p class="muted" style="font-size:13.5px">Мы отправили код подтверждения на <strong id="email-code-modal-email"></strong>.</p>
        <div id="email-code-alert"></div>
        <form id="email-code-form">
          <div class="field">
            <label for="email-code-input">Код из письма</label>
            <input class="input" type="text" id="email-code-input" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus />
          </div>
          <p class="muted" style="font-size:12.5px;margin:0 0 4px">
            Не пришёл код? <a href="#" id="email-code-resend">Отправить ещё раз</a>
          </p>
          <div class="dialog-actions">
            <button class="btn btn-secondary" type="button" id="email-code-cancel">Отмена</button>
            <button class="btn btn-primary" type="submit">Подтвердить</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById("email-code-modal-email").textContent = email;
  document.getElementById("email-code-alert").innerHTML = "";
  document.getElementById("email-code-input").value = "";
  modal.hidden = false;

  // клонируем интерактивные элементы, чтобы не копить обработчики предыдущих открытий
  const form = document.getElementById("email-code-form");
  const freshForm = form.cloneNode(true);
  form.replaceWith(freshForm);

  document.getElementById("email-code-cancel").addEventListener("click", () => {
    modal.hidden = true;
  });
  document.getElementById("email-code-resend").addEventListener("click", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("email-code-alert");
    try {
      await api.post("/auth/resend-code", { email });
      toast("Код отправлен повторно", "success");
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
  freshForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("email-code-alert");
    alertEl.innerHTML = "";
    const code = document.getElementById("email-code-input").value.trim();
    try {
      const tokens = await api.post("/auth/verify-email", { email, code });
      modal.hidden = true;
      onVerified(tokens);
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}

// Модалка восстановления пароля (login.html, ссылка «Забыли пароль?»): шаг 1 — вводим
// логин/почту и просим код, шаг 2 — вводим код из письма и новый пароль.
// onReset(tokens) вызывается после успешного POST /auth/reset-password.
function showForgotPasswordModal(onReset) {
  let modal = document.getElementById("forgot-password-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "forgot-password-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal">
        <h2>Восстановление пароля</h2>
        <div id="fp-step-login">
          <p class="muted" style="font-size:13.5px">Введите логин или почту — если аккаунт существует, на привязанную почту придёт код для сброса пароля.</p>
          <div id="fp-login-alert"></div>
          <form id="fp-login-form">
            <div class="field"><label for="fp-login">Логин или почта</label><input class="input" type="text" id="fp-login" required autofocus /></div>
            <div class="dialog-actions">
              <button class="btn btn-secondary" type="button" id="fp-cancel-1">Отмена</button>
              <button class="btn btn-primary" type="submit">Отправить код</button>
            </div>
          </form>
        </div>
        <div id="fp-step-reset" hidden>
          <p class="muted" style="font-size:13.5px">Если аккаунт <strong id="fp-login-echo"></strong> существует, код уже отправлен на привязанную почту.</p>
          <div id="fp-reset-alert"></div>
          <form id="fp-reset-form">
            <div class="field"><label for="fp-code">Код из письма</label><input class="input" type="text" id="fp-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required /></div>
            <div class="field"><label for="fp-new-password">Новый пароль</label><input class="input" type="password" id="fp-new-password" autocomplete="new-password" minlength="6" required /></div>
            <p class="muted" style="font-size:12.5px;margin:0 0 4px">Не пришёл код? <a href="#" id="fp-resend">Отправить ещё раз</a></p>
            <div class="dialog-actions">
              <button class="btn btn-secondary" type="button" id="fp-cancel-2">Отмена</button>
              <button class="btn btn-primary" type="submit">Сбросить пароль</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  let currentLogin = "";
  const stepLogin = document.getElementById("fp-step-login");
  const stepReset = document.getElementById("fp-step-reset");

  function close() {
    modal.hidden = true;
  }
  function showStepLogin() {
    stepLogin.hidden = false;
    stepReset.hidden = true;
    document.getElementById("fp-login-alert").innerHTML = "";
    document.getElementById("fp-login").value = "";
  }
  async function requestCode(login) {
    currentLogin = login;
    await api.post("/auth/forgot-password", { login });
    document.getElementById("fp-login-echo").textContent = login;
    document.getElementById("fp-reset-alert").innerHTML = "";
    document.getElementById("fp-code").value = "";
    document.getElementById("fp-new-password").value = "";
    stepLogin.hidden = true;
    stepReset.hidden = false;
  }

  showStepLogin();
  modal.hidden = false;

  // клонируем формы, чтобы не копить обработчики предыдущих открытий
  const loginForm = document.getElementById("fp-login-form");
  const freshLoginForm = loginForm.cloneNode(true);
  loginForm.replaceWith(freshLoginForm);
  const resetForm = document.getElementById("fp-reset-form");
  const freshResetForm = resetForm.cloneNode(true);
  resetForm.replaceWith(freshResetForm);

  document.getElementById("fp-cancel-1").addEventListener("click", close);
  document.getElementById("fp-cancel-2").addEventListener("click", close);

  freshLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("fp-login-alert");
    const login = document.getElementById("fp-login").value.trim();
    try {
      await requestCode(login);
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById("fp-resend").addEventListener("click", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("fp-reset-alert");
    try {
      await api.post("/auth/forgot-password", { login: currentLogin });
      toast("Код отправлен повторно", "success");
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  freshResetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("fp-reset-alert");
    alertEl.innerHTML = "";
    const code = document.getElementById("fp-code").value.trim();
    const new_password = document.getElementById("fp-new-password").value;
    try {
      const tokens = await api.post("/auth/reset-password", { login: currentLogin, code, new_password });
      close();
      onReset(tokens);
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}

function initDropdown(triggerEl, panelEl) {
  if (!triggerEl || !panelEl) return;

  function close() {
    panelEl.classList.remove("show");
    triggerEl.setAttribute("aria-expanded", "false");
  }
  function open() {
    panelEl.classList.add("show");
    triggerEl.setAttribute("aria-expanded", "true");
  }
  function toggle(e) {
    e.stopPropagation();
    if (panelEl.classList.contains("show")) close();
    else open();
  }

  triggerEl.addEventListener("click", toggle);
  document.addEventListener("click", (e) => {
    if (!panelEl.contains(e.target) && e.target !== triggerEl) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return { open, close };
}
