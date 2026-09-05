/* Обучающий курс: обзор программы + чтение модуля с квизом.
   Верстка — по дизайну newfront (Broadsheet). */

const LESSON_STATUS_LABELS = {
  draft: "Черновик",
  pending_review: "На модерации",
  published: "Опубликован",
  rejected: "Отклонён",
};

let lessonsAll = [];
let lessonsCompleted = [];
let lessonsUser = null;

async function initLessonsPage() {
  lessonsUser = isLoggedIn() ? await currentUser() : null;

  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get("id");

  [lessonsAll, lessonsCompleted] = await Promise.all([
    api.get("/lessons").catch(() => []),
    isLoggedIn() ? api.get("/lessons/me/completed").catch(() => []) : Promise.resolve([]),
  ]);

  if (lessonId) renderLessonDetail(parseInt(lessonId, 10));
  else renderLessonOverview();
}

/* --------------------------------------------------------------- обзор --- */

async function renderLessonOverview() {
  const root = document.getElementById("lessons-root");
  const canAuthor = lessonsUser && (lessonsUser.role === "organizer" || lessonsUser.role === "admin");
  const totalPoints = lessonsAll.reduce((sum, l) => sum + l.points_reward, 0);
  const doneCount = lessonsAll.filter((l) => lessonsCompleted.includes(l.id)).length;
  const first = lessonsAll[0];

  root.innerHTML = `
    <div class="kicker">Образовательный курс</div>
    <div class="cols" style="grid-template-columns:minmax(0,1fr) 400px;gap:56px;margin-bottom:44px">
      <div>
        <h1 style="max-width:24ch">Читаем спутник: экомониторинг побережья</h1>
        <p style="font-size:16px;line-height:1.6;color:var(--color-neutral-700);max-width:56ch;margin:0 0 26px">
          Курс о том, как спутники помогают следить за чистотой берега — и как в этом участвует каждый волонтёр.
          Каждый модуль — короткий текст, квиз и баллы в профиль.
        </p>
        <div style="display:flex;gap:28px;flex-wrap:wrap;margin-bottom:30px">
          ${overviewStat(lessonsAll.length, "модулей в курсе")}
          ${overviewStat(totalPoints, "баллов за весь курс")}
          ${overviewStat(doneCount, "пройдено вами")}
          ${overviewStat("5–6 мин", "на модуль")}
        </div>
        ${
          first
            ? `<a class="btn btn-primary btn-lg" href="/lessons?id=${first.id}">${doneCount ? "Продолжить курс" : "Начать первый урок"}</a>`
            : '<p class="muted">Опубликованных модулей пока нет.</p>'
        }
      </div>
      <figure style="margin:0">
        <div id="course-cover" class="site-thumb" style="display:grid;place-items:center;color:var(--color-neutral-600);font-size:13px">Обложка курса</div>
        <figcaption class="muted" style="font-size:11.5px;margin-top:8px">Снимок участка побережья из демо-датасета ДЗЗ</figcaption>
      </figure>
    </div>

    <div class="cols" style="grid-template-columns:minmax(0,1fr) 320px;gap:56px;border-top:1px solid var(--color-divider);padding-top:36px">
      <div>
        <h2 style="font-size:22px;margin:0 0 18px">Программа курса</h2>
        ${
          lessonsAll.length
            ? lessonsAll
                .map(
                  (l, i) => `
              <a class="lesson-row" href="/lessons?id=${l.id}" style="text-decoration:none;color:inherit">
                <div class="n">${String(i + 1).padStart(2, "0")}</div>
                <div style="flex:1">
                  <div style="font-family:var(--font-heading);font-weight:600;font-size:16.5px;margin-bottom:4px">
                    ${escapeHtml(l.title)}${l.is_base_course ? ' <span class="tag tag-accent">Базовый курс</span>' : ""}
                  </div>
                  <div class="muted" style="font-size:13.5px">${escapeHtml(l.summary)}</div>
                </div>
                <div style="flex:none;text-align:right;padding-top:4px">
                  ${
                    lessonsCompleted.includes(l.id)
                      ? '<span class="tag tag-accent"><i class="ph-duotone ph-check-circle"></i>пройден</span>'
                      : `<span class="tag tag-outline">+${l.points_reward} б.</span>`
                  }
                </div>
              </a>`
                )
                .join("")
            : '<p class="muted">Пока нет опубликованных курсов.</p>'
        }
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="background:var(--color-accent-100);padding:16px 18px">
          <div style="font-family:var(--font-heading);font-weight:600;font-size:14.5px;margin-bottom:6px">Чему вы научитесь</div>
          <p class="muted" style="font-size:12.5px;line-height:1.6;margin:0">Читать спутниковый снимок, понимать индексы NDVI и мутности воды, объяснять, почему пластик опасен, и видеть весь путь данных от снимка до уборки.</p>
        </div>
        <div style="background:var(--color-neutral-200);padding:16px 18px">
          <div style="font-family:var(--font-heading);font-weight:600;font-size:14.5px;margin-bottom:6px">Формат</div>
          <p class="muted" style="font-size:12.5px;line-height:1.6;margin:0">Самостоятельно, в своём темпе. Для школьных классов — учитель проходит курс с группой за один урок, результат виден в лидерборде школы.</p>
        </div>
        <div style="background:var(--color-neutral-200);padding:16px 18px">
          <div style="font-family:var(--font-heading);font-weight:600;font-size:14.5px;margin-bottom:6px">Зачем это для уборок</div>
          <p class="muted" style="font-size:12.5px;line-height:1.6;margin:0">Базовый курс волонтёра обязателен для записи на уборку побережья — так организатор знает, что участник понимает технику безопасности и смысл мониторинга.</p>
        </div>
      </div>
    </div>

    ${canAuthor ? '<div id="author-area" style="border-top:1px solid var(--color-divider);margin-top:48px;padding-top:36px"></div>' : ""}
  `;

  loadCourseCover();
  if (canAuthor) renderAuthorArea();
}

function overviewStat(value, label) {
  return `<div>
    <div style="font-family:var(--font-heading);font-weight:600;font-size:26px;line-height:1">${value}</div>
    <div class="muted" style="font-size:12.5px;margin-top:4px">${label}</div>
  </div>`;
}

async function loadCourseCover() {
  const el = document.getElementById("course-cover");
  if (!el) return;
  try {
    const sites = await api.get("/sites");
    if (!sites.length) return;
    const site = await api.get(`/sites/${sites[0].id}`);
    const layers = site.layers || [];
    if (!layers.length) return;
    const cover = layers[layers.length - 1];
    el.outerHTML = `<img class="site-thumb" src="${escapeHtml(cover.image_url)}" alt="Снимок участка «${escapeHtml(site.name)}»" />`;
  } catch (e) {
    /* обложка необязательна */
  }
}

/* --------------------------------------------------------------- модуль -- */

async function renderLessonDetail(lessonId) {
  const root = document.getElementById("lessons-root");
  root.innerHTML = skeletonLines(6);

  let lesson;
  try {
    lesson = await api.get(`/lessons/${lessonId}`);
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)} <a href="/lessons">Все модули →</a></div>`;
    return;
  }

  document.title = `${lesson.title} — Чистый берег`;

  const isOwner = lessonsUser && (lessonsUser.role === "admin" || lessonsUser.id === lesson.created_by_id);
  const canEarnPoints = !lessonsUser || lessonsUser.role === "volunteer";
  const done = lessonsCompleted.includes(lesson.id);
  const doneCount = lessonsAll.filter((l) => lessonsCompleted.includes(l.id)).length;
  const donePoints = lessonsAll
    .filter((l) => lessonsCompleted.includes(l.id))
    .reduce((sum, l) => sum + l.points_reward, 0);
  const index = Math.max(lessonsAll.findIndex((l) => l.id === lesson.id), 0);
  const total = lessonsAll.length || 1;

  const textCards = lesson.cards.filter((c) => c.content_type !== "quiz");
  const quizCards = lesson.cards.filter((c) => c.content_type === "quiz");

  root.innerHTML = `
    <div class="kicker">Обучающие модули</div>
    <h1>Короткие уроки об экомониторинге</h1>
    <p class="lead" style="max-width:56ch">Модули по 5–6 минут. В конце каждого — квиз; за пройденный урок начисляются баллы и ачивка.</p>

    <div class="cols cols-nav">
      <div class="lesson-side" style="position:sticky;top:96px;display:flex;flex-direction:column;gap:24px">
        <div>
          <div class="micro" style="margin-bottom:9px">Прогресс курса</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
            <span style="font-family:var(--font-heading);font-weight:600;font-size:30px">${doneCount}</span>
            <span class="muted" style="font-size:13.5px">из ${lessonsAll.length} модулей · ${donePoints} баллов</span>
          </div>
          <div class="progress-bar"><div style="width:${Math.round((doneCount / total) * 100)}%"></div></div>
        </div>
        <div style="display:flex;flex-direction:column">
          ${lessonsAll
            .map(
              (l, i) => `
            <a class="lesson-nav-btn${l.id === lesson.id ? " active" : ""}" href="/lessons?id=${l.id}" style="text-decoration:none">
              <span class="n">${String(i + 1).padStart(2, "0")}</span>
              <span class="t">${escapeHtml(l.title)}</span>
              <i class="${
                lessonsCompleted.includes(l.id)
                  ? "ph-duotone ph-check-circle"
                  : l.id === lesson.id
                    ? "ph-duotone ph-caret-right"
                    : "ph-duotone ph-circle-dashed"
              }" style="font-size:16px;color:${lessonsCompleted.includes(l.id) ? "var(--color-accent)" : "var(--color-neutral-400)"}"></i>
            </a>`
            )
            .join("")}
        </div>
        <div style="background:var(--color-accent-100);padding:14px 16px">
          <div style="font-family:var(--font-heading);font-weight:600;font-size:14px;margin-bottom:5px">Для учителя</div>
          <p class="muted" style="font-size:12.5px;line-height:1.5;margin:0">Все модули собираются в один урок на 40 минут. Класс проходит их с телефонов, результат виден в лидерборде школы.</p>
        </div>
      </div>

      <div>
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px;flex-wrap:wrap">
          <span class="tag tag-accent">Модуль ${String(index + 1).padStart(2, "0")}</span>
          <span class="tag tag-outline">+${lesson.points_reward} баллов</span>
          ${isOwner ? `<span class="tag tag-neutral">${LESSON_STATUS_LABELS[lesson.status] || lesson.status}</span>` : ""}
          <span class="muted" style="font-size:12px;margin-left:auto">${lesson.cards.length} ${plural(lesson.cards.length, "карточка", "карточки", "карточек")}</span>
        </div>
        <h2 style="font-size:clamp(26px,3vw,34px);margin:10px 0 8px">${escapeHtml(lesson.title)}</h2>
        <p class="muted" style="font-size:15px;max-width:58ch;margin:0 0 30px">${escapeHtml(lesson.summary)}</p>

        ${textCards
          .map(
            (c, i) => `
          <div class="lesson-block">
            <div class="n">${String(i + 1).padStart(2, "0")}</div>
            <div class="body">
              <h3 style="font-size:21px;margin:0 0 8px">${escapeHtml(c.title)}</h3>
              <p style="font-size:15.5px;line-height:1.6;margin:0">${escapeHtml(c.body)}</p>
            </div>
          </div>`
          )
          .join("")}

        ${quizCards.map((c) => quizBlockHtml(c, canEarnPoints)).join("")}

        ${
          lesson.status === "published" && canEarnPoints
            ? `<div style="border-top:1px solid var(--color-divider);padding-top:26px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
                 <button type="button" class="btn btn-primary btn-lg" id="complete-btn">Завершить урок (+${lesson.points_reward} баллов)</button>
                 <span class="muted" style="font-size:13px">${done ? "Модуль уже засчитан — можно перечитать в любой момент." : "Ответьте на квиз выше, чтобы получить максимум баллов."}</span>
               </div>`
            : ""
        }
        ${!canEarnPoints && !isOwner ? '<p class="muted" style="border-top:1px solid var(--color-divider);padding-top:26px">Прохождение урока за баллы доступно волонтёрам.</p>' : ""}

        <div id="lesson-result" style="margin-top:20px"></div>
        ${isOwner ? '<div id="author-tools" style="margin-top:44px"></div>' : ""}
      </div>
    </div>`;

  bindQuiz();

  if (isOwner) renderAuthorTools(lesson);

  document.getElementById("complete-btn")?.addEventListener("click", () => completeLesson(lesson));
}

function quizBlockHtml(card, interactive) {
  const options = card.quiz_options || [];
  return `
    <div class="lesson-block">
      <div class="ico"><i class="ph-duotone ph-question"></i></div>
      <div class="body">
        <h3 style="font-size:21px;margin:0 0 4px">Проверь себя</h3>
        <p style="font-size:15.5px;line-height:1.6;margin:0 0 16px">${escapeHtml(card.quiz_question || card.body || card.title)}</p>
        <div data-quiz="${card.id}">
          ${options
            .map(
              (opt, i) =>
                interactive
                  ? `<button type="button" class="quiz-opt" data-card="${card.id}" data-index="${i}">
                       <span class="dot"></span><span style="flex:1">${escapeHtml(opt)}</span><span class="quiz-mark"></span>
                     </button>`
                  : `<div class="quiz-opt" style="cursor:default"><span class="dot"></span><span style="flex:1">${escapeHtml(opt)}</span></div>`
            )
            .join("")}
        </div>
      </div>
    </div>`;
}

function bindQuiz() {
  document.querySelectorAll(".quiz-opt[data-card]").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(`.quiz-opt[data-card="${btn.dataset.card}"]`)
        .forEach((b) => b.classList.remove("picked"));
      btn.classList.add("picked");
    })
  );
}

async function completeLesson(lesson) {
  if (!isLoggedIn()) {
    window.location.href = "/login";
    return;
  }
  const answers = [];
  document.querySelectorAll("[data-quiz]").forEach((block) => {
    const picked = block.querySelector(".quiz-opt.picked");
    if (picked) {
      answers.push({ card_id: parseInt(picked.dataset.card, 10), selected_index: parseInt(picked.dataset.index, 10) });
    }
  });

  const resultEl = document.getElementById("lesson-result");
  try {
    const result = await api.post(`/lessons/${lesson.id}/complete`, { answers });
    let title;
    let sub;
    if (result.already_completed) {
      title = "Этот модуль уже был засчитан ранее";
      sub = "Баллы начисляются один раз, но перечитать материал можно всегда.";
    } else {
      title = `Модуль засчитан: +${result.points_awarded} баллов`;
      sub = `Правильных ответов: ${result.score} из ${result.max_score}.${
        result.new_achievements.length ? " Новые ачивки: " + result.new_achievements.join(", ") + "." : ""
      }`;
      if (!lessonsCompleted.includes(lesson.id)) lessonsCompleted.push(lesson.id);
    }
    resultEl.innerHTML = `
      <div class="note" style="display:flex;gap:14px;align-items:flex-start">
        <i class="ph-duotone ph-seal-check" style="font-size:24px;color:var(--color-accent-700)"></i>
        <div>
          <div style="font-family:var(--font-heading);font-weight:600;font-size:15.5px;margin-bottom:3px">${escapeHtml(title)}</div>
          <div class="muted" style="font-size:13px">${escapeHtml(sub)}</div>
        </div>
      </div>`;
    cachedUser = null;
    renderNav("/lessons");
  } catch (e) {
    resultEl.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

/* ------------------------------------------------- инструменты автора ---- */

function renderAuthorArea() {
  const root = document.getElementById("author-area");
  root.innerHTML = `
    <div class="cols" style="grid-template-columns:minmax(0,1fr) 340px;gap:44px">
      <div>
        <h2 style="font-size:22px">Создать курс</h2>
        <p class="muted" style="font-size:13.5px;max-width:52ch">Черновик создаётся сразу, карточки добавляются на странице курса. После этого курс отправляется на модерацию администратору фонда.</p>
        <div id="create-course-alert"></div>
        <form id="create-course-form" style="max-width:460px">
          <div class="field"><label for="cc-title">Название</label><input class="input" type="text" id="cc-title" required /></div>
          <div class="field"><label for="cc-slug">Slug (латиницей, уникальный)</label><input class="input" type="text" id="cc-slug" required /></div>
          <div class="field"><label for="cc-summary">Краткое описание</label><textarea class="input" id="cc-summary" rows="2" required></textarea></div>
          <div class="field"><label for="cc-points">Баллы за прохождение</label><input class="input" type="number" id="cc-points" value="10" min="0" /></div>
          <button class="btn btn-primary" type="submit">Создать черновик</button>
        </form>
      </div>
      <div>
        <h2 style="font-size:22px">Мои курсы</h2>
        <div id="my-courses">${skeletonLines(3)}</div>
      </div>
    </div>`;

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
      window.location.href = `/lessons?id=${lesson.id}`;
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  loadMyCourses();
}

async function loadMyCourses() {
  const el = document.getElementById("my-courses");
  try {
    const courses = await api.get("/lessons?mine_only=true");
    el.innerHTML = courses.length
      ? `<table class="table"><tbody>${courses
          .map(
            (c) =>
              `<tr><td><a href="/lessons?id=${c.id}">${escapeHtml(c.title)}</a></td><td style="text-align:right"><span class="tag tag-neutral">${LESSON_STATUS_LABELS[c.status] || c.status}</span></td></tr>`
          )
          .join("")}</tbody></table>`
      : '<p class="muted" style="font-size:13.5px">Вы ещё не создавали курсы.</p>';
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function renderAuthorTools(lesson) {
  const el = document.getElementById("author-tools");
  const canSubmit = lesson.status === "draft" || lesson.status === "rejected";

  el.innerHTML = `
    <h3 style="border-top:1px solid var(--color-divider);padding-top:26px">Инструменты автора</h3>
    <div id="author-alert"></div>
    <form id="add-card-form" style="max-width:520px">
      <div class="field"><label for="card-title">Заголовок карточки</label><input class="input" type="text" id="card-title" required /></div>
      <div class="field"><label for="card-body">Текст</label><textarea class="input" id="card-body" rows="3"></textarea></div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:13.5px">
        <input type="checkbox" id="card-is-quiz" style="width:auto" /> Это квиз
      </label>
      <div id="quiz-fields" hidden>
        <div class="field"><label for="quiz-question">Вопрос</label><input class="input" type="text" id="quiz-question" /></div>
        <div class="field"><label for="quiz-options">Варианты ответа (через ;)</label><input class="input" type="text" id="quiz-options" placeholder="Вариант 1;Вариант 2;Вариант 3" /></div>
        <div class="field"><label for="quiz-correct">Номер правильного варианта (с 0)</label><input class="input" type="number" id="quiz-correct" min="0" value="0" /></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" type="submit">Добавить карточку</button>
        ${canSubmit ? '<button class="btn btn-secondary" type="button" id="submit-course-btn">Отправить на модерацию</button>' : ""}
      </div>
      ${canSubmit ? "" : '<p class="muted" style="font-size:12.5px;margin-top:10px">Курс уже отправлен или опубликован — новые карточки применятся сразу.</p>'}
    </form>`;

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

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
