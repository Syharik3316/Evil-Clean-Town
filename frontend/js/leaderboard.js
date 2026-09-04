let currentScope = "users";

function initLeaderboardPage() {
  document.querySelectorAll("[data-scope]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentScope = btn.dataset.scope;
      document.querySelectorAll("[data-scope]").forEach((b) => b.classList.toggle("secondary", b !== btn));
      loadBoard();
    });
  });
  document.getElementById("region-filter").addEventListener("input", debounce(loadBoard, 400));
  loadBoard();
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function loadBoard() {
  const el = document.getElementById("leaderboard-root");
  el.innerHTML = "Загрузка…";
  const region = document.getElementById("region-filter").value.trim();
  const params = new URLSearchParams({ scope: currentScope, limit: "50" });
  if (region) params.set("region", region);

  try {
    const rows = await api.get(`/leaderboard?${params.toString()}`);
    if (!rows.length) {
      el.innerHTML = '<p class="muted">Пока пусто.</p>';
      return;
    }
    el.innerHTML = `<table><tbody>${rows
      .map(
        (r, i) =>
          `<tr><td>#${i + 1}</td><td>${escapeHtml(r.name)}${r.city ? " · " + escapeHtml(r.city) : ""}${r.region ? " · " + escapeHtml(r.region) : ""}</td><td>${Math.round(r.points_total)} б.</td></tr>`
      )
      .join("")}</tbody></table>`;
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}
