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
    teamsPill: document.getElementById('admin-teams-pill'),
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
    teamsList: document.getElementById('admin-teams-list'),
    unassignedCard: document.getElementById('admin-unassigned-card'),
    unassignedList: document.getElementById('admin-unassigned-list'),
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

  function renderAdminTimer(remainingSeconds, durationSeconds, isPaused) {
    const total = Math.max(1, Number(durationSeconds) || 60);
    const rem = Math.max(0, Number(remainingSeconds) || 0);
    const pct = Math.max(0, Math.min(100, (rem / total) * 100));

    els.timerValue.textContent = isPaused ? `${formatTime(rem)} (ПАУЗА)` : formatTime(rem);
    els.timerBar.style.width = `${pct}%`;

    const urgent = !isPaused && rem > 0 && rem <= 15;
    els.timerValue.classList.toggle('urgent', urgent);
    els.timerBar.classList.toggle('urgent', urgent);
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
      ? '✅ Опубликованные оценки (видны студентам)'
      : '📋 Предпросмотр оценок (ещё не видны студентам)';

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

    const sorted = [...evalData.evaluations].sort((a, b) => b.score - a.score);
    els.evalList.innerHTML = sorted
      .map((ev) => {
        const isBest = evalData.bestTeamIds?.includes(ev.teamId);
        return `
          <div class="eval-card ${isBest ? 'winner' : ''}">
            <div class="eval-head">
              <div>
                <strong>${isBest ? '👑 ' : ''}${escapeHtml(ev.teamName)}</strong>
                <div class="muted" style="font-size:0.86rem;">
                  Ответ: ${ev.answer ? escapeHtml(ev.answer) : '<em>не отправлен</em>'}
                </div>
              </div>
              <div class="btn-row" style="align-items:center;">
                <input
                  type="number"
                  min="0"
                  max="100"
                  class="inline-score-input"
                  data-score-input="${escapeHtml(ev.teamId)}"
                  value="${ev.score}"
                />
                <span class="muted">б.</span>
              </div>
            </div>
            <div class="btn-row" style="align-items:center;">
              <input
                type="text"
                style="flex:1; padding:7px 10px; font-size:0.88rem;"
                data-comment-input="${escapeHtml(ev.teamId)}"
                value="${escapeHtml(ev.comment)}"
              />
              <button type="button" class="btn btn-secondary btn-sm" data-save-eval="${escapeHtml(ev.teamId)}">
                Обновить
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    els.evalList.querySelectorAll('[data-save-eval]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const teamId = btn.dataset.saveEval;
        const scoreInput = els.evalList.querySelector(`[data-score-input="${teamId}"]`);
        const commentInput = els.evalList.querySelector(`[data-comment-input="${teamId}"]`);
        socket.emit(
          'admin:update_score',
          {
            teamId,
            score: Number(scoreInput?.value || 0),
            comment: commentInput?.value || ''
          },
          (res) => {
            if (!res?.ok) showToast(res?.error || 'Не удалось обновить балл', 'error');
            else showToast('Оценка команды обновлена', 'success');
          }
        );
      });
    });
  }

  function renderTeamsPanel(state) {
    const round = state.currentRound;
    if (round) {
      els.submittedPill.textContent = t('answered_stats', {
        submitted: round.submittedCount,
        total: round.totalTeams
      });
    } else {
      els.submittedPill.textContent = t('teams_count', { n: state.teams.length });
    }

    if (!state.teams.length) {
      els.teamsList.innerHTML = '<div class="muted">Студенты ещё не создали ни одной команды.</div>';
    } else {
      els.teamsList.innerHTML = state.teams
        .map((team) => {
          const membersHtml = team.members
            .map((m) => {
              const capBadge = m.isCaptain ? '👑 ' : '';
              const statusDot = `<span class="dot ${m.isOnline ? 'online' : 'offline'}"></span>`;
              const makeCapBtn = !m.isCaptain
                ? `<button type="button" class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.72rem;" data-make-captain="${escapeHtml(team.id)}" data-player-id="${escapeHtml(m.id)}" title="Сделать капитаном">👑</button>`
                : '';
              const kickBtn = `<button type="button" class="btn btn-danger btn-sm" style="padding:2px 6px; font-size:0.72rem;" data-kick-player="${escapeHtml(m.id)}" title="Удалить игрока">✕</button>`;

              return `
                <span class="member-chip">
                  ${statusDot}
                  ${capBadge}${escapeHtml(m.name)}
                  ${makeCapBtn}
                  ${kickBtn}
                </span>
              `;
            })
            .join('');

          const submissionHtml = round
            ? team.submission
              ? `<div class="alert alert-success" style="margin:8px 0 0; padding:8px 10px;">
                   <strong>Ответ:</strong> ${escapeHtml(team.submission.text)}
                   <div class="muted" style="font-size:0.76rem;">Отправил: ${escapeHtml(team.submission.submittedBy)} · Идей в чате: ${team.ideasCount}</div>
                 </div>`
              : `<div class="muted" style="margin-top:8px; font-size:0.84rem;">⏳ Ответ ещё не отправлен · Идей в чате: ${team.ideasCount}</div>`
            : '';

          return `
            <div class="eval-card">
              <div class="eval-head">
                <div style="font-weight:700;">
                  ${escapeHtml(team.emoji)} ${escapeHtml(team.name)}
                  <span class="pill" style="margin-left:6px;">${team.totalScore} б.</span>
                </div>
                <button type="button" class="btn btn-danger btn-sm" data-delete-team="${escapeHtml(team.id)}">Удалить</button>
              </div>
              <div class="member-chips">${membersHtml || '<span class="muted">Нет участников</span>'}</div>
              ${submissionHtml}
            </div>
          `;
        })
        .join('');

      els.teamsList.querySelectorAll('[data-make-captain]').forEach((btn) => {
        btn.addEventListener('click', () => {
          socket.emit(
            'admin:set_captain',
            { teamId: btn.dataset.makeCaptain, playerId: btn.dataset.playerId },
            (res) => {
              if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
              else showToast('Капитан команды изменён', 'success');
            }
          );
        });
      });

      els.teamsList.querySelectorAll('[data-kick-player]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!confirm('Удалить этого участника из игры?')) return;
          socket.emit('admin:kick_player', { playerId: btn.dataset.kickPlayer }, (res) => {
            if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
          });
        });
      });

      els.teamsList.querySelectorAll('[data-delete-team]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!confirm('Удалить эту команду? Участники останутся без команды.')) return;
          socket.emit('admin:delete_team', { teamId: btn.dataset.deleteTeam }, (res) => {
            if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
          });
        });
      });
    }

    if (!state.unassignedPlayers.length) {
      els.unassignedCard.classList.add('hidden');
    } else {
      els.unassignedCard.classList.remove('hidden');
      els.unassignedList.innerHTML = `<div class="member-chips">${state.unassignedPlayers
        .map(
          (p) => `
            <span class="member-chip">
              <span class="dot ${p.isOnline ? 'online' : 'offline'}"></span>
              ${escapeHtml(p.name)}
              <button type="button" class="btn btn-danger btn-sm" style="padding:2px 6px; font-size:0.72rem;" data-kick-unassigned="${escapeHtml(p.id)}">✕</button>
            </span>
          `
        )
        .join('')}</div>`;

      els.unassignedList.querySelectorAll('[data-kick-unassigned]').forEach((btn) => {
        btn.addEventListener('click', () => {
          socket.emit('admin:kick_player', { playerId: btn.dataset.kickUnassigned });
        });
      });
    }
  }

  function renderLeaderboard(state) {
    if (!state.leaderboard.length) {
      els.leaderboard.innerHTML = '<div class="muted">Команд пока нет.</div>';
      return;
    }
    els.leaderboard.innerHTML = state.leaderboard
      .map((team, idx) => {
        const rank = idx + 1;
        const rankClass = rank <= 3 ? `r${rank}` : '';
        return `
          <div class="leader-row">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="leader-rank ${rankClass}">${rank}</div>
              <div>
                <strong>${escapeHtml(team.emoji)} ${escapeHtml(team.name)}</strong>
                <span class="muted" style="font-size:0.8rem;"> (${team.memberCount} уч.)</span>
              </div>
            </div>
            <strong>${team.totalScore} б.</strong>
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
      .map(
        (q, idx) => {
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
        }
      )
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
    els.settingDefaultTime.value = settings.defaultTimeLimit || 90;
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
    els.teamsPill.textContent = `🏁 ${t('teams_count', { n: state.teams.length })}`;
    els.phasePill.textContent = getPhaseLabel(state.status);

    renderRoundSelect(state);

    const round = state.currentRound;
    if (!round) {
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
      renderAdminTimer(round.remainingSeconds, round.durationSeconds, round.isPaused);

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
    renderTeamsPanel(state);
    renderLeaderboard(state);
    renderQuestionsList(state);
    syncSettingsUI(state.settings, false);
  }

  function resetQuestionForm() {
    els.qEditId.value = '';
    els.questionForm.reset();
    els.qTimeInput.value = adminState?.settings?.defaultTimeLimit || 90;
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
        renderAdminTimer(tick.remainingSeconds, tick.durationSeconds, tick.isPaused);
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
      prompt('Скопируйте ссылку для студентов:', url);
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
        showToast('ИИ Qwen оценил ответы команд! Проверьте и опубликуйте.', 'success');
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
      else showToast('Результаты раунда опубликованы студентам!', 'success');
    });
  });

  els.finishQuizBtn.addEventListener('click', () => {
    if (!confirm('Завершить квиз и показать финальный пьедестал всем участникам?')) return;
    socket.emit('admin:finish_quiz', (res) => {
      if (!res?.ok) showToast(res?.error || 'Ошибка', 'error');
    });
  });

  els.resetScoresBtn.addEventListener('click', () => {
    if (!confirm('Сбросить все баллы и начать игру заново (команды останутся)?')) return;
    socket.emit('admin:reset_quiz', { keepTeams: true }, (res) => {
      if (res?.ok) showToast('Очки сброшены, игра возвращена в лобби', 'success');
    });
  });

  els.resetAllBtn.addEventListener('click', () => {
    if (!confirm('Полностью сбросить игру и удалить все команды?')) return;
    socket.emit('admin:reset_quiz', { keepTeams: false }, (res) => {
      if (res?.ok) showToast('Игра полностью сброшена', 'success');
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
      timeLimit: Number(els.qTimeInput.value) || 90
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
      defaultTimeLimit: Number(els.settingDefaultTime.value) || 90,
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
