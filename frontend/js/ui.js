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
