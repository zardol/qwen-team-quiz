const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DEFAULT_QWEN_BASE_URL, DEFAULT_QWEN_MODEL } = require('./qwenJudge');

const DATA_FILE = path.join(__dirname, '..', 'data', 'quiz-data.json');

const GAME_STATUS = {
  LOBBY: 'LOBBY',
  ROUND_ACTIVE: 'ROUND_ACTIVE',
  ROUND_LOCKED: 'ROUND_LOCKED',
  JUDGING: 'JUDGING',
  ROUND_RESULTS: 'ROUND_RESULTS',
  FINISHED: 'FINISHED'
};

const TEAM_EMOJIS = ['🚀', '🦉', '⚡', '🦊', '🔥', '🧠', '🌟', '🐉', '🎯', '🦁', '🛸', '💎'];

function generateId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function maskApiKey(key) {
  if (!key || key.length < 8) return key ? '****' : '';
  return `${key.slice(0, 5)}••••${key.slice(-4)}`;
}

function tokensMatch(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

class QuizGameManager {
  constructor() {
    this.status = GAME_STATUS.LOBBY;
    this.players = new Map(); // playerId -> { id, token, name, teamId, isOnline, socketIds: Set, joinedAt }
    this.teams = new Map();   // teamId -> { id, name, emoji, captainId, roundScores: {}, totalScore, createdAt }
    this.questions = [];
    this.settings = {
      quizTitle: 'Интерактивный квиз по философии',
      quizTitleKk: 'Философия бойынша интерактивті квиз',
      qwenBaseUrl: process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL,
      qwenModel: process.env.QWEN_MODEL || DEFAULT_QWEN_MODEL,
      defaultTimeLimit: 90
    };
    this.runtimeApiKey = (process.env.QWEN_API_KEY || '').trim();

    this.currentRoundIndex = -1;
    this.roundRecords = new Map(); // roundIndex -> roundRecord
    this.timerInterval = null;
    this.onStateChanged = null; // callback () => void

    this.loadFromDisk();
  }

  setChangeHandler(handler) {
    this.onStateChanged = handler;
  }

  notifyChanged() {
    if (typeof this.onStateChanged === 'function') {
      this.onStateChanged();
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.settings) {
          this.settings = {
            quizTitle: parsed.settings.quizTitle || this.settings.quizTitle,
            quizTitleKk: parsed.settings.quizTitleKk || this.settings.quizTitleKk,
            qwenBaseUrl: process.env.QWEN_BASE_URL || parsed.settings.qwenBaseUrl || DEFAULT_QWEN_BASE_URL,
            qwenModel: process.env.QWEN_MODEL || parsed.settings.qwenModel || DEFAULT_QWEN_MODEL,
            defaultTimeLimit: Number(parsed.settings.defaultTimeLimit) || 90
          };
        }
        if (Array.isArray(parsed.questions)) {
          this.questions = parsed.questions.map((q, idx) => this.normalizeQuestion(q, idx));
        }
      }
    } catch (err) {
      console.error('Ошибка чтения quiz-data.json:', err.message);
    }
  }

  saveToDisk() {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const payload = {
        settings: this.settings,
        questions: this.questions
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error('Ошибка сохранения quiz-data.json:', err.message);
    }
  }

  normalizeQuestion(q, index = 0) {
    return {
      id: q.id ? String(q.id) : generateId('q'),
      title: String(q.title || `Вопрос ${index + 1}`).trim(),
      titleKk: String(q.titleKk || '').trim(),
      question: String(q.question || '').trim(),
      questionKk: String(q.questionKk || '').trim(),
      referenceAnswer: String(q.referenceAnswer || '').trim(),
      referenceAnswerKk: String(q.referenceAnswerKk || '').trim(),
      criteria: String(q.criteria || '').trim(),
      timeLimit: Math.max(15, Math.min(600, Number(q.timeLimit) || this.settings.defaultTimeLimit || 90))
    };
  }

  // ========================
  // Questions & Settings CRUD
  // ========================

  getQuestions() {
    return this.questions;
  }

  addQuestion(data) {
    if (!data?.question?.trim() || !data?.referenceAnswer?.trim()) {
      throw new Error('Текст вопроса и эталонный ответ обязательны.');
    }
    const q = this.normalizeQuestion(data, this.questions.length);
    this.questions.push(q);
    this.saveToDisk();
    this.notifyChanged();
    return q;
  }

  updateQuestion(questionId, data) {
    const idx = this.questions.findIndex((q) => q.id === questionId);
    if (idx === -1) throw new Error('Вопрос не найден.');
    if (!data?.question?.trim() || !data?.referenceAnswer?.trim()) {
      throw new Error('Текст вопроса и эталонный ответ обязательны.');
    }
    const updated = this.normalizeQuestion({ ...this.questions[idx], ...data, id: questionId }, idx);
    this.questions[idx] = updated;

    // Also update active round snapshot if editing the currently selected round before judging
    const activeRecord = this.roundRecords.get(idx);
    if (activeRecord && !activeRecord.publishedResults) {
      activeRecord.title = updated.title;
      activeRecord.titleKk = updated.titleKk;
      activeRecord.question = updated.question;
      activeRecord.questionKk = updated.questionKk;
      activeRecord.referenceAnswer = updated.referenceAnswer;
      activeRecord.referenceAnswerKk = updated.referenceAnswerKk;
      activeRecord.criteria = updated.criteria;
      activeRecord.timeLimit = updated.timeLimit;
    }

    this.saveToDisk();
    this.notifyChanged();
    return updated;
  }

  deleteQuestion(questionId) {
    const idx = this.questions.findIndex((q) => q.id === questionId);
    if (idx === -1) throw new Error('Вопрос не найден.');
    if (this.status === GAME_STATUS.ROUND_ACTIVE && this.currentRoundIndex === idx) {
      throw new Error('Нельзя удалить вопрос, который сейчас активен в раунде.');
    }
    this.questions.splice(idx, 1);
    this.saveToDisk();
    this.notifyChanged();
  }

  moveQuestion(questionId, direction) {
    const idx = this.questions.findIndex((q) => q.id === questionId);
    if (idx === -1) throw new Error('Вопрос не найден.');
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= this.questions.length) return this.questions;
    const [item] = this.questions.splice(idx, 1);
    this.questions.splice(targetIdx, 0, item);
    this.saveToDisk();
    this.notifyChanged();
    return this.questions;
  }

  getAdminSettings() {
    return {
      quizTitle: this.settings.quizTitle,
      quizTitleKk: this.settings.quizTitleKk,
      qwenBaseUrl: this.settings.qwenBaseUrl,
      qwenModel: this.settings.qwenModel,
      defaultTimeLimit: this.settings.defaultTimeLimit,
      hasApiKey: Boolean(this.runtimeApiKey),
      maskedApiKey: maskApiKey(this.runtimeApiKey)
    };
  }

  getQwenRuntimeConfig() {
    return {
      apiKey: this.runtimeApiKey,
      baseUrl: this.settings.qwenBaseUrl,
      model: this.settings.qwenModel
    };
  }

  updateAdminSettings(payload) {
    if (typeof payload.quizTitle === 'string' && payload.quizTitle.trim()) {
      this.settings.quizTitle = payload.quizTitle.trim();
    }
    if (typeof payload.quizTitleKk === 'string' && payload.quizTitleKk.trim()) {
      this.settings.quizTitleKk = payload.quizTitleKk.trim();
    }
    if (typeof payload.qwenBaseUrl === 'string' && payload.qwenBaseUrl.trim()) {
      this.settings.qwenBaseUrl = payload.qwenBaseUrl.trim();
    }
    if (typeof payload.qwenModel === 'string' && payload.qwenModel.trim()) {
      this.settings.qwenModel = payload.qwenModel.trim();
    }
    if (payload.defaultTimeLimit !== undefined) {
      const val = Number(payload.defaultTimeLimit);
      if (Number.isFinite(val) && val >= 15 && val <= 600) {
        this.settings.defaultTimeLimit = Math.round(val);
      }
    }
    if (typeof payload.qwenApiKey === 'string' && payload.qwenApiKey.trim()) {
      this.runtimeApiKey = payload.qwenApiKey.trim();
    }
    this.saveToDisk();
    this.notifyChanged();
    return this.getAdminSettings();
  }

  // ========================
  // Players & Teams
  // ========================

  registerOrReconnectPlayer({ playerId, playerToken, name, socketId }) {
    const cleanName = String(name || '').trim().slice(0, 32);
    const existing = playerId ? this.players.get(playerId) : null;

    if (existing && tokensMatch(playerToken, existing.token)) {
      if (cleanName) existing.name = cleanName;
      existing.isOnline = true;
      existing.socketIds.add(socketId);
      if (existing.teamId && !this.teams.has(existing.teamId)) {
        existing.teamId = null;
      }
      this.notifyChanged();
      return existing;
    }

    if (!cleanName) {
      throw new Error('Введите ваше имя.');
    }

    const newId = generateId('p');
    const player = {
      id: newId,
      token: crypto.randomBytes(16).toString('hex'),
      name: cleanName,
      teamId: null,
      isOnline: true,
      socketIds: new Set([socketId]),
      joinedAt: Date.now()
    };
    this.players.set(newId, player);
    this.notifyChanged();
    return player;
  }

  handleSocketDisconnect(socketId) {
    let changed = false;
    for (const player of this.players.values()) {
      if (player.socketIds.has(socketId)) {
        player.socketIds.delete(socketId);
        if (player.socketIds.size === 0) {
          player.isOnline = false;
          changed = true;
        }
      }
    }
    if (changed) {
      this.notifyChanged();
    }
  }

  renamePlayer(playerId, newName) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('Игрок не найден.');
    const clean = String(newName || '').trim().slice(0, 32);
    if (!clean) throw new Error('Имя не может быть пустым.');
    player.name = clean;
    this.notifyChanged();
    return player;
  }

  createTeam(playerId, { name, emoji }) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('Сначала войдите, указав своё имя.');

    const cleanName = String(name || '').trim().slice(0, 36);
    if (cleanName.length < 2) {
      throw new Error('Название команды должно содержать минимум 2 символа.');
    }

    for (const t of this.teams.values()) {
      if (t.name.toLowerCase() === cleanName.toLowerCase()) {
        throw new Error('Команда с таким названием уже существует.');
      }
    }

    if (player.teamId) {
      this._detachPlayerFromTeam(player);
    }

    const chosenEmoji = TEAM_EMOJIS.includes(emoji)
      ? emoji
      : TEAM_EMOJIS[this.teams.size % TEAM_EMOJIS.length];

    const team = {
      id: generateId('team'),
      name: cleanName,
      emoji: chosenEmoji,
      captainId: player.id,
      roundScores: {},
      totalScore: 0,
      createdAt: Date.now()
    };

    this.teams.set(team.id, team);
    player.teamId = team.id;
    this.notifyChanged();
    return team;
  }

  joinTeam(playerId, teamId) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('Сначала войдите, указав своё имя.');

    const team = this.teams.get(teamId);
    if (!team) throw new Error('Команда не найдена.');

    if (player.teamId === teamId) {
      return team;
    }

    if (player.teamId) {
      this._detachPlayerFromTeam(player);
    }

    player.teamId = team.id;
    if (!team.captainId || !this.players.has(team.captainId)) {
      team.captainId = player.id;
    }

    this.notifyChanged();
    return team;
  }

  leaveTeam(playerId) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('Игрок не найден.');
    if (!player.teamId) return;

    this._detachPlayerFromTeam(player);
    this.notifyChanged();
  }

  _detachPlayerFromTeam(player) {
    const oldTeamId = player.teamId;
    player.teamId = null;
    if (!oldTeamId) return;

    const team = this.teams.get(oldTeamId);
    if (!team) return;

    const remaining = this.getTeamMembers(oldTeamId);
    if (remaining.length === 0) {
      if (this.status === GAME_STATUS.LOBBY && team.totalScore === 0) {
        this.teams.delete(oldTeamId);
      } else {
        team.captainId = null;
      }
      return;
    }

    if (team.captainId === player.id) {
      const onlineFirst = remaining.find((m) => m.isOnline) || remaining[0];
      team.captainId = onlineFirst.id;
    }
  }

  setTeamCaptain(teamId, newCaptainId) {
    const team = this.teams.get(teamId);
    if (!team) throw new Error('Команда не найдена.');
    const member = this.players.get(newCaptainId);
    if (!member || member.teamId !== teamId) {
      throw new Error('Выбранный игрок не состоит в этой команде.');
    }
    team.captainId = newCaptainId;
    this.notifyChanged();
    return team;
  }

  deleteTeam(teamId) {
    const team = this.teams.get(teamId);
    if (!team) throw new Error('Команда не найдена.');
    for (const player of this.players.values()) {
      if (player.teamId === teamId) {
        player.teamId = null;
      }
    }
    this.teams.delete(teamId);
    const currentRound = this.getCurrentRound();
    if (currentRound) {
      currentRound.submissions.delete(teamId);
      currentRound.ideas.delete(teamId);
    }
    this.notifyChanged();
  }

  kickPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('Участник не найден.');
    if (player.teamId) {
      this._detachPlayerFromTeam(player);
    }
    this.players.delete(playerId);
    this.notifyChanged();
  }

  getTeamMembers(teamId) {
    const members = [];
    for (const player of this.players.values()) {
      if (player.teamId === teamId) {
        members.push(player);
      }
    }
    members.sort((a, b) => a.joinedAt - b.joinedAt);
    return members;
  }

  recalculateTeamTotal(team) {
    let sum = 0;
    for (const val of Object.values(team.roundScores)) {
      sum += Number(val) || 0;
    }
    team.totalScore = sum;
  }

  // ========================
  // Round & Answer Mechanics
  // ========================

  getCurrentRound() {
    if (this.currentRoundIndex < 0) return null;
    return this.roundRecords.get(this.currentRoundIndex) || null;
  }

  startRound(questionIndex) {
    const idx = Number(questionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.questions.length) {
      throw new Error('Некорректный номер раунда.');
    }

    this.stopTimer();
    const q = this.questions[idx];
    const now = Date.now();
    const duration = q.timeLimit || this.settings.defaultTimeLimit || 90;

    const existing = this.roundRecords.get(idx);
    const record = {
      roundNumber: idx + 1,
      roundIndex: idx,
      questionId: q.id,
      title: q.title,
      titleKk: q.titleKk || '',
      question: q.question,
      questionKk: q.questionKk || '',
      referenceAnswer: q.referenceAnswer,
      referenceAnswerKk: q.referenceAnswerKk || '',
      criteria: q.criteria,
      timeLimit: duration,
      durationSeconds: duration,
      startedAt: now,
      endsAt: now + duration * 1000,
      isPaused: false,
      remainingOnPause: duration,
      submissions: existing ? existing.submissions : new Map(),
      ideas: existing ? existing.ideas : new Map(),
      draftResults: null,
      publishedResults: null
    };

    // Clear previous round scores if restarting this same round
    for (const team of this.teams.values()) {
      if (Object.prototype.hasOwnProperty.call(team.roundScores, idx)) {
        delete team.roundScores[idx];
        this.recalculateTeamTotal(team);
      }
    }
    if (existing) {
      record.submissions.clear();
      record.ideas.clear();
    }

    this.roundRecords.set(idx, record);
    this.currentRoundIndex = idx;
    this.status = GAME_STATUS.ROUND_ACTIVE;

    this._startTimerInterval();
    this.notifyChanged();
    return record;
  }

  _startTimerInterval() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      const round = this.getCurrentRound();
      if (!round || this.status !== GAME_STATUS.ROUND_ACTIVE || round.isPaused) {
        return;
      }
      if (Date.now() >= round.endsAt) {
        this.lockRound();
      }
    }, 500);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getRemainingMs(round) {
    if (!round) return 0;
    if (this.status !== GAME_STATUS.ROUND_ACTIVE) return 0;
    if (round.isPaused) return Math.max(0, Math.round(round.remainingOnPause * 1000));
    return Math.max(0, round.endsAt - Date.now());
  }

  getRemainingSeconds(round) {
    return Math.ceil(this.getRemainingMs(round) / 1000);
  }

  togglePauseRound() {
    const round = this.getCurrentRound();
    if (!round || this.status !== GAME_STATUS.ROUND_ACTIVE) {
      throw new Error('Сейчас нет активного раунда.');
    }
    if (round.isPaused) {
      round.endsAt = Date.now() + round.remainingOnPause * 1000;
      round.isPaused = false;
    } else {
      round.remainingOnPause = Math.max(0, (round.endsAt - Date.now()) / 1000);
      round.isPaused = true;
    }
    this.notifyChanged();
    return round;
  }

  addTimeToRound(seconds = 30) {
    const round = this.getCurrentRound();
    if (!round || this.status !== GAME_STATUS.ROUND_ACTIVE) {
      throw new Error('Время можно добавлять только во время активного раунда.');
    }
    const delta = Number(seconds) || 30;
    round.durationSeconds += delta;
    if (round.isPaused) {
      round.remainingOnPause = Math.max(5, round.remainingOnPause + delta);
    } else {
      round.endsAt = Math.max(Date.now() + 5000, round.endsAt + delta * 1000);
    }
    this.notifyChanged();
    return round;
  }

  lockRound() {
    if (this.status !== GAME_STATUS.ROUND_ACTIVE) return;
    this.stopTimer();
    const round = this.getCurrentRound();
    if (round) {
      round.isPaused = false;
      round.remainingOnPause = 0;
    }
    this.status = GAME_STATUS.ROUND_LOCKED;
    this.notifyChanged();
  }

  reopenRound(extraSeconds = 30) {
    const round = this.getCurrentRound();
    if (!round || this.status !== GAME_STATUS.ROUND_LOCKED) {
      throw new Error('Повторно открыть можно только завершённый раунд до публикации результатов.');
    }
    const seconds = Math.max(10, Number(extraSeconds) || 30);
    round.endsAt = Date.now() + seconds * 1000;
    round.durationSeconds = seconds;
    round.isPaused = false;
    this.status = GAME_STATUS.ROUND_ACTIVE;
    this._startTimerInterval();
    this.notifyChanged();
  }

  submitIdea(playerId, text) {
    const player = this.players.get(playerId);
    if (!player || !player.teamId) {
      throw new Error('Вы не состоите в команде.');
    }
    if (this.status !== GAME_STATUS.ROUND_ACTIVE) {
      throw new Error('Приём предложений доступен только во время активного раунда.');
    }
    const round = this.getCurrentRound();
    if (!round) throw new Error('Активный раунд не найден.');

    const cleanText = String(text || '').trim().slice(0, 400);
    if (!cleanText) {
      throw new Error('Введите текст идеи перед отправкой.');
    }

    if (!round.ideas.has(player.teamId)) {
      round.ideas.set(player.teamId, []);
    }
    const list = round.ideas.get(player.teamId);
    const idea = {
      id: generateId('idea'),
      playerId: player.id,
      playerName: player.name,
      text: cleanText,
      timestamp: Date.now()
    };
    list.push(idea);
    if (list.length > 50) {
      list.shift();
    }

    this.notifyChanged();
    return idea;
  }

  submitTeamAnswer(playerId, text) {
    const player = this.players.get(playerId);
    if (!player || !player.teamId) {
      throw new Error('Вы не состоите в команде.');
    }
    const team = this.teams.get(player.teamId);
    if (!team) throw new Error('Команда не найдена.');

    if (team.captainId !== player.id) {
      throw new Error('Отправлять итоговый ответ команды может только капитан.');
    }
    if (this.status !== GAME_STATUS.ROUND_ACTIVE) {
      throw new Error('Время приёма ответов уже завершено.');
    }

    const round = this.getCurrentRound();
    if (!round) throw new Error('Активный раунд не найден.');

    const cleanText = String(text || '').trim().slice(0, 800);
    if (!cleanText) {
      throw new Error('Ответ команды не может быть пустым.');
    }

    const submission = {
      text: cleanText,
      updatedAt: Date.now(),
      submittedBy: player.name
    };
    round.submissions.set(team.id, submission);

    this.notifyChanged();
    return submission;
  }

  // ========================
  // Judging & Results
  // ========================

  getTeamAnswersForJudging() {
    const round = this.getCurrentRound();
    if (!round) throw new Error('Нет выбранного раунда.');

    const teamAnswers = [];
    for (const team of this.teams.values()) {
      const sub = round.submissions.get(team.id);
      teamAnswers.push({
        teamId: team.id,
        teamName: team.name,
        answer: sub ? sub.text : ''
      });
    }
    return teamAnswers;
  }

  setJudgingStatus(isJudging) {
    if (isJudging) {
      this.stopTimer();
      this.status = GAME_STATUS.JUDGING;
    } else if (this.status === GAME_STATUS.JUDGING) {
      this.status = GAME_STATUS.ROUND_LOCKED;
    }
    this.notifyChanged();
  }

  setDraftResults(evaluationResult) {
    const round = this.getCurrentRound();
    if (!round) throw new Error('Раунд не найден.');
    round.draftResults = evaluationResult;
    this.status = GAME_STATUS.ROUND_LOCKED;
    this.notifyChanged();
    return round.draftResults;
  }

  createManualDraftResults() {
    const round = this.getCurrentRound();
    if (!round) throw new Error('Раунд не найден.');

    const evaluations = Array.from(this.teams.values()).map((team) => {
      const sub = round.submissions.get(team.id);
      const ans = sub ? sub.text : '';
      return {
        teamId: team.id,
        teamName: team.name,
        answer: ans,
        score: 0,
        comment: ans
          ? 'Оценка выставлена ведущим вручную.'
          : 'Команда не отправила ответ в этом раунде.'
      };
    });

    round.draftResults = {
      evaluations,
      bestTeamIds: [],
      roundSummary: 'Оценка раунда выставлена ведущим вручную.',
      judgeSource: 'manual',
      modelUsed: 'manual'
    };
    this.status = GAME_STATUS.ROUND_LOCKED;
    this.notifyChanged();
    return round.draftResults;
  }

  updateEvaluationScore({ teamId, score, comment }) {
    const round = this.getCurrentRound();
    if (!round) throw new Error('Раунд не найден.');

    const target = this.status === GAME_STATUS.ROUND_RESULTS
      ? round.publishedResults
      : round.draftResults;

    if (!target) {
      throw new Error('Сначала запустите оценку раунда.');
    }

    const entry = target.evaluations.find((e) => e.teamId === teamId);
    if (!entry) throw new Error('Команда в результатах не найдена.');

    const clamped = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    entry.score = clamped;
    if (typeof comment === 'string') {
      entry.comment = comment.trim();
    }

    const withAnswers = target.evaluations.filter((e) => e.score > 0 && e.answer);
    if (withAnswers.length > 0) {
      const maxScore = Math.max(...withAnswers.map((e) => e.score));
      target.bestTeamIds = withAnswers.filter((e) => e.score === maxScore).map((e) => e.teamId);
    } else {
      target.bestTeamIds = [];
    }

    if (this.status === GAME_STATUS.ROUND_RESULTS) {
      const team = this.teams.get(teamId);
      if (team) {
        team.roundScores[round.roundIndex] = clamped;
        this.recalculateTeamTotal(team);
      }
    }

    this.notifyChanged();
    return target;
  }

  publishRoundResults() {
    const round = this.getCurrentRound();
    if (!round) throw new Error('Раунд не найден.');
    if (!round.draftResults) {
      throw new Error('Нет результатов для публикации. Сначала оцените раунд.');
    }

    const results = JSON.parse(JSON.stringify(round.draftResults));
    for (const ev of results.evaluations) {
      const team = this.teams.get(ev.teamId);
      if (team) {
        team.roundScores[round.roundIndex] = Number(ev.score) || 0;
        this.recalculateTeamTotal(team);
      }
    }

    round.publishedResults = results;
    this.status = GAME_STATUS.ROUND_RESULTS;
    this.notifyChanged();
    return results;
  }

  finishQuiz() {
    this.stopTimer();
    this.status = GAME_STATUS.FINISHED;
    this.notifyChanged();
  }

  resetQuiz({ keepTeams = false } = {}) {
    this.stopTimer();
    this.status = GAME_STATUS.LOBBY;
    this.currentRoundIndex = -1;
    this.roundRecords.clear();

    if (keepTeams) {
      for (const team of this.teams.values()) {
        team.roundScores = {};
        team.totalScore = 0;
      }
    } else {
      this.teams.clear();
      for (const player of this.players.values()) {
        player.teamId = null;
      }
    }

    this.notifyChanged();
  }

  // ========================
  // State Serialization
  // ========================

  getLeaderboard() {
    const list = Array.from(this.teams.values()).map((team) => ({
      id: team.id,
      name: team.name,
      emoji: team.emoji,
      totalScore: team.totalScore,
      memberCount: this.getTeamMembers(team.id).length
    }));
    list.sort((a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name, 'ru'));
    return list;
  }

  serializePublicTeams(currentRound) {
    return Array.from(this.teams.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((team) => {
        const members = this.getTeamMembers(team.id).map((m) => ({
          name: m.name,
          isOnline: m.isOnline,
          isCaptain: m.id === team.captainId
        }));
        const hasSubmitted = currentRound ? currentRound.submissions.has(team.id) : false;
        return {
          id: team.id,
          name: team.name,
          emoji: team.emoji,
          totalScore: team.totalScore,
          memberCount: members.length,
          members,
          hasSubmitted
        };
      });
  }

  buildStudentStateForPlayer(playerId, { isSpectator = false } = {}) {
    const player = playerId ? this.players.get(playerId) : null;
    const round = this.getCurrentRound();
    const myTeam = player?.teamId ? this.teams.get(player.teamId) : null;

    let publicRound = null;
    if (round) {
      const showAnswer =
        this.status === GAME_STATUS.ROUND_RESULTS || this.status === GAME_STATUS.FINISHED;
      const hideQuestionForSpectator = isSpectator && !showAnswer;
      publicRound = {
        roundNumber: round.roundNumber,
        totalQuestions: this.questions.length,
        title: hideQuestionForSpectator ? '' : round.title,
        titleKk: hideQuestionForSpectator ? '' : (round.titleKk || ''),
        question: hideQuestionForSpectator ? '' : round.question,
        questionKk: hideQuestionForSpectator ? '' : (round.questionKk || ''),
        timeLimit: round.timeLimit,
        durationSeconds: round.durationSeconds,
        remainingSeconds: this.getRemainingSeconds(round),
        remainingMs: this.getRemainingMs(round),
        isPaused: round.isPaused,
        referenceAnswer: showAnswer ? round.referenceAnswer : null,
        referenceAnswerKk: showAnswer ? (round.referenceAnswerKk || '') : null
      };
    }

    let myTeamData = null;
    if (myTeam) {
      const members = this.getTeamMembers(myTeam.id).map((m) => ({
        name: m.name,
        isOnline: m.isOnline,
        isCaptain: m.id === myTeam.captainId
      }));
      const submission = round ? round.submissions.get(myTeam.id) || null : null;
      const ideas = round ? round.ideas.get(myTeam.id) || [] : [];
      myTeamData = {
        id: myTeam.id,
        name: myTeam.name,
        emoji: myTeam.emoji,
        isCaptain: myTeam.captainId === player.id,
        totalScore: myTeam.totalScore,
        members,
        submission,
        ideas: ideas.map((i) => ({
          id: i.id,
          playerName: i.playerName,
          text: i.text,
          timestamp: i.timestamp
        }))
      };
    }

    let roundResults = null;
    if (this.status === GAME_STATUS.ROUND_RESULTS && round?.publishedResults) {
      const teamLookup = new Map(
        Array.from(this.teams.values()).map((t) => [t.id, t])
      );
      roundResults = {
        ...round.publishedResults,
        referenceAnswer: round.referenceAnswer,
        referenceAnswerKk: round.referenceAnswerKk || '',
        evaluations: [...round.publishedResults.evaluations]
          .map((ev) => ({
            ...ev,
            emoji: teamLookup.get(ev.teamId)?.emoji || '🏳️',
            isWinner: round.publishedResults.bestTeamIds.includes(ev.teamId)
          }))
          .sort((a, b) => b.score - a.score)
      };
    }

    const roundHistory = [];
    if (this.status === GAME_STATUS.FINISHED) {
      for (const rec of this.roundRecords.values()) {
        if (rec.publishedResults) {
          roundHistory.push({
            roundNumber: rec.roundNumber,
            title: rec.title,
            titleKk: rec.titleKk || '',
            question: rec.question,
            questionKk: rec.questionKk || '',
            referenceAnswer: rec.referenceAnswer,
            referenceAnswerKk: rec.referenceAnswerKk || '',
            roundSummary: rec.publishedResults.roundSummary,
            bestTeamIds: rec.publishedResults.bestTeamIds
          });
        }
      }
      roundHistory.sort((a, b) => a.roundNumber - b.roundNumber);
    }

    return {
      status: this.status,
      quizTitle: this.settings.quizTitle,
      quizTitleKk: this.settings.quizTitleKk || '',
      totalQuestions: this.questions.length,
      player: player
        ? {
            id: player.id,
            name: player.name,
            teamId: player.teamId
          }
        : null,
      myTeam: myTeamData,
      teams: this.serializePublicTeams(round),
      currentRound: publicRound,
      roundResults,
      leaderboard: this.getLeaderboard(),
      roundHistory,
      availableEmojis: TEAM_EMOJIS
    };
  }

  buildAdminState() {
    const round = this.getCurrentRound();

    const adminTeams = Array.from(this.teams.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((team) => {
        const members = this.getTeamMembers(team.id).map((m) => ({
          id: m.id,
          name: m.name,
          isOnline: m.isOnline,
          isCaptain: m.id === team.captainId
        }));
        const submission = round ? round.submissions.get(team.id) || null : null;
        const ideas = round ? round.ideas.get(team.id) || [] : [];
        return {
          id: team.id,
          name: team.name,
          emoji: team.emoji,
          captainId: team.captainId,
          totalScore: team.totalScore,
          roundScores: team.roundScores,
          members,
          submission,
          ideasCount: ideas.length
        };
      });

    const unassignedPlayers = Array.from(this.players.values())
      .filter((p) => !p.teamId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        isOnline: p.isOnline
      }));

    let currentRoundData = null;
    if (round) {
      currentRoundData = {
        roundIndex: round.roundIndex,
        roundNumber: round.roundNumber,
        questionId: round.questionId,
        title: round.title,
        question: round.question,
        referenceAnswer: round.referenceAnswer,
        criteria: round.criteria,
        timeLimit: round.timeLimit,
        durationSeconds: round.durationSeconds,
        remainingSeconds: this.getRemainingSeconds(round),
        remainingMs: this.getRemainingMs(round),
        isPaused: round.isPaused,
        submittedCount: round.submissions.size,
        totalTeams: this.teams.size,
        draftResults: round.draftResults,
        publishedResults: round.publishedResults
      };
    }

    return {
      status: this.status,
      currentRoundIndex: this.currentRoundIndex,
      settings: this.getAdminSettings(),
      questions: this.questions,
      teams: adminTeams,
      unassignedPlayers,
      onlinePlayersCount: Array.from(this.players.values()).filter((p) => p.isOnline).length,
      totalPlayersCount: this.players.size,
      currentRound: currentRoundData,
      leaderboard: this.getLeaderboard()
    };
  }
}

module.exports = {
  QuizGameManager,
  GAME_STATUS,
  TEAM_EMOJIS
};
