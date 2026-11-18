(() => {
  const STORAGE_ID_KEY = 'qwen_quiz_player_id';
  const STORAGE_TOKEN_KEY = 'qwen_quiz_player_token';
  const STORAGE_NAME_KEY = 'qwen_quiz_player_name';
  const { t, pickLocalized, initLangSwitcher } = window.QuizI18n;

  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
  });

  let currentState = null;
  let isConnected = false;
  let selectedEmoji = '🚀';
  let lastRoundKey = null;
  let captainDirty = false;

  const els = {
    quizTitle: document.getElementById('quiz-title'),
    connectionStatus: document.getElementById('connection-status'),
    playerMeta: document.getElementById('player-meta'),
    screens: {
      login: document.getElementById('screen-login'),
      teamSelect: document.getElementById('screen-team-select'),
      lobby: document.getElementById('screen-lobby'),
      round: document.getElementById('screen-round'),
      results: document.getElementById('screen-results'),
      finished: document.getElementById('screen-finished')
    },
    loginForm: document.getElementById('login-form'),
    playerNameInput: document.getElementById('player-name-input'),
    createTeamForm: document.getElementById('create-team-form'),
    newTeamName: document.getElementById('new-team-name'),
    emojiPicker: document.getElementById('emoji-picker'),
    teamsCountPill: document.getElementById('teams-count-pill'),
    availableTeamsList: document.getElementById('available-teams-list'),
    myTeamLobbyCard: document.getElementById('my-team-lobby-card'),
    lobbyTeamsCount: document.getElementById('lobby-teams-count'),
    lobbyTeamsList: document.getElementById('lobby-teams-list'),
    roundHeading: document.getElementById('round-heading'),
    roundTeamPill: document.getElementById('round-team-pill'),
    roundTimerLabel: document.getElementById('round-timer-label'),
    roundTimerValue: document.getElementById('round-timer-value'),
    roundTimerBar: document.getElementById('round-timer-bar'),
    roundQuestionText: document.getElementById('round-question-text'),
    roundStatusBanner: document.getElementById('round-status-banner'),
    captainPanel: document.getElementById('captain-panel'),
    captainSubmittedBanner: document.getElementById('captain-submitted-banner'),
    captainAnswerForm: document.getElementById('captain-answer-form'),
    captainAnswerInput: document.getElementById('captain-answer-input'),
    captainSubmitBtn: document.getElementById('captain-submit-btn'),
    memberPanel: document.getElementById('member-panel'),
    memberOfficialStatus: document.getElementById('member-official-status'),
    memberIdeaForm: document.getElementById('member-idea-form'),
    memberIdeaInput: document.getElementById('member-idea-input'),
    ideasCountPill: document.getElementById('ideas-count-pill'),
    captainNoteFormWrap: document.getElementById('captain-note-form-wrap'),
    captainIdeaForm: document.getElementById('captain-idea-form'),
    captainIdeaInput: document.getElementById('captain-idea-input'),
    teamIdeasFeed: document.getElementById('team-ideas-feed'),
    resultsRoundTitle: document.getElementById('results-round-title'),
    resultsJudgeBadge: document.getElementById('results-judge-badge'),
    resultsReferenceAnswer: document.getElementById('results-reference-answer'),
    resultsSummary: document.getElementById('results-summary'),
    resultsEvaluations: document.getElementById('results-evaluations'),
    resultsLeaderboard: document.getElementById('results-leaderboard'),
    finalLeaderboard: document.getElementById('final-leaderboard'),
    finalHistory: document.getElementById('final-history'),
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
    setTimeout(() => {
      div.remove();
    }, 4000);
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

  function renderTimer(remainingSeconds, durationSeconds, isPaused) {
    const total = Math.max(1, Number(durationSeconds) || 60);
    const rem = Math.max(0, Number(remainingSeconds) || 0);
    const pct = Math.max(0, Math.min(100, (rem / total) * 100));

    els.roundTimerValue.textContent = isPaused
      ? `${formatTime(rem)} ${t('paused_suffix')}`
      : formatTime(rem);
    els.roundTimerLabel.textContent = isPaused ? t('timer_paused_label') : t('time_left');
    els.roundTimerBar.style.width = `${pct}%`;

    const isUrgent = !isPaused && rem > 0 && rem <= 15;
    els.roundTimerValue.classList.toggle('urgent', isUrgent);
    els.roundTimerBar.classList.toggle('urgent', isUrgent);
  }

  function renderTopBar(state) {
    document.title = t('page_title_student');
    els.quizTitle.textContent = pickLocalized(state.quizTitle, state.quizTitleKk) || t('default_quiz_title');
    updateConnectionLabel();

    if (!state.player) {
      els.playerMeta.innerHTML = '';
      return;
    }

    const parts = [
      `<span class="pill"><span class="dot online"></span>${escapeHtml(state.player.name)}</span>`
    ];
    if (state.myTeam) {
      parts.push(
        `<span class="pill pill-primary">${escapeHtml(state.myTeam.emoji)} ${escapeHtml(state.myTeam.name)} · ${state.myTeam.totalScore} ${escapeHtml(t('pts_short'))}</span>`
      );
    }
    parts.push(
      `<button type="button" class="btn btn-secondary btn-sm" id="logout-player-btn">${escapeHtml(t('change_name'))}</button>`
    );
    els.playerMeta.innerHTML = parts.join('');

    const logoutBtn = document.getElementById('logout-player-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_ID_KEY);
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        localStorage.removeItem(STORAGE_NAME_KEY);
        window.location.reload();
      });
    }
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
        renderEmojiPicker(emojis);
      });
    });
  }

  function renderTeamsList(container, teams, { allowJoin = false, myTeamId = null } = {}) {
    if (!teams.length) {
      container.innerHTML = `<div class="muted">${escapeHtml(t('no_teams_yet'))}</div>`;
      return;
    }

    container.innerHTML = teams
      .map((team) => {
        const isMine = team.id === myTeamId;
        const memberNames = team.members
          .map(
            (m) =>
              `${m.isCaptain ? '👑 ' : ''}${escapeHtml(m.name)}${m.isOnline ? '' : ` ${escapeHtml(t('offline_tag'))}`}`
          )
          .join(', ');

        const actionHtml = allowJoin
          ? `<button type="button" class="btn btn-sm ${isMine ? 'btn-secondary' : ''}" data-join-team="${escapeHtml(team.id)}" ${isMine ? 'disabled' : ''}>${escapeHtml(isMine ? t('your_team_btn') : t('join_btn'))}</button>`
          : `<span class="pill">${team.memberCount} ${escapeHtml(t('members_short'))} · ${team.totalScore} ${escapeHtml(t('pts_short'))}</span>`;

        return `
          <div class="team-item">
            <div class="team-item-left">
              <div class="team-emoji">${escapeHtml(team.emoji)}</div>
              <div>
                <div class="team-name">${escapeHtml(team.name)}</div>
                <div class="muted" style="font-size: 0.82rem;">
                  ${team.memberCount} ${escapeHtml(t('members_short'))}: ${memberNames || escapeHtml(t('nobody_yet'))}
                </div>
              </div>
            </div>
            <div>${actionHtml}</div>
          </div>
        `;
      })
      .join('');

    if (allowJoin) {
      container.querySelectorAll('[data-join-team]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const teamId = btn.dataset.joinTeam;
          socket.emit('student:join_team', { teamId }, (res) => {
            if (!res?.ok) {
              showToast(res?.error || t('toast_join_err'), 'error');
            } else {
              showToast(t('toast_joined'), 'success');
            }
          });
        });
      });
    }
  }

  function renderMyTeamLobby(state) {
    const team = state.myTeam;
    const membersHtml = team.members
      .map(
        (m) => `
          <span class="member-chip">
            <span class="dot ${m.isOnline ? 'online' : 'offline'}"></span>
            ${m.isCaptain ? '👑 ' : ''}${escapeHtml(m.name)}
          </span>
        `
      )
      .join('');

    els.myTeamLobbyCard.innerHTML = `
      <div class="card-title">
        <span>${escapeHtml(t('your_team_title', { emoji: team.emoji, name: team.name }))}</span>
        <span class="pill ${team.isCaptain ? 'pill-success' : 'pill-primary'}">
          ${escapeHtml(team.isCaptain ? t('role_captain') : t('role_member'))}
        </span>
      </div>
      <p class="muted" style="margin-top: 0;">
        ${escapeHtml(team.isCaptain ? t('captain_hint') : t('member_hint'))}
      </p>
      <div class="member-chips">${membersHtml}</div>
      <div style="margin-top: 14px;">
        <button type="button" class="btn btn-secondary btn-sm" id="leave-team-btn">${escapeHtml(t('leave_team_btn'))}</button>
      </div>
    `;

    const leaveBtn = document.getElementById('leave-team-btn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => {
        socket.emit('student:leave_team', (res) => {
          if (!res?.ok) showToast(res?.error || t('toast_leave_err'), 'error');
        });
      });
    }
  }

  function renderRoundScreen(state) {
    const round = state.currentRound;
    const team = state.myTeam;
    if (!round || !team) return;

    const roundKey = `${round.roundNumber}_${round.title}`;
    if (lastRoundKey !== roundKey) {
      lastRoundKey = roundKey;
      captainDirty = false;
      els.captainAnswerInput.value = team.submission?.text || '';
      els.memberIdeaInput.value = '';
    } else if (!captainDirty && team.submission?.text && !els.captainAnswerInput.value) {
      els.captainAnswerInput.value = team.submission.text;
    }

    const locTitle = pickLocalized(round.title, round.titleKk);
    const locQuestion = pickLocalized(round.question, round.questionKk);

    els.roundHeading.textContent = t('round_heading', {
      num: round.roundNumber,
      total: round.totalQuestions,
      title: locTitle
    });
    els.roundTeamPill.textContent = `${team.emoji} ${team.name}`;
    els.roundQuestionText.textContent = locQuestion;

    renderTimer(round.remainingSeconds, round.durationSeconds, round.isPaused);

    const isActive = state.status === 'ROUND_ACTIVE';
    const isLocked = state.status === 'ROUND_LOCKED';
    const isJudging = state.status === 'JUDGING';

    if (isActive) {
      els.roundStatusBanner.classList.add('hidden');
    } else if (isLocked) {
      els.roundStatusBanner.className = 'alert alert-warning';
      els.roundStatusBanner.innerHTML = `${escapeHtml(t('round_locked_msg'))} ${
        team.submission
          ? `${escapeHtml(t('your_team_final_ans'))} <strong>${escapeHtml(team.submission.text)}</strong>`
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

    els.captainPanel.classList.toggle('hidden', !(isActive && team.isCaptain));
    els.memberPanel.classList.toggle('hidden', !(isActive && !team.isCaptain));
    els.captainNoteFormWrap.classList.toggle('hidden', !(isActive && team.isCaptain));

    if (team.isCaptain) {
      if (team.submission) {
        els.captainSubmittedBanner.innerHTML = `${escapeHtml(t('captain_submitted_banner'))} <strong>${escapeHtml(team.submission.text)}</strong> ${escapeHtml(t('can_update_before_end'))}`;
        els.captainSubmittedBanner.classList.remove('hidden');
        els.captainSubmitBtn.textContent = t('update_final_btn');
      } else {
        els.captainSubmittedBanner.classList.add('hidden');
        els.captainSubmitBtn.textContent = t('send_final_btn');
      }
    } else {
      if (team.submission) {
        els.memberOfficialStatus.className = 'alert alert-success';
        els.memberOfficialStatus.innerHTML = `${escapeHtml(t('member_official_sent'))} <strong>${escapeHtml(team.submission.text)}</strong>`;
      } else {
        els.memberOfficialStatus.className = 'alert alert-warning';
        els.memberOfficialStatus.textContent = t('member_official_waiting');
      }
    }

    const ideas = team.ideas || [];
    els.ideasCountPill.textContent = String(ideas.length);
    if (!ideas.length) {
      els.teamIdeasFeed.innerHTML = `<div class="muted">${escapeHtml(t('no_ideas_yet'))}</div>`;
    } else {
      els.teamIdeasFeed.innerHTML = [...ideas]
        .reverse()
        .map(
          (idea) => `
            <div class="idea-card">
              <div>
                <div class="idea-author">${escapeHtml(idea.playerName)}</div>
                <div class="idea-text">${escapeHtml(idea.text)}</div>
              </div>
              ${
                isActive && team.isCaptain
                  ? `<button type="button" class="btn btn-sm btn-secondary use-idea-btn" data-idea-text="${escapeHtml(idea.text)}">${escapeHtml(t('use_idea_btn'))}</button>`
                  : ''
              }
            </div>
          `
        )
        .join('');

      if (isActive && team.isCaptain) {
        els.teamIdeasFeed.querySelectorAll('.use-idea-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            els.captainAnswerInput.value = btn.dataset.ideaText;
            captainDirty = true;
            els.captainAnswerInput.focus();
            showToast(t('toast_idea_inserted'));
          });
        });
      }
    }
  }

  function scoreClass(score) {
    if (score >= 75) return 'score-high';
    if (score >= 40) return 'score-mid';
    return 'score-low';
  }

  function renderLeaderboard(container, leaderboard, myTeamId) {
    if (!leaderboard || !leaderboard.length) {
      container.innerHTML = `<div class="muted">${escapeHtml(t('leaderboard_empty'))}</div>`;
      return;
    }

    container.innerHTML = leaderboard
      .map((team, idx) => {
        const rank = idx + 1;
        const rankClass = rank <= 3 ? `r${rank}` : '';
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        const isMine = team.id === myTeamId;
        return `
          <div class="leader-row" style="${isMine ? 'border-color: var(--primary);' : ''}">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="leader-rank ${rankClass}">${medal}</div>
              <div>
                <div style="font-weight:700;">
                  ${escapeHtml(team.emoji)} ${escapeHtml(team.name)}
                  ${isMine ? `<span class="pill pill-primary" style="margin-left:6px;">${escapeHtml(t('you_pill'))}</span>` : ''}
                </div>
                <div class="muted" style="font-size:0.8rem;">${team.memberCount} ${escapeHtml(t('members_short'))}</div>
              </div>
            </div>
            <div style="font-weight:800; font-size:1.05rem;">${team.totalScore} ${escapeHtml(t('pts_short'))}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderResultsScreen(state) {
    const round = state.currentRound;
    const res = state.roundResults;
    if (!round || !res) return;

    const locTitle = pickLocalized(round.title, round.titleKk);
    const locRefAnswer = pickLocalized(res.referenceAnswer, res.referenceAnswerKk);

    els.resultsRoundTitle.textContent = t('results_title', {
      num: round.roundNumber,
      title: locTitle
    });
    const sourceLabel =
      res.judgeSource === 'qwen'
        ? t('judge_qwen', { model: res.modelUsed || 'Qwen AI' })
        : res.judgeSource === 'manual'
          ? t('judge_manual')
          : t('judge_fallback');
    els.resultsJudgeBadge.textContent = sourceLabel;

    els.resultsReferenceAnswer.textContent = locRefAnswer;
    els.resultsSummary.innerHTML = `<strong>${escapeHtml(t('judge_verdict_label'))}</strong> ${escapeHtml(res.roundSummary)}`;

    const myTeamId = state.myTeam?.id;
    els.resultsEvaluations.innerHTML = res.evaluations
      .map((ev) => {
        const isMine = ev.teamId === myTeamId;
        return `
          <div class="eval-card ${ev.isWinner ? 'winner' : ''}">
            <div class="eval-head">
              <div style="font-weight:700;">
                ${ev.isWinner ? '👑 ' : ''}${escapeHtml(ev.emoji)} ${escapeHtml(ev.teamName)}
                ${isMine ? `<span class="pill pill-primary" style="margin-left:6px;">${escapeHtml(t('your_team_pill'))}</span>` : ''}
              </div>
              <span class="score-badge ${scoreClass(ev.score)}">${ev.score} / 100</span>
            </div>
            <div style="margin-bottom:6px; font-size:0.93rem;">
              <span class="muted">${escapeHtml(t('answer_label'))}</span>
              ${ev.answer ? `<strong>${escapeHtml(ev.answer)}</strong>` : `<span class="muted">${escapeHtml(t('no_answer_label'))}</span>`}
            </div>
            <div class="muted" style="font-size:0.9rem;">
              💬 ${escapeHtml(ev.comment)}
            </div>
          </div>
        `;
      })
      .join('');

    renderLeaderboard(els.resultsLeaderboard, state.leaderboard, myTeamId);
  }

  function renderFinishedScreen(state) {
    renderLeaderboard(els.finalLeaderboard, state.leaderboard, state.myTeam?.id);

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

  function render(state) {
    currentState = state;
    renderTopBar(state);

    if (!state.player) {
      showOnlyScreen('login');
      return;
    }

    if (!state.myTeam) {
      showOnlyScreen('teamSelect');
      renderEmojiPicker(state.availableEmojis);
      els.teamsCountPill.textContent = t('teams_count', { n: state.teams.length });
      renderTeamsList(els.availableTeamsList, state.teams, { allowJoin: true });
      return;
    }

    if (state.status === 'LOBBY') {
      showOnlyScreen('lobby');
      renderMyTeamLobby(state);
      els.lobbyTeamsCount.textContent = t('teams_count', { n: state.teams.length });
      renderTeamsList(els.lobbyTeamsList, state.teams, {
        allowJoin: false,
        myTeamId: state.myTeam.id
      });
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
      showOnlyScreen('results');
      renderResultsScreen(state);
      return;
    }

    if (state.status === 'FINISHED') {
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

  els.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.playerNameInput.value.trim();
    if (!name) return;

    const existingId = localStorage.getItem(STORAGE_ID_KEY) || undefined;
    const existingToken = localStorage.getItem(STORAGE_TOKEN_KEY) || undefined;
    socket.emit(
      'student:register',
      { playerId: existingId, playerToken: existingToken, name },
      (res) => {
        if (!res?.ok) {
          showToast(res?.error || t('toast_login_err'), 'error');
          return;
        }
        localStorage.setItem(STORAGE_ID_KEY, res.playerId);
        if (res.playerToken) {
          localStorage.setItem(STORAGE_TOKEN_KEY, res.playerToken);
        }
        localStorage.setItem(STORAGE_NAME_KEY, name);
        if (res.state) render(res.state);
      }
    );
  });

  els.createTeamForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.newTeamName.value.trim();
    if (!name) return;

    socket.emit('student:create_team', { name, emoji: selectedEmoji }, (res) => {
      if (!res?.ok) {
        showToast(res?.error || t('toast_create_team_err'), 'error');
        return;
      }
      els.newTeamName.value = '';
      showToast(t('toast_team_created'), 'success');
    });
  });

  els.captainAnswerInput.addEventListener('input', () => {
    captainDirty = true;
  });

  els.captainAnswerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.captainAnswerInput.value.trim();
    if (!text) {
      showToast(t('toast_enter_answer'), 'error');
      return;
    }
    socket.emit('student:submit_answer', { text }, (res) => {
      if (!res?.ok) {
        showToast(res?.error || t('toast_send_err'), 'error');
        return;
      }
      captainDirty = false;
      showToast(t('toast_answer_sent'), 'success');
    });
  });

  els.memberIdeaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.memberIdeaInput.value.trim();
    if (!text) return;

    socket.emit('student:submit_idea', { text }, (res) => {
      if (!res?.ok) {
        showToast(res?.error || t('toast_idea_err'), 'error');
        return;
      }
      els.memberIdeaInput.value = '';
      showToast(t('toast_idea_sent'), 'success');
    });
  });

  els.captainIdeaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.captainIdeaInput.value.trim();
    if (!text) return;

    socket.emit('student:submit_idea', { text }, (res) => {
      if (!res?.ok) {
        showToast(res?.error || t('toast_idea_err'), 'error');
        return;
      }
      els.captainIdeaInput.value = '';
    });
  });

  // ========================
  // Socket Lifecycle
  // ========================

  socket.on('connect', () => {
    isConnected = true;
    updateConnectionLabel();
    const savedId = localStorage.getItem(STORAGE_ID_KEY);
    const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
    const savedName = localStorage.getItem(STORAGE_NAME_KEY);
    if (savedId && savedToken && savedName) {
      els.playerNameInput.value = savedName;
      socket.emit(
        'student:register',
        { playerId: savedId, playerToken: savedToken, name: savedName },
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
      renderTimer(tick.remainingSeconds, tick.durationSeconds, tick.isPaused);
    }
  });

  socket.on('student:kicked', () => {
    localStorage.removeItem(STORAGE_ID_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    showToast(t('toast_kicked'), 'error');
  });
})();
