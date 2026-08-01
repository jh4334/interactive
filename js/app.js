/* ============================================================
 * 우리들의 육아 이야기 — 게임 엔진
 * 화면: home → setup → map(챕터 선택) → scene → ending
 * ============================================================ */

(function () {
  "use strict";

  const SAVE_KEY = "nurture-story-save-v1";
  const VOTE_KEY = "nurture-story-votes-v1";

  /* ---------------- 상태 ---------------- */

  const defaultState = () => ({
    profile: { gender: null, twins: false },
    babyName: "",
    choices: {},          // qid -> optionId
    cleared: [],          // 완료한 챕터 id
    current: null,        // { chapterId, sceneIdx }
    revealedGender: null, // '모름' 선택 시 출산 씬에서 공개된 성별
  });

  let state = loadSave() || defaultState();

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 시크릿 모드 등 */ }
  }

  /* ---------------- 통계 모듈 ----------------
   * 시드(STATS_SEED) + 내 투표(localStorage)를 합산해 보여준다.
   * 실제 서비스에서는 record/get을 서버 API 호출로 교체하면 된다.
   */
  const Stats = {
    _votes() {
      try { return JSON.parse(localStorage.getItem(VOTE_KEY) || "{}"); } catch (e) { return {}; }
    },
    record(qid, optionId) {
      const votes = this._votes();
      votes[qid] = optionId; // 같은 질문 재선택 시 교체 (중복 집계 방지)
      try { localStorage.setItem(VOTE_KEY, JSON.stringify(votes)); } catch (e) { /* noop */ }
    },
    get(qid) {
      const seed = STATS_SEED[qid] || {};
      const counts = Object.assign({}, seed);
      const my = this._votes()[qid];
      if (my != null) counts[my] = (counts[my] || 0) + 1;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { counts, total };
    },
  };

  /* ---------------- 텍스트 유틸 ---------------- */

  // 받침 유무에 따른 조사 선택
  function josa(word, withBatchim, noBatchim) {
    if (!word) return noBatchim;
    const ch = word.charCodeAt(word.length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return noBatchim; // 한글 외 문자는 뒤쪽 기본
    return (ch - 0xac00) % 28 > 0 ? withBatchim : noBatchim;
  }

  // {baby}, {baby|이|가}, {child}, {twin:A|B} 치환
  function tpl(text) {
    if (!text) return "";
    const baby = state.babyName || "아기";
    let out = text.replace(/\{twin:([^{}]*)\}/g, (_, body) => {
      const [a, b = ""] = splitOnce(body, "|");
      return state.profile.twins ? a : b;
    });
    out = out.replace(/\{baby\|([^|{}]*)\|([^|{}]*)\}/g, (_, w, n) => baby + josa(baby, w, n));
    out = out.replace(/\{baby\}/g, baby);
    const g = state.revealedGender || state.profile.gender;
    const child = g === "boy" ? "아들" : g === "girl" ? "딸" : "아기";
    out = out.replace(/\{child\}/g, child);
    return out;
  }

  // twin 분기의 A|B 분리 (A 안의 다른 |는 없다고 가정, 첫 | 기준)
  function splitOnce(s, sep) {
    const i = s.indexOf(sep);
    return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------------- 렌더링 ---------------- */

  const app = document.getElementById("app");

  function render(html, cls) {
    app.innerHTML = html;
    app.className = cls || "";
    window.scrollTo({ top: 0 });
  }

  function chapterById(id) {
    return STORY.chapters.find((c) => c.id === id);
  }

  /* ----- 홈 ----- */

  function showHome() {
    const hasSave = state.current || state.cleared.length > 0;
    render(`
      <section class="screen screen-home">
        <div class="home-emoji" aria-hidden="true">👶</div>
        <h1 class="home-title">우리들의<br>육아 이야기</h1>
        <p class="home-sub">임신부터 돌까지, 부모가 되는 여정.<br>
        중요한 순간마다 이상형 월드컵처럼 선택하고,<br>다른 부모들의 선택 통계도 확인해 보세요.</p>
        <div class="home-actions">
          ${hasSave ? `<button class="btn btn-primary" data-act="continue">이어서 하기</button>
                       <button class="btn btn-ghost" data-act="new">처음부터 새로 시작</button>`
                    : `<button class="btn btn-primary" data-act="new">시작하기</button>`}
        </div>
        <p class="home-note">예비 부부와 초보 부모를 위한 인터랙티브 스토리</p>
      </section>
    `);
    on("[data-act=new]", () => {
      if (state.current || state.cleared.length) {
        if (!confirm("저장된 이야기를 지우고 처음부터 시작할까요?")) return;
      }
      state = defaultState();
      save();
      showSetup();
    });
    on("[data-act=continue]", () => showMap());
  }

  /* ----- 설정(프로필) ----- */

  function showSetup() {
    render(`
      <section class="screen screen-setup">
        <h2 class="screen-title">우리 아기 이야기 설정</h2>
        <p class="screen-desc">이야기에 반영돼요. 실제와 달라도, 상상이어도 좋아요.</p>

        <div class="setup-group">
          <div class="setup-label">뱃속의 아기는?</div>
          <div class="pill-row" id="pick-gender">
            <button class="pill" data-v="boy">👦 아들</button>
            <button class="pill" data-v="girl">👧 딸</button>
            <button class="pill" data-v="unknown">🎁 아직 몰라요</button>
          </div>
          <p class="setup-hint" id="gender-hint" hidden>‘아직 몰라요’를 고르면 출산 장면에서 성별이 공개돼요!</p>
        </div>

        <div class="setup-group">
          <div class="setup-label">몇 명인가요?</div>
          <div class="pill-row" id="pick-twins">
            <button class="pill" data-v="one">🧸 한 명</button>
            <button class="pill" data-v="twins">🧸🧸 쌍둥이</button>
          </div>
        </div>

        <button class="btn btn-primary" id="setup-done" disabled>이야기 시작하기</button>
      </section>
    `);

    let gender = null, twins = null;
    const done = document.getElementById("setup-done");
    const sync = () => { done.disabled = !(gender && twins); };

    document.querySelectorAll("#pick-gender .pill").forEach((b) =>
      b.addEventListener("click", () => {
        gender = b.dataset.v;
        selectPill("#pick-gender", b);
        document.getElementById("gender-hint").hidden = gender !== "unknown";
        sync();
      })
    );
    document.querySelectorAll("#pick-twins .pill").forEach((b) =>
      b.addEventListener("click", () => {
        twins = b.dataset.v;
        selectPill("#pick-twins", b);
        sync();
      })
    );
    done.addEventListener("click", () => {
      state.profile.gender = gender === "unknown" ? null : gender;
      state.profile.genderChosen = gender; // 'unknown'도 기록
      state.profile.twins = twins === "twins";
      save();
      startChapter(STORY.chapters[0].id);
    });
  }

  function selectPill(scope, btn) {
    document.querySelectorAll(scope + " .pill").forEach((x) => x.classList.remove("on"));
    btn.classList.add("on");
  }

  /* ----- 챕터 맵 ----- */

  function showMap() {
    const items = STORY.chapters.map((ch, i) => {
      const clearedIdx = state.cleared.indexOf(ch.id);
      const cleared = clearedIdx !== -1;
      const prevCleared = i === 0 || state.cleared.includes(STORY.chapters[i - 1].id);
      const inProgress = state.current && state.current.chapterId === ch.id;
      const locked = ch.locked || (!cleared && !prevCleared && !inProgress);
      const status = ch.locked ? "준비 중" : cleared ? "완료 ✓" : inProgress ? "진행 중" : locked ? "잠김" : "시작 가능";
      return `
        <button class="chapter-card ${locked ? "locked" : ""} ${cleared ? "cleared" : ""}"
                data-ch="${ch.id}" ${locked ? "disabled" : ""}>
          <span class="chapter-emoji" aria-hidden="true">${ch.emoji}</span>
          <span class="chapter-meta">
            <span class="chapter-period">${esc(ch.period)}</span>
            <span class="chapter-name">${esc(ch.title)}</span>
            <span class="chapter-intro">${esc(tpl(ch.intro))}</span>
          </span>
          <span class="chapter-status">${status}</span>
        </button>`;
    }).join("");

    const allDone = STORY.chapters.filter((c) => !c.locked).every((c) => state.cleared.includes(c.id));

    render(`
      <section class="screen screen-map">
        <h2 class="screen-title">이야기 지도</h2>
        <p class="screen-desc">${esc(tpl("{baby|과|와} 함께하는 여정이에요."))}</p>
        <div class="chapter-list">${items}</div>
        ${allDone ? `<button class="btn btn-primary" id="to-ending">나의 육아 성향 결과 보기</button>` : ""}
        <button class="btn btn-ghost" id="to-home">처음 화면으로</button>
      </section>
    `);

    document.querySelectorAll(".chapter-card:not(.locked)").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.ch;
        if (state.current && state.current.chapterId === id) showScene();
        else startChapter(id);
      })
    );
    on("#to-home", showHome);
    on("#to-ending", showEnding);
  }

  function startChapter(chapterId) {
    state.current = { chapterId, sceneIdx: 0 };
    save();
    showScene();
  }

  /* ----- 씬 진행 ----- */

  function showScene() {
    const { chapterId, sceneIdx } = state.current;
    const ch = chapterById(chapterId);
    if (sceneIdx >= ch.scenes.length) return finishChapter(ch);

    const scene = ch.scenes[sceneIdx];
    const progress = Math.round((sceneIdx / ch.scenes.length) * 100);
    const header = `
      <header class="scene-header">
        <button class="link-back" id="back-map">← 지도</button>
        <div class="scene-chapter">${ch.emoji} ${esc(ch.title)}</div>
        <div class="progress-track" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" style="width:${progress}%"></div>
        </div>
      </header>`;

    if (scene.type === "story") return showStoryScene(header, scene);
    if (scene.type === "input") return showInputScene(header, scene);
    if (scene.type === "choice") return showChoiceScene(header, scene);
  }

  function showStoryScene(header, scene) {
    const paras = scene.text
      .map((p) => tpl(applyReveal(p)))
      .filter((p) => p.trim() !== "")
      .map((p) => `<p class="story-p">${esc(p)}</p>`)
      .join("");
    render(`
      <section class="screen screen-scene">
        ${header}
        <div class="story-block">${paras}</div>
        <button class="btn btn-primary" id="next">계속</button>
      </section>
    `);
    on("#back-map", showMap);
    on("#next", advance);
    animateParas();
  }

  // 출산 씬의 {reveal}: 성별 미정이면 여기서 랜덤 공개
  function applyReveal(p) {
    if (!p.includes("{reveal}")) return p;
    let g = state.profile.gender || state.revealedGender;
    if (!g) {
      g = Math.random() < 0.5 ? "boy" : "girl";
      state.revealedGender = g;
      save();
    } else if (!state.revealedGender) {
      state.revealedGender = g;
      save();
    }
    const word = g === "boy" ? "아드님" : "따님";
    const line = state.profile.twins
      ? (g === "boy" ? "“축하합니다, 씩씩한 아드님 둘입니다!”" : "“축하합니다, 어여쁜 따님 둘입니다!”")
      : `“축하합니다, ${word}입니다!”`;
    const surprise = state.profile.genderChosen === "unknown"
      ? " 열 달을 기다린 답이 드디어 공개되는 순간입니다." : "";
    return p.replace("{reveal}", line + surprise);
  }

  function showInputScene(header, scene) {
    const chips = (scene.suggestions || [])
      .map((s) => `<button class="chip" data-v="${esc(s)}">${esc(s)}</button>`)
      .join("");
    render(`
      <section class="screen screen-scene">
        ${header}
        <div class="story-block"><p class="story-p">${esc(tpl(scene.situation))}</p></div>
        <div class="ask-card">
          <h3 class="ask-q">${esc(tpl(scene.question))}</h3>
          <input class="name-input" id="name-input" type="text" maxlength="${scene.maxLength || 10}"
                 placeholder="${esc(scene.placeholder || "")}" autocomplete="off">
          <div class="chip-row">${chips}</div>
          <button class="btn btn-primary" id="name-done" disabled>결정!</button>
        </div>
      </section>
    `);
    const input = document.getElementById("name-input");
    const done = document.getElementById("name-done");
    input.addEventListener("input", () => { done.disabled = input.value.trim().length === 0; });
    document.querySelectorAll(".chip").forEach((c) =>
      c.addEventListener("click", () => {
        input.value = c.dataset.v;
        done.disabled = false;
        input.focus();
      })
    );
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      state[scene.stateKey] = v;
      save();
      showReactionCard({ title: tpl(scene.question), reaction: tpl(scene.reaction) });
    };
    done.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    on("#back-map", showMap);
    animateParas();
  }

  /* 이상형 월드컵 방식: 두 카드씩 대결 → 승자가 다음 상대와 대결 → 최종 우승이 선택
   * 4개: 4강 2경기 + 결승 / 3개: 준결승 + 결승(부전승 1명) / 2개: 단판 VS */
  function showChoiceScene(header, scene) {
    let queue = shuffle(scene.options.slice());
    let winners = [];
    const total = scene.options.length;
    let roundSize = total;

    const roundLabel = () => {
      if (total <= 2) return "VS";
      if (roundSize === 2) return "🏆 결승";
      if (roundSize === 3) return "준결승";
      return `${roundSize}강`;
    };

    const nextMatch = () => {
      if (queue.length === 1) winners.push(queue.shift());
      if (queue.length === 0) {
        if (winners.length === 1) return chooseOption(scene, winners[0].id);
        queue = winners;
        winners = [];
        roundSize = queue.length;
      }
      renderMatch(queue.shift(), queue.shift());
    };

    const renderMatch = (a, b) => {
      render(`
        <section class="screen screen-scene">
          ${header}
          <div class="story-block"><p class="story-p">${esc(tpl(scene.situation))}</p></div>
          <div class="ask-card">
            <div class="round-label">${roundLabel()}</div>
            <h3 class="ask-q">${esc(tpl(scene.question))}</h3>
            <div class="vs-arena">
              ${vsCard(scene, a)}
              <div class="vs-badge" aria-hidden="true">VS</div>
              ${vsCard(scene, b)}
            </div>
            <p class="vs-hint">더 마음이 가는 쪽을 눌러주세요</p>
          </div>
        </section>
      `);
      on("#back-map", showMap);
      document.querySelectorAll(".vs-card").forEach((el) =>
        el.addEventListener("click", () => {
          const winner = el.dataset.opt === a.id ? a : b;
          el.classList.add("won");
          setTimeout(() => { winners.push(winner); nextMatch(); }, 260);
        })
      );
      animateParas();
    };

    nextMatch();
  }

  function vsCard(scene, o) {
    const before = state.choices[scene.qid] === o.id;
    const art = o.img
      ? `<img class="vs-img" src="${esc(o.img)}" alt="">`
      : `<span class="vs-emoji" aria-hidden="true">${o.emoji || "🎈"}</span>`;
    return `
      <button class="vs-card" data-opt="${o.id}">
        <span class="vs-art">${art}</span>
        <span class="vs-label">${esc(tpl(o.label))}</span>
        ${o.desc ? `<span class="vs-desc">${esc(tpl(o.desc))}</span>` : ""}
        ${before ? `<span class="vs-before">지난번 우승</span>` : ""}
      </button>`;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function chooseOption(scene, optionId) {
    state.choices[scene.qid] = optionId;
    save();
    Stats.record(scene.qid, optionId);
    const opt = scene.options.find((o) => o.id === optionId);
    showResult(scene, opt);
  }

  /* ----- 선택 결과 + 통계 ----- */

  function showResult(scene, opt) {
    const { counts, total } = Stats.get(scene.qid);
    const rows = scene.options.map((o) => {
      const n = counts[o.id] || 0;
      const pct = total ? Math.round((n / total) * 100) : 0;
      const mine = o.id === opt.id;
      return `
        <div class="stat-row ${mine ? "mine" : ""}">
          <div class="stat-head">
            <span class="stat-label">${o.emoji ? o.emoji + " " : ""}${esc(tpl(o.label))}${mine ? ' <span class="stat-me">나의 선택</span>' : ""}</span>
            <span class="stat-pct">${pct}%</span>
          </div>
          <div class="stat-track"><div class="stat-fill" style="--w:${pct}%"></div></div>
        </div>`;
    }).join("");

    render(`
      <section class="screen screen-scene">
        <div class="result-card">
          <div class="result-tag">🏆 최종 선택</div>
          <h3 class="result-choice">${opt.emoji ? opt.emoji + " " : ""}${esc(tpl(opt.label))}</h3>
          <p class="result-reaction">${esc(tpl(opt.reaction))}</p>
        </div>

        <div class="stats-card">
          <h4 class="stats-title">다른 부모들의 선택은?</h4>
          <div class="stats-list">${rows}</div>
          <p class="stats-total">${total.toLocaleString()}명 참여</p>
        </div>

        ${scene.info ? `<div class="info-card"><span class="info-icon" aria-hidden="true">💡</span><p>${esc(tpl(scene.info))}</p></div>` : ""}

        <button class="btn btn-primary" id="next">다음 이야기로</button>
      </section>
    `);
    on("#next", advance);
    requestAnimationFrame(() =>
      document.querySelectorAll(".stat-fill").forEach((el) => el.classList.add("grow"))
    );
  }

  function showReactionCard({ title, reaction }) {
    render(`
      <section class="screen screen-scene">
        <div class="result-card">
          <div class="result-tag">${esc(title)}</div>
          <h3 class="result-choice">${esc(state.babyName)}</h3>
          <p class="result-reaction">${esc(reaction)}</p>
        </div>
        <button class="btn btn-primary" id="next">다음 이야기로</button>
      </section>
    `);
    on("#next", advance);
  }

  function advance() {
    state.current.sceneIdx += 1;
    save();
    showScene();
  }

  /* ----- 챕터 완료 ----- */

  function finishChapter(ch) {
    if (!state.cleared.includes(ch.id)) state.cleared.push(ch.id);
    state.current = null;
    save();

    const idx = STORY.chapters.indexOf(ch);
    const next = STORY.chapters[idx + 1];
    const nextPlayable = next && !next.locked;
    const allDone = STORY.chapters.filter((c) => !c.locked).every((c) => state.cleared.includes(c.id));

    render(`
      <section class="screen screen-clear">
        <div class="clear-emoji" aria-hidden="true">${ch.emoji}</div>
        <h2 class="screen-title">${esc(ch.title)} 완료!</h2>
        <p class="screen-desc">${esc(ch.period)}의 이야기를 마쳤어요.</p>
        <div class="home-actions">
          ${allDone
            ? `<button class="btn btn-primary" id="go-ending">나의 육아 성향 결과 보기</button>`
            : nextPlayable
              ? `<button class="btn btn-primary" id="go-next">다음 챕터: ${esc(next.title)}</button>`
              : ""}
          <button class="btn btn-ghost" id="go-map">이야기 지도로</button>
        </div>
      </section>
    `);
    on("#go-map", showMap);
    on("#go-next", () => startChapter(next.id));
    on("#go-ending", showEnding);
  }

  /* ----- 엔딩: 성향 분석 ----- */

  function computeTraits() {
    const score = { plan: 0, practical: 0, heart: 0, team: 0 };
    for (const ch of STORY.chapters) {
      for (const sc of ch.scenes) {
        if (sc.type !== "choice") continue;
        const picked = state.choices[sc.qid];
        if (!picked) continue;
        const opt = sc.options.find((o) => o.id === picked);
        (opt && opt.tags || []).forEach((t) => { score[t] = (score[t] || 0) + 1; });
      }
    }
    return Object.entries(score).sort((a, b) => b[1] - a[1]);
  }

  function majorityMatch() {
    let match = 0, answered = 0;
    for (const ch of STORY.chapters) {
      for (const sc of ch.scenes) {
        if (sc.type !== "choice") continue;
        const picked = state.choices[sc.qid];
        if (!picked) continue;
        answered += 1;
        const { counts } = Stats.get(sc.qid);
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top && top[0] === picked) match += 1;
      }
    }
    return { match, answered };
  }

  function showEnding() {
    const ranked = computeTraits();
    const [topKey] = ranked[0];
    const second = ranked[1] && ranked[1][1] > 0 ? TRAITS[ranked[1][0]] : null;
    const trait = TRAITS[topKey];
    const { match, answered } = majorityMatch();
    const pct = answered ? Math.round((match / answered) * 100) : 0;

    const reviewRows = [];
    for (const ch of STORY.chapters) {
      const rows = ch.scenes
        .filter((sc) => sc.type === "choice" && state.choices[sc.qid])
        .map((sc) => {
          const mine = sc.options.find((o) => o.id === state.choices[sc.qid]);
          const { counts, total } = Stats.get(sc.qid);
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          const topOpt = sc.options.find((o) => o.id === top[0]);
          const topPct = total ? Math.round((top[1] / total) * 100) : 0;
          const same = mine === topOpt;
          return `
            <li class="review-row">
              <span class="review-q">${esc(tpl(sc.question))}</span>
              <span class="review-a">${esc(tpl(mine.label))}
                <span class="review-cmp ${same ? "same" : ""}">${same ? `다수와 같은 선택 (${topPct}%)` : `다수는 “${esc(tpl(topOpt.label))}” (${topPct}%)`}</span>
              </span>
            </li>`;
        });
      if (rows.length) {
        reviewRows.push(`<h4 class="review-ch">${ch.emoji} ${esc(ch.title)}</h4><ul class="review-list">${rows.join("")}</ul>`);
      }
    }

    render(`
      <section class="screen screen-ending">
        <p class="ending-eyebrow">${esc(tpl("{baby|과|와} 함께한 여정, 당신의 육아 성향은"))}</p>
        <div class="trait-card">
          <div class="trait-emoji" aria-hidden="true">${trait.emoji}</div>
          <h2 class="trait-name">${esc(trait.name)}</h2>
          <p class="trait-desc">${esc(trait.desc)}</p>
          ${second ? `<p class="trait-second">서브 성향: ${second.emoji} ${esc(second.name)}</p>` : ""}
        </div>

        <div class="stats-card">
          <h4 class="stats-title">다른 부모들과의 선택 일치도</h4>
          <div class="stat-row mine">
            <div class="stat-head"><span class="stat-label">${answered}개 질문 중 ${match}개가 다수의 선택과 일치</span><span class="stat-pct">${pct}%</span></div>
            <div class="stat-track"><div class="stat-fill grow" style="--w:${pct}%"></div></div>
          </div>
          <p class="stats-total">일치율이 낮다고 틀린 게 아니에요. 우리 가족만의 답이 정답입니다.</p>
        </div>

        <div class="review-card">
          <h3 class="review-title">나의 선택 돌아보기</h3>
          ${reviewRows.join("")}
        </div>

        ${state.cleared.includes("ch4") ? "" : `
        <div class="teaser-card">
          <span class="teaser-emoji" aria-hidden="true">✨</span>
          <p>아직 안 끝났어요 — 이야기 지도에서 <strong>둘째라는 우주</strong>를 플레이해 보세요</p>
        </div>`}

        <div class="home-actions">
          <button class="btn btn-primary" id="restart">다른 선택으로 다시 해보기</button>
          <button class="btn btn-ghost" id="go-map">이야기 지도로</button>
        </div>
      </section>
    `);
    on("#go-map", showMap);
    on("#restart", () => {
      if (!confirm("이야기를 처음부터 다시 시작할까요? (통계 참여 기록은 유지돼요)")) return;
      state = defaultState();
      save();
      showSetup();
    });
    requestAnimationFrame(() =>
      document.querySelectorAll(".stat-fill").forEach((el) => el.classList.add("grow"))
    );
  }

  /* ---------------- 헬퍼 ---------------- */

  function on(sel, fn) {
    const el = document.querySelector(sel);
    if (el) el.addEventListener("click", fn);
  }

  function animateParas() {
    document.querySelectorAll(".story-p").forEach((p, i) => {
      p.style.animationDelay = `${i * 0.35}s`;
    });
  }

  /* ---------------- 시작 ---------------- */
  showHome();
})();
