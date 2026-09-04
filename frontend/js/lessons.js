async function initLessonsPage() {
  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get("id");
  if (lessonId) {
    renderLessonDetail(lessonId);
  } else {
    renderLessonList();
  }
}

async function renderLessonList() {
  const root = document.getElementById("lessons-root");
  root.innerHTML = `<h1>Обучающие модули</h1><p class="lead">Короткие уроки о том, как устроен экомониторинг побережья.</p><div class="grid" id="lesson-grid">Загрузка…</div>`;

  try {
    const lessons = await api.get("/lessons");
    const grid = document.getElementById("lesson-grid");
    grid.innerHTML = lessons
      .map(
        (l) => `
        <div class="card">
          <h2 style="margin-top:0">${escapeHtml(l.title)}</h2>
          <p class="muted">${escapeHtml(l.summary)}</p>
          <p class="badge">+${l.points_reward} баллов</p>
          <div><a class="btn" href="lessons.html?id=${l.id}">Открыть урок</a></div>
        </div>`
      )
      .join("");
  } catch (e) {
    document.getElementById("lesson-grid").innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

async function renderLessonDetail(lessonId) {
  const root = document.getElementById("lessons-root");
  root.innerHTML = "Загрузка…";

  let lesson;
  try {
    lesson = await api.get(`/lessons/${lessonId}`);
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
    return;
  }

  const cardsHtml = lesson.cards
    .map((c) => {
      if (c.content_type === "quiz") {
        const options = (c.quiz_options || [])
          .map(
            (opt, i) => `
            <label>
              <input type="radio" name="quiz-${c.id}" value="${i}" /> ${escapeHtml(opt)}
            </label>`
          )
          .join("");
        return `
          <div class="card lesson-card-quiz">
            <h2 style="margin-top:0">${escapeHtml(c.title)}</h2>
            <p>${escapeHtml(c.quiz_question || "")}</p>
            ${options}
          </div>`;
      }
      return `
        <div class="card">
          <h2 style="margin-top:0">${escapeHtml(c.title)}</h2>
          <p>${escapeHtml(c.body)}</p>
        </div>`;
    })
    .join("");

  root.innerHTML = `
    <a href="lessons.html" class="muted">← Все уроки</a>
    <h1>${escapeHtml(lesson.title)}</h1>
    <p class="lead">${escapeHtml(lesson.summary)}</p>
    ${cardsHtml}
    <div id="lesson-result"></div>
    <button class="btn" id="complete-btn">Завершить урок (+${lesson.points_reward} баллов)</button>
  `;

  document.getElementById("complete-btn").addEventListener("click", async () => {
    if (!isLoggedIn()) {
      window.location.href = "login.html";
      return;
    }
    const answers = lesson.cards
      .filter((c) => c.content_type === "quiz")
      .map((c) => {
        const checked = document.querySelector(`input[name="quiz-${c.id}"]:checked`);
        return checked ? { card_id: c.id, selected_index: parseInt(checked.value, 10) } : null;
      })
      .filter(Boolean);

    const resultEl = document.getElementById("lesson-result");
    try {
      const result = await api.post(`/lessons/${lessonId}/complete`, { answers });
      let msg;
      if (result.already_completed) {
        msg = "Этот урок уже был засчитан ранее.";
      } else {
        msg = `Урок засчитан! Правильных ответов: ${result.score}/${result.max_score}. Начислено баллов: ${result.points_awarded}.`;
        if (result.new_achievements.length) {
          msg += ` Новые ачивки: ${result.new_achievements.join(", ")}!`;
        }
      }
      resultEl.innerHTML = `<div class="alert success">${escapeHtml(msg)}</div>`;
      cachedUser = null;
      renderNav("lessons.html");
    } catch (e) {
      resultEl.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
    }
  });
}
