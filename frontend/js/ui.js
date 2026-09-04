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
