(() => {
  const STORAGE_ID_KEY = 'qwen_quiz_player_id';
  const STORAGE_TOKEN_KEY = 'qwen_quiz_player_token';
  const STORAGE_NAME_KEY = 'qwen_quiz_player_name';
  const STORAGE_EMOJI_KEY = 'qwen_quiz_player_emoji';
  const SPECTATOR_KEY = 'qwen_quiz_spectator';
  const { t, pickLocalized, initLangSwitcher } = window.QuizI18n;

  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
  });

  const urlParams = new URLSearchParams(window.location.search);
  let mode = null; // null (role select) | 'player' | 'spectator'
  if (urlParams.get('spectator') === '1' || sessionStorage.getItem(SPECTATOR_KEY) === '1') {
    mode = 'spectator';
    sessionStorage.setItem(SPECTATOR_KEY, '1');
  } else if (
    localStorage.getItem(STORAGE_ID_KEY) &&
    localStorage.getItem(STORAGE_TOKEN_KEY) &&
    localStorage.getItem(STORAGE_NAME_KEY)
  ) {
    mode = 'player';
  }

  let currentState = null;
  let isConnected = false;
  let selectedEmoji = localStorage.getItem(STORAGE_EMOJI_KEY) || '🚀';
  let lastRoundKey = null;
  let answerDirty = false;

  // Anti-cheat tab-leave tracking state
  let awayStartedAt = null;
  let leaveDebounceTimer = null;
  let hasReportedLeave = false;

  const timerSync = {
    active: false,
    isPaused: false,
    durationMs: 60000,
    remainingMsPaused: 0,
    endsAtPerf: 0,
    rafId: null
  };

  const els = {
    mainContainer: document.getElementById('main-container'),
    quizTitle: document.getElementById('quiz-title'),
    connectionStatus: document.getElementById('connection-status'),
    playerMeta: document.getElementById('player-meta'),
    screens: {
      roleSelect: document.getElementById('screen-role-select'),
      login: document.getElementById('screen-login'),
      lobby: document.getElementById('screen-lobby'),
      round: document.getElementById('screen-round'),
      results: document.getElementById('screen-results'),
      finished: document.getElementById('screen-finished'),
      spectator: document.getElementById('screen-spectator')
    },
    choosePlayBtn: document.getElementById('choose-play-btn'),
    chooseSpectatorBtn: document.getElementById('choose-spectator-btn'),
    backToRoleBtn: document.getElementById('back-to-role-btn'),
    loginForm: document.getElementById('login-form'),
    playerNameInput: document.getElementById('player-name-input'),
    emojiPicker: document.getElementById('emoji-picker'),
    myLobbyCard: document.getElementById('my-lobby-card'),
    lobbyPlayersCount: document.getElementById('lobby-players-count'),
    lobbyPlayersList: document.getElementById('lobby-players-list'),
    roundHeading: document.getElementById('round-heading'),
    roundPlayerPill: document.getElementById('round-player-pill'),
    roundTimerLabel: document.getElementById('round-timer-label'),
    roundTimerValue: document.getElementById('round-timer-value'),
    roundTimerBar: document.getElementById('round-timer-bar'),
    roundQuestionText: document.getElementById('round-question-text'),
    roundStatusBanner: document.getElementById('round-status-banner'),
    playerAnswerPanel: document.getElementById('player-answer-panel'),
    playerSubmittedBanner: document.getElementById('player-submitted-banner'),
    playerAnswerForm: document.getElementById('player-answer-form'),
    playerAnswerInput: document.getElementById('player-answer-input'),
    playerSubmitBtn: document.getElementById('player-submit-btn'),
    myRoundResultCard: document.getElementById('my-round-result-card'),
    resultsRoundTitle: document.getElementById('results-round-title'),
    resultsJudgeBadge: document.getElementById('results-judge-badge'),
    resultsReferenceAnswer: document.getElementById('results-reference-answer'),
    resultsSummary: document.getElementById('results-summary'),
    resultsEvaluations: document.getElementById('results-evaluations'),
    resultsLeaderboard: document.getElementById('results-leaderboard'),
    finalLeaderboard: document.getElementById('final-leaderboard'),
    finalHistory: document.getElementById('final-history'),
    spectatorPhaseTitle: document.getElementById('spectator-phase-title'),
    spectatorPhasePill: document.getElementById('spectator-phase-pill'),
    spectatorTimerWrap: document.getElementById('spectator-timer-wrap'),
    spectatorTimerLabel: document.getElementById('spectator-timer-label'),
    spectatorTimerValue: document.getElementById('spectator-timer-value'),
    spectatorTimerBar: document.getElementById('spectator-timer-bar'),
    spectatorQuestionBox: document.getElementById('spectator-question-box'),
    spectatorStatusBox: document.getElementById('spectator-status-box'),
    spectatorResultsCard: document.getElementById('spectator-results-card'),
    spectatorResultsTitle: document.getElementById('spectator-results-title'),
    spectatorJudgeBadge: document.getElementById('spectator-judge-badge'),
    spectatorReferenceAnswer: document.getElementById('spectator-reference-answer'),
    spectatorResultsSummary: document.getElementById('spectator-results-summary'),
    spectatorResultsEvaluations: document.getElementById('spectator-results-evaluations'),
    spectatorPlayersHeading: document.getElementById('spectator-players-heading'),
    spectatorAnsweredPill: document.getElementById('spectator-answered-pill'),
    spectatorPlayersList: document.getElementById('spectator-players-list'),
    spectatorLeaderboard: document.getElementById('spectator-leaderboard'),
    toastStack: document.getElementById('toast-stack')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type = 'info') {
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = message;
    els.toastStack.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  function formatTime(totalSec) {
    const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function showOnlyScreen(name) {
    for (const [key, node] of Object.entries(els.screens)) {
      node.classList.toggle('hidden', key !== name);
    }
  }

  function updateConnectionLabel() {
    if (isConnected) {
      els.connectionStatus.innerHTML = `<span class="dot online"></span> ${escapeHtml(t('online'))}`;
    } else {
      els.connectionStatus.innerHTML = `<span class="dot offline"></span> ${escapeHtml(t('reconnecting'))}`;
    }
  }

  function applyTimerDom(remMs, durationMs, isPaused) {
    const total = Math.max(1000, Number(durationMs) || 60000);
    const clampedMs = Math.max(0, Number(remMs) || 0);
    const pct = Math.max(0, Math.min(100, (clampedMs / total) * 100));
    const remSec = Math.ceil(clampedMs / 1000);
    const timeText = isPaused
      ? `${formatTime(remSec)} ${t('paused_suffix')}`
      : formatTime(remSec);
    const labelText = isPaused ? t('timer_paused_label') : t('time_left');
    const isUrgent = !isPaused && clampedMs > 0 && clampedMs <= 15000;

    els.roundTimerValue.textContent = timeText;
    els.roundTimerLabel.textContent = labelText;
    els.roundTimerBar.style.width = `${pct.toFixed(3)}%`;
    els.roundTimerValue.classList.toggle('urgent', isUrgent);
    els.roundTimerBar.classList.toggle('urgent', isUrgent);

    els.spectatorTimerValue.textContent = timeText;
    els.spectatorTimerLabel.textContent = labelText;
    els.spectatorTimerBar.style.width = `${pct.toFixed(3)}%`;
    els.spectatorTimerValue.classList.toggle('urgent', isUrgent);
    els.spectatorTimerBar.classList.toggle('urgent', isUrgent);
  }

  function stopTimerLoop() {
    if (timerSync.rafId !== null) {
      cancelAnimationFrame(timerSync.rafId);
      timerSync.rafId = null;
    }
  }

  function timerFrame() {
    if (!timerSync.active || timerSync.isPaused) {
      timerSync.rafId = null;
      return;
    }
    const remMs = Math.max(0, timerSync.endsAtPerf - performance.now());
    applyTimerDom(remMs, timerSync.durationMs, false);
    if (remMs > 0) {
      timerSync.rafId = requestAnimationFrame(timerFrame);
    } else {
      timerSync.rafId = null;
    }
  }

  function syncTimerFromPayload({ remainingMs, remainingSeconds, durationSeconds, isPaused, isActive }) {
    const durMs = Math.max(1000, (Number(durationSeconds) || 60) * 1000);
    const remMs =
      typeof remainingMs === 'number'
        ? Math.max(0, remainingMs)
        : Math.max(0, (Number(remainingSeconds) || 0) * 1000);

    timerSync.active = Boolean(isActive);
    timerSync.isPaused = Boolean(isPaused);
    timerSync.durationMs = durMs;
    timerSync.remainingMsPaused = remMs;
    timerSync.endsAtPerf = performance.now() + remMs;

    applyTimerDom(remMs, durMs, timerSync.isPaused);
    stopTimerLoop();
    if (timerSync.active && !timerSync.isPaused && remMs > 0) {
      timerSync.rafId = requestAnimationFrame(timerFrame);
    }
  }

  // ========================
  // Anti-cheat Tab Tracking
  // ========================

  function isAntiCheatArmed() {
    return (
      mode === 'player' &&
      currentState &&
      currentState.status === 'ROUND_ACTIVE' &&
      Boolean(currentState.player)
    );
  }

  function resetAntiCheatTracking() {
    if (leaveDebounceTimer) {
      clearTimeout(leaveDebounceTimer);
      leaveDebounceTimer = null;
    }
    awayStartedAt = null;
    hasReportedLeave = false;
  }

  function handleWindowLeave() {
    if (!isAntiCheatArmed() || awayStartedAt !== null) return;
    awayStartedAt = Date.now();
    leaveDebounceTimer = setTimeout(() => {
      leaveDebounceTimer = null;
      if (awayStartedAt !== null && isAntiCheatArmed() && !hasReportedLeave) {
        hasReportedLeave = true;
        socket.emit('student:tab_leave');
      }
    }, 1500);
  }

  function handleWindowReturn() {
    if (awayStartedAt === null) return;
    if (leaveDebounceTimer) {
      clearTimeout(leaveDebounceTimer);
      leaveDebounceTimer = null;
    }
    const elapsed = Date.now() - awayStartedAt;
    awayStartedAt = null;
    if (hasReportedLeave) {
      hasReportedLeave = false;
      if (isAntiCheatArmed()) {
        socket.emit('student:tab_return', { awayMs: elapsed });
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      handleWindowLeave();
    } else {
      handleWindowReturn();
    }
  });

  window.addEventListener('blur', handleWindowLeave);
  window.addEventListener('focus', handleWindowReturn);

  // ========================
  // Rendering
  // ========================

  function renderTopBar(state) {
    document.title = t('page_title_student');
    els.quizTitle.textContent = pickLocalized(state.quizTitle, state.quizTitleKk) || t('default_quiz_title');
    updateConnectionLabel();
    els.mainContainer.classList.toggle('container-spectator', mode === 'spectator');

    if (mode === 'spectator') {
      els.playerMeta.innerHTML = `
        <span class="pill pill-primary">${escapeHtml(t('spectator_badge'))}</span>
        <button type="button" class="btn btn-secondary btn-sm" id="become-player-btn">${escapeHtml(t('become_player_btn'))}</button>
      `;
      document.getElementById('become-player-btn')?.addEventListener('click', () => {
        mode = 'player';
        sessionStorage.removeItem(SPECTATOR_KEY);
        if (window.location.search.includes('spectator=1')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
        socket.emit('student:set_spectator', { enabled: false }, (res) => {
          if (res?.state) render(res.state);
        });
      });
      return;
    }

    if (!state.player) {
      els.playerMeta.innerHTML = '';
      return;
    }

    els.playerMeta.innerHTML = `
      <span class="pill pill-primary">${escapeHtml(state.player.emoji)} ${escapeHtml(state.player.name)} · ${state.player.totalScore} ${escapeHtml(t('pts_short'))}</span>
      <button type="button" class="btn btn-secondary btn-sm" id="logout-player-btn">${escapeHtml(t('change_name'))}</button>
    `;

    document.getElementById('logout-player-btn')?.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_ID_KEY);
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_NAME_KEY);
      window.location.reload();
    });
  }

  function renderEmojiPicker(emojis) {
    if (!emojis || !emojis.length) return;
    if (!emojis.includes(selectedEmoji)) {
      selectedEmoji = emojis[0];
    }
    els.emojiPicker.innerHTML = emojis
      .map(
        (emoji) =>
          `<button type="button" class="emoji-btn ${emoji === selectedEmoji ? 'selected' : ''}" data-emoji="${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>`
      )
      .join('');

    els.emojiPicker.querySelectorAll('.emoji-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedEmoji = btn.dataset.emoji;
        localStorage.setItem(STORAGE_EMOJI_KEY, selectedEmoji);
        renderEmojiPicker(emojis);
      });
    });
  }

  function renderPlayersGrid(container, players, { showSubmissionStatus = false } = {}) {
    if (!players || !players.length) {
      container.innerHTML = `<div class="muted">${escapeHtml(t('no_players_yet'))}</div>`;
      return;
    }

    container.innerHTML = players
      .map((p) => {
        const rightBadge = showSubmissionStatus
          ? `<span class="pill ${p.hasSubmitted ? 'pill-success' : 'pill-warning'}">${escapeHtml(p.hasSubmitted ? t('status_answered') : t('status_thinking'))}</span>`
          : `<span class="pill">${p.totalScore} ${escapeHtml(t('pts_short'))}</span>`;
        return `
          <div class="player-tile">
            <div class="player-tile-left">
              <span class="dot ${p.isOnline ? 'online' : 'offline'}"></span>
              <span>${escapeHtml(p.emoji)}</span>
              <span class="player-tile-name">${escapeHtml(p.name)}</span>
            </div>
            ${rightBadge}
          </div>
        `;
      })
      .join('');
  }

  function renderLobbyScreen(state) {
    const p = state.player;
    els.myLobbyCard.innerHTML = `
      <div class="card-title">
        <span>${escapeHtml(t('my_profile_title', { emoji: p.emoji, name: p.name }))}</span>
        <span class="pill pill-success">${escapeHtml(t('individual_mode_badge'))}</span>
      </div>
      <p class="muted" style="margin-top: 0;">${escapeHtml(t('lobby_ready_hint'))}</p>
      <button type="button" class="btn btn-secondary btn-sm" id="switch-to-spectator-btn">${escapeHtml(t('leave_to_roles_btn'))}</button>
    `;

    document.getElementById('switch-to-spectator-btn')?.addEventListener('click', () => {
      mode = null;
      localStorage.removeItem(STORAGE_ID_KEY);
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      socket.emit('student:set_spectator', { enabled: false }, (res) => {
        if (res?.state) render(res.state);
      });
    });

    els.lobbyPlayersCount.textContent = t('players_count', { n: state.players.length });
    renderPlayersGrid(els.lobbyPlayersList, state.players, { showSubmissionStatus: false });
  }

  function renderRoundScreen(state) {
    const round = state.currentRound;
    const p = state.player;
    if (!round || !p) return;

    const roundKey = `${round.roundNumber}_${round.title}`;
    if (lastRoundKey !== roundKey) {
      lastRoundKey = roundKey;
      answerDirty = false;
      els.playerAnswerInput.value = p.submission?.text || '';
      resetAntiCheatTracking();
    } else if (!answerDirty && p.submission?.text && !els.playerAnswerInput.value) {
      els.playerAnswerInput.value = p.submission.text;
    }

    const locTitle = pickLocalized(round.title, round.titleKk);
    const locQuestion = pickLocalized(round.question, round.questionKk);

    els.roundHeading.textContent = t('round_heading', {
      num: round.roundNumber,
      total: round.totalQuestions,
      title: locTitle
    });
    els.roundPlayerPill.textContent = `${p.emoji} ${p.name}`;
    els.roundQuestionText.textContent = locQuestion;

    syncTimerFromPayload({
      remainingMs: round.remainingMs,
      remainingSeconds: round.remainingSeconds,
      durationSeconds: round.durationSeconds,
      isPaused: round.isPaused,
      isActive: state.status === 'ROUND_ACTIVE'
    });

    const isActive = state.status === 'ROUND_ACTIVE';
    const isLocked = state.status === 'ROUND_LOCKED';
    const isJudging = state.status === 'JUDGING';

    if (!isActive) {
      resetAntiCheatTracking();
    }

    if (isActive) {
      els.roundStatusBanner.classList.add('hidden');
    } else if (isLocked) {
      els.roundStatusBanner.className = 'alert alert-warning';
      els.roundStatusBanner.innerHTML = `${escapeHtml(t('round_locked_msg'))} ${
        p.submission
          ? `${escapeHtml(t('your_final_ans'))} <strong>${escapeHtml(p.submission.text)}</strong>`
          : escapeHtml(t('no_answer_submitted'))
      }`;
      els.roundStatusBanner.classList.remove('hidden');
    } else if (isJudging) {
      els.roundStatusBanner.className = 'alert alert-success';
      els.roundStatusBanner.innerHTML = `<div style="display:flex; align-items:center; gap:12px;">
          <span class="spinner"></span>
          <span><strong>${escapeHtml(t('qwen_judging_msg'))}</strong></span>
        </div>`;
      els.roundStatusBanner.classList.remove('hidden');
    }

    els.playerAnswerPanel.classList.toggle('hidden', !isActive);

    if (isActive) {
      if (p.submission) {
        els.playerSubmittedBanner.innerHTML = `${escapeHtml(t('player_submitted_banner'))} <strong>${escapeHtml(p.submission.text)}</strong> ${escapeHtml(t('can_update_before_end'))}`;
        els.playerSubmittedBanner.classList.remove('hidden');
        els.playerSubmitBtn.textContent = t('update_final_btn');
      } else {
        els.playerSubmittedBanner.classList.add('hidden');
        els.playerSubmitBtn.textContent = t('send_final_btn');
      }
    }
  }

  function scoreClass(score) {
    if (score >= 75) return 'score-high';
    if (score >= 40) return 'score-mid';
    return 'score-low';
  }

  function renderLeaderboard(container, leaderboard) {
    if (!leaderboard || !leaderboard.length) {
      container.innerHTML = `<div class="muted">${escapeHtml(t('leaderboard_empty'))}</div>`;
      return;
    }

    container.innerHTML = leaderboard
      .map((entry, idx) => {
        const rank = idx + 1;
        const rankClass = rank <= 3 ? `r${rank}` : '';
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        return `
          <div class="leader-row" style="${entry.isMe ? 'border-color: var(--primary);' : ''}">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="leader-rank ${rankClass}">${medal}</div>
              <div>
                <div style="font-weight:700;">
                  ${escapeHtml(entry.emoji)} ${escapeHtml(entry.name)}
                  ${entry.isMe ? `<span class="pill pill-primary" style="margin-left:6px;">${escapeHtml(t('you_pill'))}</span>` : ''}
                </div>
              </div>
            </div>
            <div style="font-weight:800; font-size:1.05rem;">${entry.totalScore} ${escapeHtml(t('pts_short'))}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderResultsScreen(state) {
    const round = state.currentRound;
    const res = state.roundResults;
    if (!round || !res) return;

    if (res.myEvaluation) {
      const me = res.myEvaluation;
      els.myRoundResultCard.classList.remove('hidden');
      els.myRoundResultCard.innerHTML = `
        <div class="card-title">
          <span>${escapeHtml(t('my_result_heading'))}</span>
          <span class="score-badge ${scoreClass(me.score)}">${me.score} / 100</span>
        </div>
        <div style="margin-bottom:6px; font-size:0.95rem;">
          <span class="muted">${escapeHtml(t('answer_label'))}</span>
          ${me.answer ? `<strong>${escapeHtml(me.answer)}</strong>` : `<span class="muted">${escapeHtml(t('no_answer_label'))}</span>`}
        </div>
        <div class="muted" style="font-size:0.92rem;">💬 ${escapeHtml(me.comment)}</div>
      `;
    } else {
      els.myRoundResultCard.classList.add('hidden');
    }

    const locTitle = pickLocalized(round.title, round.titleKk);
    const locRefAnswer = pickLocalized(res.referenceAnswer, res.referenceAnswerKk);

    els.resultsRoundTitle.textContent = t('results_title', {
      num: round.roundNumber,
      title: locTitle
    });
    els.resultsJudgeBadge.textContent =
      res.judgeSource === 'qwen'
        ? t('judge_qwen', { model: res.modelUsed || 'Qwen AI' })
        : res.judgeSource === 'manual'
          ? t('judge_manual')
          : t('judge_fallback');

    els.resultsReferenceAnswer.textContent = locRefAnswer;
    els.resultsSummary.innerHTML = `<strong>${escapeHtml(t('judge_verdict_label'))}</strong> ${escapeHtml(res.roundSummary)}`;

    els.resultsEvaluations.innerHTML = res.evaluations
      .map((ev) => `
        <div class="eval-card ${ev.isWinner ? 'winner' : ''}" style="${ev.isMe ? 'border-color: var(--primary);' : ''}">
          <div class="eval-head">
            <div style="font-weight:700;">
              ${ev.isWinner ? '👑 ' : ''}${escapeHtml(ev.emoji)} ${escapeHtml(ev.playerName)}
              ${ev.isMe ? `<span class="pill pill-primary" style="margin-left:6px;">${escapeHtml(t('you_pill'))}</span>` : ''}
            </div>
            <span class="score-badge ${scoreClass(ev.score)}">${ev.score} / 100</span>
          </div>
          <div style="margin-bottom:6px; font-size:0.93rem;">
            <span class="muted">${escapeHtml(t('answer_label'))}</span>
            ${ev.answer ? `<strong>${escapeHtml(ev.answer)}</strong>` : `<span class="muted">${escapeHtml(t('no_answer_label'))}</span>`}
          </div>
          <div class="muted" style="font-size:0.9rem;">💬 ${escapeHtml(ev.comment)}</div>
        </div>
      `)
      .join('');

    renderLeaderboard(els.resultsLeaderboard, state.leaderboard);
  }

  function renderFinishedScreen(state) {
    renderLeaderboard(els.finalLeaderboard, state.leaderboard);

    const history = state.roundHistory || [];
    if (!history.length) {
      els.finalHistory.innerHTML = `<div class="muted">${escapeHtml(t('no_finished_rounds'))}</div>`;
      return;
    }

    els.finalHistory.innerHTML = history
      .map((h) => {
        const locTitle = pickLocalized(h.title, h.titleKk);
        const locQuestion = pickLocalized(h.question, h.questionKk);
        const locRef = pickLocalized(h.referenceAnswer, h.referenceAnswerKk);
        return `
          <div class="eval-card">
            <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(t('round_prefix'))} ${h.roundNumber}: ${escapeHtml(locTitle)}</div>
            <div class="muted" style="margin-bottom:6px;">${escapeHtml(locQuestion)}</div>
            <div style="font-size:0.92rem; color:#6ee7b7; margin-bottom:4px;">
              <strong>${escapeHtml(t('answer_prefix'))}</strong> ${escapeHtml(locRef)}
            </div>
            <div class="muted" style="font-size:0.88rem;">${escapeHtml(h.roundSummary)}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderSpectatorScreen(state) {
    const round = state.currentRound;
    const players = state.players || [];
    const status = state.status;

    els.spectatorPhasePill.textContent = t(`phase_${status}`);

    if (status === 'LOBBY') {
      els.spectatorPhaseTitle.textContent = t('spectator_lobby_title');
      els.spectatorTimerWrap.classList.add('hidden');
      els.spectatorQuestionBox.classList.add('hidden');
      els.spectatorStatusBox.classList.remove('hidden');
      els.spectatorStatusBox.textContent = t('spectator_lobby_hint');
      els.spectatorResultsCard.classList.add('hidden');
      stopTimerLoop();
    } else if (status === 'ROUND_ACTIVE' || status === 'ROUND_LOCKED' || status === 'JUDGING') {
      const locTitle = round ? pickLocalized(round.title, round.titleKk) : '';
      const locQuestion = round ? pickLocalized(round.question, round.questionKk) : '';
      els.spectatorPhaseTitle.textContent = round
        ? t('round_heading', {
            num: round.roundNumber,
            total: round.totalQuestions,
            title: locTitle
          })
        : t(`phase_${status}`);
      els.spectatorTimerWrap.classList.remove('hidden');
      els.spectatorQuestionBox.textContent = locQuestion;
      els.spectatorQuestionBox.classList.toggle('hidden', !locQuestion);
      els.spectatorStatusBox.classList.remove('hidden');
      els.spectatorResultsCard.classList.add('hidden');

      if (round) {
        syncTimerFromPayload({
          remainingMs: round.remainingMs,
          remainingSeconds: round.remainingSeconds,
          durationSeconds: round.durationSeconds,
          isPaused: round.isPaused,
          isActive: status === 'ROUND_ACTIVE'
        });
      }

      if (status === 'ROUND_ACTIVE') {
        els.spectatorStatusBox.textContent = t('spectator_round_active_msg');
      } else if (status === 'ROUND_LOCKED') {
        els.spectatorStatusBox.textContent = t('spectator_locked_msg');
      } else {
        els.spectatorStatusBox.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; gap:12px;"><span class="spinner"></span><span>${escapeHtml(t('spectator_judging_msg'))}</span></div>`;
      }
    } else if (status === 'ROUND_RESULTS' && round && state.roundResults) {
      stopTimerLoop();
      els.spectatorPhaseTitle.textContent = t('results_title', {
        num: round.roundNumber,
        title: pickLocalized(round.title, round.titleKk)
      });
      els.spectatorTimerWrap.classList.add('hidden');
      els.spectatorQuestionBox.classList.add('hidden');
      els.spectatorStatusBox.classList.add('hidden');
      els.spectatorResultsCard.classList.remove('hidden');

      const res = state.roundResults;
      els.spectatorResultsTitle.textContent = t('results_title', {
        num: round.roundNumber,
        title: pickLocalized(round.title, round.titleKk)
      });
      els.spectatorJudgeBadge.textContent =
        res.judgeSource === 'qwen'
          ? t('judge_qwen', { model: res.modelUsed || 'Qwen AI' })
          : res.judgeSource === 'manual'
            ? t('judge_manual')
            : t('judge_fallback');
      els.spectatorReferenceAnswer.textContent = pickLocalized(
        res.referenceAnswer,
        res.referenceAnswerKk
      );
      els.spectatorResultsSummary.innerHTML = `<strong>${escapeHtml(t('judge_verdict_label'))}</strong> ${escapeHtml(res.roundSummary)}`;
      els.spectatorResultsEvaluations.innerHTML = res.evaluations
        .map(
          (ev) => `
            <div class="eval-card ${ev.isWinner ? 'winner' : ''}">
              <div class="eval-head">
                <div style="font-weight:700;">
                  ${ev.isWinner ? '👑 ' : ''}${escapeHtml(ev.emoji)} ${escapeHtml(ev.playerName)}
                </div>
                <span class="score-badge ${scoreClass(ev.score)}">${ev.score} / 100</span>
              </div>
              <div style="margin-bottom:4px; font-size:0.93rem;">
                <span class="muted">${escapeHtml(t('answer_label'))}</span>
                ${ev.answer ? `<strong>${escapeHtml(ev.answer)}</strong>` : `<span class="muted">${escapeHtml(t('no_answer_label'))}</span>`}
              </div>
              <div class="muted" style="font-size:0.9rem;">💬 ${escapeHtml(ev.comment)}</div>
            </div>
          `
        )
        .join('');
    } else if (status === 'FINISHED') {
      stopTimerLoop();
      els.spectatorPhaseTitle.textContent = t('quiz_finished_heading');
      els.spectatorTimerWrap.classList.add('hidden');
      els.spectatorQuestionBox.classList.add('hidden');
      els.spectatorStatusBox.classList.add('hidden');
      els.spectatorResultsCard.classList.add('hidden');
    }

    const isRoundStatus =
      status === 'ROUND_ACTIVE' || status === 'ROUND_LOCKED' || status === 'JUDGING';
    const submittedCount = players.filter((p) => p.hasSubmitted).length;

    els.spectatorPlayersHeading.textContent = isRoundStatus
      ? t('spectator_players_status_title')
      : t('all_players_lobby');
    els.spectatorAnsweredPill.textContent = isRoundStatus
      ? t('answered_summary', { submitted: submittedCount, total: players.length })
      : t('players_count', { n: players.length });

    renderPlayersGrid(els.spectatorPlayersList, players, { showSubmissionStatus: isRoundStatus });
    renderLeaderboard(els.spectatorLeaderboard, state.leaderboard);
  }

  function render(state) {
    currentState = state;
    renderTopBar(state);

    if (mode === 'spectator') {
      stopTimerLoop();
      showOnlyScreen('spectator');
      renderSpectatorScreen(state);
      return;
    }

    if (mode === null && !state.player) {
      stopTimerLoop();
      resetAntiCheatTracking();
      showOnlyScreen('roleSelect');
      return;
    }

    if (!state.player) {
      stopTimerLoop();
      resetAntiCheatTracking();
      showOnlyScreen('login');
      renderEmojiPicker(state.availableEmojis);
      return;
    }

    mode = 'player';

    if (state.status === 'LOBBY') {
      stopTimerLoop();
      resetAntiCheatTracking();
      showOnlyScreen('lobby');
      renderLobbyScreen(state);
      return;
    }

    if (
      state.status === 'ROUND_ACTIVE' ||
      state.status === 'ROUND_LOCKED' ||
      state.status === 'JUDGING'
    ) {
      showOnlyScreen('round');
      renderRoundScreen(state);
      return;
    }

    if (state.status === 'ROUND_RESULTS') {
      stopTimerLoop();
      resetAntiCheatTracking();
      showOnlyScreen('results');
      renderResultsScreen(state);
      return;
    }

    if (state.status === 'FINISHED') {
      stopTimerLoop();
      resetAntiCheatTracking();
      showOnlyScreen('finished');
      renderFinishedScreen(state);
    }
  }

  initLangSwitcher(() => {
    if (currentState) {
      render(currentState);
    } else {
      document.title = t('page_title_student');
      updateConnectionLabel();
    }
  });

  // ========================
  // Event Handlers
  // ========================

  els.choosePlayBtn.addEventListener('click', () => {
    mode = 'player';
    sessionStorage.removeItem(SPECTATOR_KEY);
    if (currentState) render(currentState);
  });

  els.chooseSpectatorBtn.addEventListener('click', () => {
    mode = 'spectator';
    sessionStorage.setItem(SPECTATOR_KEY, '1');
    socket.emit('student:set_spectator', { enabled: true }, (res) => {
      if (res?.state) render(res.state);
    });
  });

  els.backToRoleBtn.addEventListener('click', () => {
    mode = null;
    if (currentState) render(currentState);
  });

  els.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.playerNameInput.value.trim();
    if (!name) return;

    const existingId = localStorage.getItem(STORAGE_ID_KEY) || undefined;
    const existingToken = localStorage.getItem(STORAGE_TOKEN_KEY) || undefined;
    socket.emit(
      'student:register',
      { playerId: existingId, playerToken: existingToken, name, emoji: selectedEmoji },
      (res) => {
        if (!res?.ok) {
          showToast(res?.error || t('toast_login_err'), 'error');
          return;
        }
        mode = 'player';
        localStorage.setItem(STORAGE_ID_KEY, res.playerId);
        if (res.playerToken) {
          localStorage.setItem(STORAGE_TOKEN_KEY, res.playerToken);
        }
        localStorage.setItem(STORAGE_NAME_KEY, name);
        localStorage.setItem(STORAGE_EMOJI_KEY, selectedEmoji);
        if (res.state) render(res.state);
      }
    );
  });

  els.playerAnswerInput.addEventListener('input', () => {
    answerDirty = true;
  });

  els.playerAnswerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.playerAnswerInput.value.trim();
    if (!text) {
      showToast(t('toast_enter_answer'), 'error');
      return;
    }
    socket.emit('student:submit_answer', { text }, (res) => {
      if (!res?.ok) {
        showToast(res?.error || t('toast_send_err'), 'error');
        return;
      }
      answerDirty = false;
      showToast(t('toast_answer_sent'), 'success');
    });
  });

  // ========================
  // Socket Lifecycle
  // ========================

  socket.on('connect', () => {
    isConnected = true;
    updateConnectionLabel();
    if (mode === 'spectator') {
      socket.emit('student:set_spectator', { enabled: true }, (res) => {
        if (res?.state) render(res.state);
      });
      return;
    }
    const savedId = localStorage.getItem(STORAGE_ID_KEY);
    const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
    const savedName = localStorage.getItem(STORAGE_NAME_KEY);
    const savedEmoji = localStorage.getItem(STORAGE_EMOJI_KEY) || selectedEmoji;
    if (savedId && savedToken && savedName) {
      els.playerNameInput.value = savedName;
      socket.emit(
        'student:register',
        { playerId: savedId, playerToken: savedToken, name: savedName, emoji: savedEmoji },
        (res) => {
          if (res?.ok && res.state) {
            localStorage.setItem(STORAGE_ID_KEY, res.playerId);
            if (res.playerToken) {
              localStorage.setItem(STORAGE_TOKEN_KEY, res.playerToken);
            }
            render(res.state);
          }
        }
      );
    }
  });

  socket.on('disconnect', () => {
    isConnected = false;
    updateConnectionLabel();
  });

  socket.on('game:state', (state) => {
    render(state);
  });

  socket.on('game:timer', (tick) => {
    if (currentState && currentState.status === 'ROUND_ACTIVE') {
      syncTimerFromPayload({
        remainingMs: tick.remainingMs,
        remainingSeconds: tick.remainingSeconds,
        durationSeconds: tick.durationSeconds,
        isPaused: tick.isPaused,
        isActive: true
      });
    }
  });

  socket.on('student:kicked', () => {
    localStorage.removeItem(STORAGE_ID_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    mode = null;
    resetAntiCheatTracking();
    showToast(t('toast_kicked'), 'error');
  });
})();
