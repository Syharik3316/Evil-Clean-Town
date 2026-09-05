let currentScope = "users";

function initLeaderboardPage() {
  document.querySelectorAll("#board-scopes [data-scope]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentScope = btn.dataset.scope;
      document.querySelectorAll("#board-scopes [data-scope]").forEach((b) => b.classList.toggle("active", b === btn));
      loadBoard();
    });
  });
  document.getElementById("region-filter").addEventListener("input", debounce(loadBoard, 400));
  loadBoard();
}

async function loadBoard() {
  const el = document.getElementById("leaderboard-root");
  el.innerHTML = skeletonLines(6);

  const region = document.getElementById("region-filter").value.trim();
  const params = new URLSearchParams({ scope: currentScope, limit: "50" });
  if (region) params.set("region", region);

  try {
    const rows = await api.get(`/leaderboard?${params.toString()}`);
    if (!rows.length) {
      el.innerHTML = '<p class="muted" style="border-top:1px solid var(--color-divider);padding-top:20px">По этому фильтру пока пусто.</p>';
      return;
    }

    const max = Math.max(...rows.map((r) => r.points_total), 1);
    el.innerHTML = `
      <table class="table">
        <thead><tr><th style="width:44px">#</th><th>Участник</th><th>Город / регион</th><th style="text-align:right">Баллы</th><th style="width:110px"></th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `
            <tr>
              <td style="font-family:var(--font-heading);font-weight:600;color:var(--color-accent)">${String(i + 1).padStart(2, "0")}</td>
              <td>${escapeHtml(r.name)}</td>
              <td class="muted">${escapeHtml([r.city, r.region].filter(Boolean).join(" · ") || "—")}</td>
              <td style="text-align:right;font-family:var(--font-heading);font-weight:600;white-space:nowrap">${Math.round(r.points_total)}</td>
              <td><span style="display:block;height:8px;background:var(--color-accent);width:${Math.max(Math.round((r.points_total / max) * 100), 2)}%"></span></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}
