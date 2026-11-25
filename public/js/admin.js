(() => {
  const TOKEN_KEY = 'qwen_quiz_admin_token';
  const { t, pickLocalized, initLangSwitcher } = window.QuizI18n;

  let adminToken = localStorage.getItem(TOKEN_KEY) || '';
  let socket = null;
  let adminState = null;
  let settingsInitialized = false;
  let activeTab = 'control';

  function getPhaseLabel(status) {
    return t(`phase_${status}`);
  }

  const els = {
    loginScreen: document.getElementById('admin-login-screen'),
    loginForm: document.getElementById('admin-login-form'),
    loginInput: document.getElementById('admin-login-input'),
    passwordInput: document.getElementById('admin-password-input'),
    loginError: document.getElementById('admin-login-error'),
    adminApp: document.getElementById('admin-app'),
    quizTitle: document.getElementById('admin-quiz-title'),
    statusLine: document.getElementById('admin-status-line'),
    playersPill: document.getElementById('admin-players-pill'),
    copyStudentLinkBtn: document.getElementById('copy-student-link-btn'),
    logoutBtn: document.getElementById('admin-logout-btn'),
    questionsCountTab: document.getElementById('questions-count-tab'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanels: {
      control: document.getElementById('tab-control'),
      questions: document.getElementById('tab-questions'),
      settings: document.getElementById('tab-settings')
    },
    phasePill: document.getElementById('admin-phase-pill'),
    roundSelect: document.getElementById('round-select'),
    startRoundBtn: document.getElementById('start-round-btn'),
    roundPanel: document.getElementById('admin-round-panel'),
    roundTitle: document.getElementById('admin-round-title'),
    timerValue: document.getElementById('admin-timer-value'),
    timerBar: document.getElementById('admin-timer-bar'),
    questionText: document.getElementById('admin-question-text'),
    referenceAnswer: document.getElementById('admin-reference-answer'),
    activeControls: document.getElementById('admin-active-controls'),
    pauseRoundBtn: document.getElementById('pause-round-btn'),
    addTimeBtn: document.getElementById('add-time-btn'),
    lockRoundBtn: document.getElementById('lock-round-btn'),
    lockedControls: document.getElementById('admin-locked-controls'),
    judgeQwenBtn: document.getElementById('judge-qwen-btn'),
    manualJudgeBtn: document.getElementById('manual-judge-btn'),
    reopenRoundBtn: document.getElementById('reopen-round-btn'),
    judgingSpinner: document.getElementById('admin-judging-spinner'),
    judgeError: document.getElementById('admin-judge-error'),
    evalPanel: document.getElementById('admin-evaluation-panel'),
    evalHeading: document.getElementById('admin-eval-heading'),
    publishResultsBtn: document.getElementById('publish-results-btn'),
    evalSummary: document.getElementById('admin-eval-summary'),
    evalList: document.getElementById('admin-eval-list'),
    nextRoundBtn: document.getElementById('next-round-btn'),
    finishQuizBtn: document.getElementById('finish-quiz-btn'),
    resetScoresBtn: document.getElementById('reset-scores-btn'),
    resetAllBtn: document.getElementById('reset-all-btn'),
    leaderboard: document.getElementById('admin-leaderboard'),
    submittedPill: document.getElementById('admin-submitted-pill'),
    kickOfflineBtn: document.getElementById('kick-offline-btn'),
    playersList: document.getElementById('admin-players-list'),
    questionFormTitle: document.getElementById('question-form-title'),
    cancelEditQuestionBtn: document.getElementById('cancel-edit-question-btn'),
    questionForm: document.getElementById('question-form'),
    qEditId: document.getElementById('q-edit-id'),
    qTitleInput: document.getElementById('q-title-input'),
    qTextInput: document.getElementById('q-text-input'),
    qRefInput: document.getElementById('q-ref-input'),
    qCriteriaInput: document.getElementById('q-criteria-input'),
    qTimeInput: document.getElementById('q-time-input'),
    saveQuestionBtn: document.getElementById('save-question-btn'),
    questionsList: document.getElementById('questions-list'),
    settingsForm: document.getElementById('settings-form'),
    settingQuizTitle: document.getElementById('setting-quiz-title'),
    settingDefaultTime: document.getElementById('setting-default-time'),
    settingQwenKey: document.getElementById('setting-qwen-key'),
    settingKeyStatus: document.getElementById('setting-key-status'),
    settingQwenUrl: document.getElementById('setting-qwen-url'),
    settingQwenModelPreset: document.getElementById('setting-qwen-model-preset'),
    settingQwenModel: document.getElementById('setting-qwen-model'),
    testQwenBtn: document.getElementById('test-qwen-btn'),
    testQwenResult: document.getElementById('test-qwen-result'),
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

  function renderCheatBadge(leaveInfo) {
    if (!leaveInfo) return '';
    if (leaveInfo.isCurrentlyAway) {
      return `<span class="cheat-badge away-now">🔴 Вне вкладки (${leaveInfo.count} · ${leaveInfo.totalAwaySec} сек)</span>`;
    }
    if (leaveInfo.count > 0) {
      return `<span class="cheat-badge">⚠️ Выходил из вкладки: ${leaveInfo.count} (${leaveInfo.totalAwaySec} сек)</span>`;
    }
    return '';
  }

  async function apiFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (adminToken) {
      headers.Authorization = `Bearer ${adminToken}`;
    }
    const resp = await fetch(url, { ...options, headers });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 401 && url !== '/api/admin/login') {
      handleLogout();
      throw new Error('Сессия администратора истекла. Войдите снова.');
    }
    if (!resp.ok) {
      throw new Error(data.error || `Ошибка сервера (${resp.status})`);
    }
    return data;
  }

  function switchTab(tabName) {
    activeTab = tabName;
    els.tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    for (const [key, panel] of Object.entries(els.tabPanels)) {
      panel.classList.toggle('hidden', key !== tabName);
    }
  }

  const adminTimerSync = {
    active: false,
    isPaused: false,
    durationMs: 60000,
    remainingMsPaused: 0,
    endsAtPerf: 0,
    rafId: null
  };

  function applyAdminTimerDom(remMs, durationMs, isPaused) {
    const total = Math.max(1000, Number(durationMs) || 60000);
    const clampedMs = Math.max(0, Number(remMs) || 0);
    const pct = Math.max(0, Math.min(100, (clampedMs / total) * 100));
    const remSec = Math.ceil(clampedMs / 1000);

    els.timerValue.textContent = isPaused
      ? `${formatTime(remSec)} ${t('paused_suffix')}`
      : formatTime(remSec);
    els.timerBar.style.width = `${pct.toFixed(3)}%`;

    const urgent = !isPaused && clampedMs > 0 && clampedMs <= 15000;
    els.timerValue.classList.toggle('urgent', urgent);
    els.timerBar.classList.toggle('urgent', urgent);
  }

  function stopAdminTimerLoop() {
    if (adminTimerSync.rafId !== null) {
      cancelAnimationFrame(adminTimerSync.rafId);
      adminTimerSync.rafId = null;
    }
  }

  function adminTimerFrame() {
    if (!adminTimerSync.active || adminTimerSync.isPaused) {
      adminTimerSync.rafId = null;
      return;
    }
    const remMs = Math.max(0, adminTimerSync.endsAtPerf - performance.now());
    applyAdminTimerDom(remMs, adminTimerSync.durationMs, false);
    if (remMs > 0) {
      adminTimerSync.rafId = requestAnimationFrame(adminTimerFrame);
    } else {
      adminTimerSync.rafId = null;
    }
  }

  function syncAdminTimer({ remainingMs, remainingSeconds, durationSeconds, isPaused, isActive }) {
    const durMs = Math.max(1000, (Number(durationSeconds) || 60) * 1000);
    const remMs =
      typeof remainingMs === 'number'
        ? Math.max(0, remainingMs)
        : Math.max(0, (Number(remainingSeconds) || 0) * 1000);

    adminTimerSync.active = Boolean(isActive);
    adminTimerSync.isPaused = Boolean(isPaused);
    adminTimerSync.durationMs = durMs;
    adminTimerSync.remainingMsPaused = remMs;
    adminTimerSync.endsAtPerf = performance.now() + remMs;

    applyAdminTimerDom(remMs, durMs, adminTimerSync.isPaused);
    stopAdminTimerLoop();
    if (adminTimerSync.active && !adminTimerSync.isPaused && remMs > 0) {
      adminTimerSync.rafId = requestAnimationFrame(adminTimerFrame);
    }
  }

  function renderRoundSelect(state) {
    const prevValue = els.roundSelect.value;
    if (!state.questions.length) {
      els.roundSelect.innerHTML = '<option value="">Нет вопросов — добавьте во вкладке «База вопросов»</option>';
      els.startRoundBtn.disabled = true;
      return;
    }

    els.startRoundBtn.disabled = false;
    els.roundSelect.innerHTML = state.questions
      .map((q, idx) => {
        const locTitle = pickLocalized(q.title, q.titleKk);
        return `<option value="${idx}">${escapeHtml(t('round_prefix'))} ${idx + 1}: ${escapeHtml(locTitle)} (${q.timeLimit} сек)</option>`;
      })
      .join('');

    if (prevValue !== '' && Number(prevValue) < state.questions.length) {
      els.roundSelect.value = prevValue;
    } else if (state.currentRoundIndex >= 0 && state.currentRoundIndex < state.questions.length) {
      els.roundSelect.value = String(state.currentRoundIndex);
    }
  }

  function renderEvaluations(state) {
    const round = state.currentRound;
    if (!round) {
      els.evalPanel.classList.add('hidden');
      return;
    }

    const isPublished = state.status === 'ROUND_RESULTS';
    const evalData = isPublished ? round.publishedResults : round.draftResults;

    if (!evalData) {
      els.evalPanel.classList.add('hidden');
      return;
    }

    els.evalPanel.classList.remove('hidden');
    els.evalHeading.textContent = isPublished
      ? '✅ Опубликованные оценки раунда'
      : '📋 Предпросмотр оценок раунда';

    els.publishResultsBtn.classList.toggle('hidden', isPublished);

    const warnHtml = evalData.warning
      ? `<div class="alert alert-warning" style="margin-bottom:8px;">⚠️ ${escapeHtml(evalData.warning)}</div>`
      : '';
    const sourceText =
      evalData.judgeSource === 'qwen'
        ? `Модель: ${escapeHtml(evalData.modelUsed || 'Qwen')}`
        : evalData.judgeSource === 'manual'
          ? 'Ручная оценка ведущего'
          : 'Резервная автооценка';

    els.evalSummary.innerHTML = `
      ${warnHtml}
      <div><strong>Итог судьи (${sourceText}):</strong> ${escapeHtml(evalData.roundSummary)}</div>
    `;

    const tabLeaveMap = round.tabLeaveMap || {};
    const playerEmojiMap = new Map(state.players.map((p) => [p.id, p.emoji]));

    const sorted = [...evalData.evaluations].sort((a, b) => b.score - a.score);
    els.evalList.innerHTML = sorted
      .map((ev) => {
        const isBest = evalData.bestPlayerIds?.includes(ev.playerId);
        const emoji = playerEmojiMap.get(ev.playerId) || '🧠';
        const leaveInfo = tabLeaveMap[ev.playerId];
        const cheatBadge = renderCheatBadge(leaveInfo);

        return `
          <div class="eval-card ${isBest ? 'winner' : ''}">
            <div class="eval-head">
              <div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <strong>${isBest ? '👑 ' : ''}${escapeHtml(emoji)} ${escapeHtml(ev.playerName)}</strong>
                  ${cheatBadge}
                </div>
                <div class="muted" style="font-size:0.86rem; margin-top:4px;">
                  Ответ: ${ev.answer ? escapeHtml(ev.answer) : '<em>не отправлен</em>'}
                </div>
              </div>
              <div class="btn-row" style="align-items:center;">
                <input
                  type="number"
                  min="0"
                  max="100"
                  class="inline-score-input"
                  data-score-input="${escapeHtml(ev.playerId)}"
                  value="${ev.score}"
                />
                <span class="muted">б.</span>
                <button type="button" class="btn btn-danger btn-sm" data-zero-eval="${escapeHtml(ev.playerId)}" title="Обнулить баллы">
                  0 б.
                </button>
              </div>
            </div>
            <div class="btn-row" style="align-items:center;">
              <input
                type="text"
                style="flex:1; padding:7px 10px; font-size:0.88rem;"
                data-comment-input="${escapeHtml(ev.playerId)}"
                value="${escapeHtml(ev.comment)}"
              />
              <button type="button" class="btn btn-secondary btn-sm" data-save-eval="${escapeHtml(ev.playerId)}">
                Обновить
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    els.evalList.querySelectorAll('[data-save-eval]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const playerId = btn.dataset.saveEval;
        const scoreInput = els.evalList.querySelector(`[data-score-input="${playerId}"]`);
        const commentInput = els.evalList.querySelector(`[data-comment-input="${playerId}"]`);
        socket.emit(
          'admin:update_score',
          {
            playerId,
            score: Number(scoreInput?.value || 0),
            comment: commentInput?.value || ''
          },
          (res) => {
            if (!res?.ok) showToast(res?.error || 'Не удалось обновить балл', 'error');
            else showToast('Оценка участника обновлена', 'success');
          }
        );
      });
    });

    els.evalList.querySelectorAll('[data-zero-eval]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const playerId = btn.dataset.zeroEval;
        const leaveInfo = tabLeaveMap[playerId];
        const zeroComment = leaveInfo?.count > 0
          ? 'Оценка обнулена ведущим (зафиксирован выход из вкладки).'
          : 'Оценка обнулена ведущим.';
        socket.emit(
          'admin:update_score',
          {
            playerId,
            score: 0,
            comment: zeroComment
          },
          (res) => {
            if (!res?.ok) showToast(res?.error || 'Не удалось обнулить балл', 'error');
            else showToast('Баллы участника обнулены', 'success');
          }
        );
      });
    });
  }

  function renderPlayersPanel(state) {
    const round = state.currentRound;
    const players = state.players || [];

    if (round) {
      els.submittedPill.textContent = t('answered_stats', {
        submitted: round.submittedCount,
        total: round.totalPlayers
      });
    } else {
      els.submittedPill.textContent = t('players_count', { n: players.length });
    }

    const offlineCount = players.filter((p) => !p.isOnline).length;
    els.kickOfflineBtn.disabled = offlineCount === 0;

    if (!players.length) {
      els.playersList.innerHTML = '<div class="muted">Участники ещё не подключились.</div>';
      return;
    }

    els.playersList.innerHTML = players
      .map((player) => {
        const statusDot = `<span class="dot ${player.isOnline ? 'online' : 'offline'}"></span>`;
        const cheatBadge = renderCheatBadge(player.tabLeaveInfo);
        const submissionHtml = round
          ? player.submission
            ? `<div class="alert alert-success" style="margin:8px 0 0; padding:8px 10px;">
                 <strong>Ответ:</strong> ${escapeHtml(player.submission.text)}
               </div>`
            : `<div class="muted" style="margin-top:8px; font-size:0.84rem;">⏳ Ответ ещё не отправлен</div>`
          : '';

        return `
          <div class="eval-card">
            <div class="eval-head">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                ${statusDot}
                <strong>${escapeHtml(player.emoji)} ${escapeHtml(player.name)}</strong>
                <span class="pill">${player.totalScore} б.</span>
                ${cheatBadge}
              </div>
              <button type="button" class="btn btn-danger btn-sm" data-kick-player="${escapeHtml(player.id)}" title="Удалить участника">
                ✕
              </button>
            </div>
            ${submissionHtml}
          </div>
        `;
      })
      .join('');

    els.playersList.querySelectorAll('[data-kick-player]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('Удалить этого участника из игры?')) return;
        socket.emit('admin:kick_player', { playerId: btn.dataset.kickPlayer }, (res) => {
          if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
        });
      });
    });
  }

  function renderLeaderboard(state) {
    if (!state.leaderboard.length) {
      els.leaderboard.innerHTML = '<div class="muted">Участников пока нет.</div>';
      return;
    }
    els.leaderboard.innerHTML = state.leaderboard
      .map((entry, idx) => {
        const rank = idx + 1;
        const rankClass = rank <= 3 ? `r${rank}` : '';
        return `
          <div class="leader-row">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="leader-rank ${rankClass}">${rank}</div>
              <div>
                <strong>${escapeHtml(entry.emoji)} ${escapeHtml(entry.name)}</strong>
              </div>
            </div>
            <strong>${entry.totalScore} б.</strong>
          </div>
        `;
      })
      .join('');
  }

  function renderQuestionsList(state) {
    els.questionsCountTab.textContent = String(state.questions.length);

    if (!state.questions.length) {
      els.questionsList.innerHTML = '<div class="muted">Список вопросов пуст. Добавьте первый вопрос слева.</div>';
      return;
    }

    els.questionsList.innerHTML = state.questions
      .map((q, idx) => {
        const locTitle = pickLocalized(q.title, q.titleKk);
        const locQuestion = pickLocalized(q.question, q.questionKk);
        const locRef = pickLocalized(q.referenceAnswer, q.referenceAnswerKk);
        return `
          <div class="eval-card">
            <div class="eval-head">
              <div>
                <strong>${escapeHtml(t('round_prefix'))} ${idx + 1}: ${escapeHtml(locTitle)}</strong>
                <span class="pill" style="margin-left:6px;">⏱ ${q.timeLimit} сек</span>
              </div>
              <div class="btn-row">
                <button type="button" class="btn btn-secondary btn-sm" data-move-up="${escapeHtml(q.id)}" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn btn-secondary btn-sm" data-move-down="${escapeHtml(q.id)}" ${idx === state.questions.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn btn-secondary btn-sm" data-edit-q="${escapeHtml(q.id)}">✏️</button>
                <button type="button" class="btn btn-danger btn-sm" data-del-q="${escapeHtml(q.id)}">🗑</button>
              </div>
            </div>
            <div style="margin-bottom:6px;">${escapeHtml(locQuestion)}</div>
            <div class="muted" style="font-size:0.86rem;">
              <strong style="color:#6ee7b7;">Эталон:</strong> ${escapeHtml(locRef)}
            </div>
            ${
              q.criteria
                ? `<div class="muted" style="font-size:0.82rem; margin-top:4px;"><strong>Критерии Qwen:</strong> ${escapeHtml(q.criteria)}</div>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    els.questionsList.querySelectorAll('[data-edit-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = adminState.questions.find((item) => item.id === btn.dataset.editQ);
        if (!q) return;
        els.qEditId.value = q.id;
        els.qTitleInput.value = q.title;
        els.qTextInput.value = q.question;
        els.qRefInput.value = q.referenceAnswer;
        els.qCriteriaInput.value = q.criteria || '';
        els.qTimeInput.value = q.timeLimit;
        els.questionFormTitle.textContent = `Редактирование: ${q.title}`;
        els.saveQuestionBtn.textContent = '💾 Сохранить изменения';
        els.cancelEditQuestionBtn.classList.remove('hidden');
        els.qTitleInput.focus();
      });
    });

    els.questionsList.querySelectorAll('[data-del-q]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить этот вопрос?')) return;
        try {
          await apiFetch(`/api/admin/questions/${btn.dataset.delQ}`, { method: 'DELETE' });
          showToast('Вопрос удалён', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    const handleMove = async (id, direction) => {
      try {
        await apiFetch(`/api/admin/questions/${id}/move`, {
          method: 'POST',
          body: JSON.stringify({ direction })
        });
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    els.questionsList.querySelectorAll('[data-move-up]').forEach((btn) => {
      btn.addEventListener('click', () => handleMove(btn.dataset.moveUp, 'up'));
    });
    els.questionsList.querySelectorAll('[data-move-down]').forEach((btn) => {
      btn.addEventListener('click', () => handleMove(btn.dataset.moveDown, 'down'));
    });
  }

  function syncSettingsUI(settings, force = false) {
    if (settings.hasApiKey) {
      els.settingKeyStatus.className = 'pill pill-success';
      els.settingKeyStatus.textContent = `Установлен (${settings.maskedApiKey})`;
    } else {
      els.settingKeyStatus.className = 'pill pill-danger';
      els.settingKeyStatus.textContent = 'Не задан';
    }

    if (settingsInitialized && !force) return;
    settingsInitialized = true;

    els.settingQuizTitle.value = settings.quizTitle || '';
    els.settingDefaultTime.value = settings.defaultTimeLimit || 30;
    els.settingQwenUrl.value = settings.qwenBaseUrl || '';
    els.settingQwenModel.value = settings.qwenModel || 'qwen-plus';

    const presets = ['qwen-plus', 'qwen-max', 'qwen-turbo'];
    els.settingQwenModelPreset.value = presets.includes(settings.qwenModel) ? settings.qwenModel : 'custom';
  }

  function renderAdminState(state) {
    adminState = state;
    document.title = t('page_title_admin');
    els.quizTitle.textContent =
      pickLocalized(state.settings.quizTitle, state.settings.quizTitleKk) || t('admin_header_title');
    els.statusLine.textContent = `${t('status_prefix')} ${getPhaseLabel(state.status)}`;
    els.playersPill.textContent = t('online_stats', {
      online: state.onlinePlayersCount,
      total: state.totalPlayersCount
    });
    els.phasePill.textContent = getPhaseLabel(state.status);

    renderRoundSelect(state);

    const round = state.currentRound;
    if (!round) {
      stopAdminTimerLoop();
      els.roundPanel.classList.add('hidden');
      els.evalPanel.classList.add('hidden');
    } else {
      const fullQ = state.questions.find((q) => q.id === round.questionId);
      const locTitle = pickLocalized(round.title, fullQ?.titleKk);
      const locQuestion = pickLocalized(round.question, fullQ?.questionKk);
      const locRef = pickLocalized(round.referenceAnswer, fullQ?.referenceAnswerKk);

      els.roundPanel.classList.remove('hidden');
      els.roundTitle.textContent = `${t('round_prefix')} ${round.roundNumber}: ${locTitle}`;
      els.questionText.textContent = locQuestion;
      els.referenceAnswer.textContent = locRef;
      syncAdminTimer({
        remainingMs: round.remainingMs,
        remainingSeconds: round.remainingSeconds,
        durationSeconds: round.durationSeconds,
        isPaused: round.isPaused,
        isActive: state.status === 'ROUND_ACTIVE'
      });

      const isActive = state.status === 'ROUND_ACTIVE';
      const isLocked = state.status === 'ROUND_LOCKED';
      const isJudging = state.status === 'JUDGING';

      els.activeControls.classList.toggle('hidden', !isActive);
      els.pauseRoundBtn.textContent = round.isPaused ? t('resume_btn') : t('pause_btn');
      els.lockedControls.classList.toggle('hidden', !isLocked);
      els.judgingSpinner.classList.toggle('hidden', !isJudging);
      if (isActive || isJudging) {
        els.judgeError.classList.add('hidden');
      }
    }

    const hasNextRound =
      state.currentRoundIndex >= 0 && state.currentRoundIndex + 1 < state.questions.length;
    const showNextBtn =
      hasNextRound && (state.status === 'ROUND_RESULTS' || state.status === 'ROUND_LOCKED');
    els.nextRoundBtn.classList.toggle('hidden', !showNextBtn);
    if (showNextBtn) {
      els.nextRoundBtn.textContent = `⏭ Запустить раунд ${state.currentRoundIndex + 2}`;
    }

    renderEvaluations(state);
    renderPlayersPanel(state);
    renderLeaderboard(state);
    renderQuestionsList(state);
    syncSettingsUI(state.settings, false);
  }

  function resetQuestionForm() {
    els.qEditId.value = '';
    els.questionForm.reset();
    els.qTimeInput.value = adminState?.settings?.defaultTimeLimit || 30;
    els.questionFormTitle.textContent = 'Добавить новый вопрос';
    els.saveQuestionBtn.textContent = '➕ Добавить вопрос';
    els.cancelEditQuestionBtn.classList.add('hidden');
  }

  function connectAdminSocket() {
    if (socket) {
      socket.disconnect();
    }

    socket = io({
      auth: { role: 'admin', token: adminToken },
      reconnection: true,
      reconnectionDelay: 1000
    });

    socket.on('admin:state', (state) => {
      renderAdminState(state);
    });

    socket.on('game:timer', (tick) => {
      if (adminState && adminState.status === 'ROUND_ACTIVE') {
        syncAdminTimer({
          remainingMs: tick.remainingMs,
          remainingSeconds: tick.remainingSeconds,
          durationSeconds: tick.durationSeconds,
          isPaused: tick.isPaused,
          isActive: true
        });
      }
    });

    socket.on('admin:auth_error', () => {
      handleLogout();
      showToast('Авторизация администратора недействительна.', 'error');
    });
  }

  function enterAdminApp() {
    els.loginScreen.classList.add('hidden');
    els.adminApp.classList.remove('hidden');
    connectAdminSocket();
  }

  function handleLogout() {
    adminToken = '';
    localStorage.removeItem(TOKEN_KEY);
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    els.adminApp.classList.add('hidden');
    els.loginScreen.classList.remove('hidden');
  }

  // ========================
  // Event Listeners
  // ========================

  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.loginError.classList.add('hidden');

    try {
      const data = await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          login: els.loginInput.value.trim(),
          password: els.passwordInput.value
        })
      });
      adminToken = data.token;
      localStorage.setItem(TOKEN_KEY, adminToken);
      els.passwordInput.value = '';
      enterAdminApp();
    } catch (err) {
      els.loginError.textContent = err.message;
      els.loginError.classList.remove('hidden');
    }
  });

  els.logoutBtn.addEventListener('click', handleLogout);

  els.copyStudentLinkBtn.addEventListener('click', async () => {
    const url = `${window.location.origin}/`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Ссылка скопирована: ${url}`, 'success');
    } catch {
      prompt('Скопируйте ссылку для участников:', url);
    }
  });

  els.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  els.startRoundBtn.addEventListener('click', () => {
    const idx = Number(els.roundSelect.value);
    els.judgeError.classList.add('hidden');
    socket.emit('admin:start_round', { questionIndex: idx }, (res) => {
      if (!res?.ok) showToast(res?.error || 'Не удалось запустить раунд', 'error');
      else showToast(`Раунд ${idx + 1} запущен!`, 'success');
    });
  });

  els.nextRoundBtn.addEventListener('click', () => {
    if (!adminState) return;
    const nextIdx = adminState.currentRoundIndex + 1;
    els.judgeError.classList.add('hidden');
    socket.emit('admin:start_round', { questionIndex: nextIdx }, (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка запуска раунда', 'error');
    });
  });

  els.pauseRoundBtn.addEventListener('click', () => {
    socket.emit('admin:toggle_pause', (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка паузы', 'error');
    });
  });

  els.addTimeBtn.addEventListener('click', () => {
    socket.emit('admin:add_time', { seconds: 30 }, (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка добавления времени', 'error');
      else showToast('Добавлено +30 секунд', 'success');
    });
  });

  els.lockRoundBtn.addEventListener('click', () => {
    socket.emit('admin:lock_round', (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
    });
  });

  els.reopenRoundBtn.addEventListener('click', () => {
    socket.emit('admin:reopen_round', { seconds: 30 }, (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
      else showToast('Приём ответов открыт ещё на 30 сек', 'success');
    });
  });

  els.judgeQwenBtn.addEventListener('click', () => {
    els.judgeError.classList.add('hidden');
    socket.emit('admin:judge_round', {}, (res) => {
      if (res?.ok) {
        showToast('ИИ Qwen оценил ответы участников! Проверьте и опубликуйте.', 'success');
        return;
      }

      const msg = res?.error || 'Неизвестная ошибка Qwen API';
      els.judgeError.innerHTML = `
        <div><strong>Ошибка обращения к Qwen API:</strong> ${escapeHtml(msg)}</div>
        <div class="btn-row" style="margin-top: 10px;">
          <button type="button" class="btn btn-warning btn-sm" id="btn-apply-fallback">
            ⚙️ Применить резервную автооценку
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-apply-manual">
            ✍️ Заполнить баллы вручную
          </button>
        </div>
      `;
      els.judgeError.classList.remove('hidden');

      document.getElementById('btn-apply-fallback')?.addEventListener('click', () => {
        socket.emit('admin:judge_round', { useFallback: true, reason: msg }, (fbRes) => {
          if (fbRes?.ok) {
            els.judgeError.classList.add('hidden');
            showToast('Применена резервная оценка близости.', 'success');
          }
        });
      });

      document.getElementById('btn-apply-manual')?.addEventListener('click', () => {
        socket.emit('admin:manual_draft', (mRes) => {
          if (mRes?.ok) {
            els.judgeError.classList.add('hidden');
            showToast('Открыт ручной ввод оценок.', 'success');
          }
        });
      });
    });
  });

  els.manualJudgeBtn.addEventListener('click', () => {
    els.judgeError.classList.add('hidden');
    socket.emit('admin:manual_draft', (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
    });
  });

  els.publishResultsBtn.addEventListener('click', () => {
    socket.emit('admin:publish_results', (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка публикации', 'error');
      else showToast('Результаты раунда опубликованы участникам!', 'success');
    });
  });

  els.finishQuizBtn.addEventListener('click', () => {
    if (!confirm('Завершить квиз и показать финальный пьедестал всем участникам?')) return;
    socket.emit('admin:finish_quiz', (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
    });
  });

  els.resetScoresBtn.addEventListener('click', () => {
    if (!confirm('Сбросить все баллы и начать игру заново (участники останутся)?')) return;
    socket.emit('admin:reset_quiz', { keepPlayers: true }, (res) => {
      if (res?.ok) showToast('Очки сброшены, игра возвращена в лобби', 'success');
    });
  });

  els.resetAllBtn.addEventListener('click', () => {
    if (!confirm('Полностью сбросить игру и удалить всех участников?')) return;
    socket.emit('admin:reset_quiz', { keepPlayers: false }, (res) => {
      if (res?.ok) showToast('Игра полностью сброшена', 'success');
    });
  });

  els.kickOfflineBtn.addEventListener('click', () => {
    if (!confirm('Удалить всех отключённых (офлайн) участников?')) return;
    socket.emit('admin:kick_offline', (res) => {
      if (!res?.ok) {
        showToast(res?.error || 'Ошибка удаления участников', 'error');
        return;
      }
      showToast(`Удалено офлайн-участников: ${res.count}`, 'success');
    });
  });

  // Questions CRUD
  els.cancelEditQuestionBtn.addEventListener('click', resetQuestionForm);

  els.questionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = els.qEditId.value;
    const payload = {
      title: els.qTitleInput.value.trim(),
      question: els.qTextInput.value.trim(),
      referenceAnswer: els.qRefInput.value.trim(),
      criteria: els.qCriteriaInput.value.trim(),
      timeLimit: Number(els.qTimeInput.value) || 30
    };

    try {
      if (editId) {
        await apiFetch(`/api/admin/questions/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Вопрос обновлён!', 'success');
      } else {
        await apiFetch('/api/admin/questions', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Новый вопрос добавлен!', 'success');
      }
      resetQuestionForm();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Settings
  els.settingQwenModelPreset.addEventListener('change', () => {
    const val = els.settingQwenModelPreset.value;
    if (val !== 'custom') {
      els.settingQwenModel.value = val;
    } else {
      els.settingQwenModel.focus();
    }
  });

  els.settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      quizTitle: els.settingQuizTitle.value.trim(),
      defaultTimeLimit: Number(els.settingDefaultTime.value) || 30,
      qwenBaseUrl: els.settingQwenUrl.value.trim(),
      qwenModel: els.settingQwenModel.value.trim()
    };
    const newKey = els.settingQwenKey.value.trim();
    if (newKey) {
      payload.qwenApiKey = newKey;
    }

    try {
      const data = await apiFetch('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      els.settingQwenKey.value = '';
      syncSettingsUI(data.settings, true);
      showToast('Настройки сохранены!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  els.testQwenBtn.addEventListener('click', async () => {
    els.testQwenResult.className = 'alert alert-warning';
    els.testQwenResult.textContent = 'Проверка подключения к Qwen API...';
    els.testQwenResult.classList.remove('hidden');

    try {
      const data = await apiFetch('/api/admin/test-qwen', {
        method: 'POST',
        body: JSON.stringify({
          qwenApiKey: els.settingQwenKey.value.trim(),
          qwenBaseUrl: els.settingQwenUrl.value.trim(),
          qwenModel: els.settingQwenModel.value.trim()
        })
      });
      els.testQwenResult.className = 'alert alert-success';
      els.testQwenResult.textContent = `✅ Успешно! Модель ${data.model} ответила за ${data.elapsedMs} мс: «${data.reply}»`;
    } catch (err) {
      els.testQwenResult.className = 'alert alert-danger';
      els.testQwenResult.textContent = `❌ Ошибка подключения: ${err.message}`;
    }
  });

  initLangSwitcher(() => {
    document.title = t('page_title_admin');
    if (adminState) {
      renderAdminState(adminState);
    }
  });

  // Boot
  (async () => {
    if (!adminToken) return;
    try {
      await apiFetch('/api/admin/verify');
      enterAdminApp();
    } catch {
      handleLogout();
    }
  })();
})();
