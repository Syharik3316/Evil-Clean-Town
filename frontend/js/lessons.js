async function initLessonsPage() {
  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get("id");
  if (lessonId) {
    renderLessonDetail(lessonId);
  } else {
    renderLessonList();
  }
}

const LESSON_STATUS_LABELS = {
  draft: "Черновик", pending_review: "На модерации", published: "Опубликован", rejected: "Отклонён",
};

async function renderLessonList() {
  const root = document.getElementById("lessons-root");
  const user = isLoggedIn() ? await currentUser() : null;
  const canAuthor = user && (user.role === "organizer" || user.role === "admin");

  root.innerHTML = `
    <h1>Обучающие модули</h1>
    <p class="lead">Короткие уроки о том, как устроен экомониторинг побережья, и базовый курс для участия в уборках.</p>
    <div class="grid" id="lesson-grid">Загрузка…</div>
    ${canAuthor ? '<h2>Создать курс</h2><div class="card" id="create-course-card"></div><h2>Мои курсы</h2><div id="my-courses">Загрузка…</div>' : ""}
  `;

  try {
    const lessons = await api.get("/lessons");
    const grid = document.getElementById("lesson-grid");
    grid.innerHTML = lessons.length
      ? lessons
          .map(
            (l) => `
        <div class="card">
          <h2 style="margin-top:0">${escapeHtml(l.title)}${l.is_base_course ? ' <span class="badge">Базовый курс</span>' : ""}</h2>
          <p class="muted">${escapeHtml(l.summary)}</p>
          <p class="badge">+${l.points_reward} баллов</p>
          <div><a class="btn" href="lessons.html?id=${l.id}">Открыть урок</a></div>
        </div>`
          )
          .join("")
      : '<p class="muted">Пока нет опубликованных курсов.</p>';
  } catch (e) {
    document.getElementById("lesson-grid").innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }

  if (canAuthor) {
    renderCreateCourseForm();
    loadMyCourses();
  }
}

function renderCreateCourseForm() {
  const card = document.getElementById("create-course-card");
  card.innerHTML = `
    <div id="create-course-alert"></div>
    <form id="create-course-form">
      <div class="field"><label for="cc-title">Название</label><input type="text" id="cc-title" required /></div>
      <div class="field"><label for="cc-slug">Slug (латиницей, уникальный)</label><input type="text" id="cc-slug" required /></div>
      <div class="field"><label for="cc-summary">Краткое описание</label><textarea id="cc-summary" rows="2" required></textarea></div>
      <div class="field"><label for="cc-points">Баллы за прохождение</label><input type="number" id="cc-points" value="10" min="0" /></div>
      <button class="btn" type="submit">Создать (черновик)</button>
    </form>`;

  document.getElementById("create-course-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("create-course-alert");
    try {
      const lesson = await api.post("/lessons", {
        title: document.getElementById("cc-title").value.trim(),
        slug: document.getElementById("cc-slug").value.trim(),
        summary: document.getElementById("cc-summary").value.trim(),
        points_reward: parseInt(document.getElementById("cc-points").value, 10) || 0,
      });
      window.location.href = `lessons.html?id=${lesson.id}`;
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}

async function loadMyCourses() {
  const el = document.getElementById("my-courses");
  try {
    const courses = await api.get("/lessons?mine_only=true");
    el.innerHTML = courses.length
      ? `<table><tbody>${courses
          .map(
            (c) =>
              `<tr><td><a href="lessons.html?id=${c.id}">${escapeHtml(c.title)}</a></td><td>${LESSON_STATUS_LABELS[c.status] || c.status}</td></tr>`
          )
          .join("")}</tbody></table>`
      : '<p class="muted">Вы ещё не создавали курсы.</p>';
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
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

  const user = isLoggedIn() ? await currentUser() : null;
  const isOwner = user && (user.role === "admin" || user.id === lesson.created_by_id);

  root.innerHTML = `
    <a href="lessons.html" class="muted">← Все уроки</a>
    <h1>${escapeHtml(lesson.title)} ${isOwner ? `<span class="badge">${LESSON_STATUS_LABELS[lesson.status] || lesson.status}</span>` : ""}</h1>
    <p class="lead">${escapeHtml(lesson.summary)}</p>
    ${cardsHtml}
    <div id="lesson-result"></div>
    ${lesson.status === "published" ? `<button class="btn" id="complete-btn">Завершить урок (+${lesson.points_reward} баллов)</button>` : ""}
    ${isOwner ? '<div id="author-tools"></div>' : ""}
  `;

  if (isOwner) {
    renderAuthorTools(lesson);
  }

  document.getElementById("complete-btn")?.addEventListener("click", async () => {
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

function renderAuthorTools(lesson) {
  const el = document.getElementById("author-tools");
  const canSubmit = lesson.status === "draft" || lesson.status === "rejected";

  el.innerHTML = `
    <h2>Инструменты автора</h2>
    <div class="card">
      <div id="author-alert"></div>
      <h3 style="margin-top:0">Добавить карточку</h3>
      <form id="add-card-form">
        <div class="field"><label for="card-title">Заголовок</label><input type="text" id="card-title" required /></div>
        <div class="field"><label for="card-body">Текст</label><textarea id="card-body" rows="3"></textarea></div>
        <div class="field">
          <label><input type="checkbox" id="card-is-quiz" /> Это тест (квиз)</label>
        </div>
        <div id="quiz-fields" hidden>
          <div class="field"><label for="quiz-question">Вопрос</label><input type="text" id="quiz-question" /></div>
          <div class="field"><label for="quiz-options">Варианты ответа (через ;)</label><input type="text" id="quiz-options" placeholder="Вариант 1;Вариант 2;Вариант 3" /></div>
          <div class="field"><label for="quiz-correct">Номер правильного варианта (с 0)</label><input type="number" id="quiz-correct" min="0" value="0" /></div>
        </div>
        <button class="btn" type="submit">Добавить карточку</button>
      </form>
      ${canSubmit ? '<button class="btn secondary" id="submit-course-btn" style="margin-top:12px">Отправить на модерацию</button>' : '<p class="muted">Курс уже отправлен или опубликован — новые карточки применятся сразу.</p>'}
    </div>`;

  document.getElementById("card-is-quiz").addEventListener("change", (e) => {
    document.getElementById("quiz-fields").hidden = !e.target.checked;
  });

  document.getElementById("add-card-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("author-alert");
    const isQuiz = document.getElementById("card-is-quiz").checked;
    const payload = {
      title: document.getElementById("card-title").value.trim(),
      body: document.getElementById("card-body").value.trim(),
      content_type: isQuiz ? "quiz" : "text",
      quiz_data: isQuiz
        ? {
            question: document.getElementById("quiz-question").value.trim(),
            options: document.getElementById("quiz-options").value.split(";").map((s) => s.trim()).filter(Boolean),
            correct_index: parseInt(document.getElementById("quiz-correct").value, 10) || 0,
          }
        : null,
    };
    try {
      await api.post(`/lessons/${lesson.id}/cards`, payload);
      window.location.reload();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById("submit-course-btn")?.addEventListener("click", async () => {
    try {
      await api.post(`/lessons/${lesson.id}/submit`);
      window.location.reload();
    } catch (err) {
      document.getElementById("author-alert").innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}
