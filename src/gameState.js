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

const PLAYER_EMOJIS = ['🚀', '🦉', '⚡', '🦊', '🔥', '🧠', '🌟', '🐉', '🎯', '🦁', '🛸', '💎'];

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
    this.players = new Map(); // playerId -> { id, token, name, emoji, isOnline, socketIds: Set, roundScores: {}, totalScore, totalTabLeaves, joinedAt }
    this.questions = [];
    this.settings = {
      quizTitle: 'Интерактивный квиз по философии',
      quizTitleKk: 'Философия бойынша интерактивті квиз',
      qwenBaseUrl: process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL,
      qwenModel: process.env.QWEN_MODEL || DEFAULT_QWEN_MODEL,
      defaultTimeLimit: 60
    };
    this.runtimeApiKey = (process.env.QWEN_API_KEY || '').trim();

    this.currentRoundIndex = -1;
    this.roundRecords = new Map(); // roundIndex -> roundRecord
    this.timerInterval = null;
    this.onStateChanged = null;

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
            defaultTimeLimit: Number(parsed.settings.defaultTimeLimit) || 60
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
      timeLimit: Math.max(15, Math.min(600, Number(q.timeLimit) || this.settings.defaultTimeLimit || 60))
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
  // Players
  // ========================

  registerOrReconnectPlayer({ playerId, playerToken, name, emoji, socketId }) {
    const cleanName = String(name || '').trim().slice(0, 32);
    const existing = playerId ? this.players.get(playerId) : null;

    if (existing && tokensMatch(playerToken, existing.token)) {
      if (cleanName) existing.name = cleanName;
      if (emoji && PLAYER_EMOJIS.includes(emoji)) {
        existing.emoji = emoji;
      }
      existing.isOnline = true;
      existing.socketIds.add(socketId);
      this.notifyChanged();
      return existing;
    }

    if (!cleanName) {
      throw new Error('Введите ваше имя.');
    }

    const chosenEmoji = PLAYER_EMOJIS.includes(emoji)
      ? emoji
      : PLAYER_EMOJIS[this.players.size % PLAYER_EMOJIS.length];

    const newId = generateId('p');
    const player = {
      id: newId,
      token: crypto.randomBytes(16).toString('hex'),
      name: cleanName,
      emoji: chosenEmoji,
      isOnline: true,
      socketIds: new Set([socketId]),
      roundScores: {},
      totalScore: 0,
      totalTabLeaves: 0,
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

  kickPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('Участник не найден.');
    this.players.delete(playerId);
    const currentRound = this.getCurrentRound();
    if (currentRound) {
      currentRound.submissions.delete(playerId);
      currentRound.tabLeaves.delete(playerId);
    }
    this.notifyChanged();
  }

  kickOfflinePlayers() {
    const removedIds = [];
    const currentRound = this.getCurrentRound();
    for (const [id, player] of this.players.entries()) {
      if (!player.isOnline) {
        this.players.delete(id);
        if (currentRound) {
          currentRound.submissions.delete(id);
          currentRound.tabLeaves.delete(id);
        }
        removedIds.push(id);
      }
    }
    if (removedIds.length > 0) {
      this.notifyChanged();
    }
    return removedIds;
  }

  recalculatePlayerTotal(player) {
    let sum = 0;
    for (const val of Object.values(player.roundScores)) {
      sum += Number(val) || 0;
    }
    player.totalScore = sum;
  }

  // ========================
  // Round, Answers & Anti-Cheat
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
    const duration = q.timeLimit || this.settings.defaultTimeLimit || 60;

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
      tabLeaves: existing ? existing.tabLeaves : new Map(),
      draftResults: null,
      publishedResults: null
    };

    for (const player of this.players.values()) {
      if (Object.prototype.hasOwnProperty.call(player.roundScores, idx)) {
        delete player.roundScores[idx];
        this.recalculatePlayerTotal(player);
      }
    }
    if (existing) {
      record.submissions.clear();
      record.tabLeaves.clear();
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
      const now = Date.now();
      for (const entry of round.tabLeaves.values()) {
        if (entry.isCurrentlyAway && entry.lastLeftAt) {
          entry.totalAwayMs += Math.max(0, now - entry.lastLeftAt);
          entry.isCurrentlyAway = false;
          entry.lastLeftAt = null;
        }
      }
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

  submitPlayerAnswer(playerId, text) {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Сначала войдите в игру, указав ваше имя.');
    }
    if (this.status !== GAME_STATUS.ROUND_ACTIVE) {
      throw new Error('Время приёма ответов уже завершено.');
    }

    const round = this.getCurrentRound();
    if (!round) throw new Error('Активный раунд не найден.');

    const cleanText = String(text || '').trim().slice(0, 800);
    if (!cleanText) {
      throw new Error('Ответ не может быть пустым.');
    }

    const submission = {
      text: cleanText,
      updatedAt: Date.now()
    };
    round.submissions.set(player.id, submission);

    this.notifyChanged();
    return submission;
  }

  recordTabLeave(playerId) {
    if (this.status !== GAME_STATUS.ROUND_ACTIVE) return false;
    const player = this.players.get(playerId);
    const round = this.getCurrentRound();
    if (!player || !round) return false;

    const entry = round.tabLeaves.get(playerId) || {
      count: 0,
      totalAwayMs: 0,
      isCurrentlyAway: false,
      lastLeftAt: null
    };

    if (entry.isCurrentlyAway) {
      return false;
    }

    entry.count += 1;
    entry.isCurrentlyAway = true;
    entry.lastLeftAt = Date.now();
    round.tabLeaves.set(playerId, entry);
    player.totalTabLeaves += 1;
    return true;
  }

  recordTabReturn(playerId, awayMs) {
    if (this.status !== GAME_STATUS.ROUND_ACTIVE) return false;
    const round = this.getCurrentRound();
    if (!round) return false;

    const entry = round.tabLeaves.get(playerId);
    if (!entry || !entry.isCurrentlyAway) return false;

    const parsedAway = Number(awayMs);
    const elapsed =
      Number.isFinite(parsedAway) && parsedAway > 0
        ? Math.min(parsedAway, 600000)
        : entry.lastLeftAt
          ? Math.max(0, Date.now() - entry.lastLeftAt)
          : 0;

    entry.totalAwayMs += elapsed;
    entry.isCurrentlyAway = false;
    entry.lastLeftAt = null;
    round.tabLeaves.set(playerId, entry);
    return true;
  }

  // ========================
  // Judging & Results
  // ========================

  getPlayerAnswersForJudging() {
    const round = this.getCurrentRound();
    if (!round) throw new Error('Нет выбранного раунда.');

    const playerAnswers = [];
    for (const player of this.players.values()) {
      const sub = round.submissions.get(player.id);
      playerAnswers.push({
        playerId: player.id,
        playerName: player.name,
        answer: sub ? sub.text : ''
      });
    }
    return playerAnswers;
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

    const evaluations = Array.from(this.players.values()).map((player) => {
      const sub = round.submissions.get(player.id);
      const ans = sub ? sub.text : '';
      return {
        playerId: player.id,
        playerName: player.name,
        answer: ans,
        score: 0,
        comment: ans
          ? 'Оценка выставлена ведущим вручную.'
          : 'Участник не отправил ответ в этом раунде.'
      };
    });

    round.draftResults = {
      evaluations,
      bestPlayerIds: [],
      roundSummary: 'Оценка раунда выставлена ведущим вручную.',
      judgeSource: 'manual',
      modelUsed: 'manual'
    };
    this.status = GAME_STATUS.ROUND_LOCKED;
    this.notifyChanged();
    return round.draftResults;
  }

  updateEvaluationScore({ playerId, score, comment }) {
    const round = this.getCurrentRound();
    if (!round) throw new Error('Раунд не найден.');

    const target = this.status === GAME_STATUS.ROUND_RESULTS
      ? round.publishedResults
      : round.draftResults;

    if (!target) {
      throw new Error('Сначала запустите оценку раунда.');
    }

    const entry = target.evaluations.find((e) => e.playerId === playerId);
    if (!entry) throw new Error('Участник в результатах не найден.');

    const clamped = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    entry.score = clamped;
    if (typeof comment === 'string') {
      entry.comment = comment.trim();
    }

    const withAnswers = target.evaluations.filter((e) => e.score > 0 && e.answer);
    if (withAnswers.length > 0) {
      const maxScore = Math.max(...withAnswers.map((e) => e.score));
      target.bestPlayerIds = withAnswers.filter((e) => e.score === maxScore).map((e) => e.playerId);
    } else {
      target.bestPlayerIds = [];
    }

    if (this.status === GAME_STATUS.ROUND_RESULTS) {
      const player = this.players.get(playerId);
      if (player) {
        player.roundScores[round.roundIndex] = clamped;
        this.recalculatePlayerTotal(player);
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
      const player = this.players.get(ev.playerId);
      if (player) {
        player.roundScores[round.roundIndex] = Number(ev.score) || 0;
        this.recalculatePlayerTotal(player);
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

  resetQuiz({ keepPlayers = false } = {}) {
    this.stopTimer();
    this.status = GAME_STATUS.LOBBY;
    this.currentRoundIndex = -1;
    this.roundRecords.clear();

    if (keepPlayers) {
      for (const player of this.players.values()) {
        player.roundScores = {};
        player.totalScore = 0;
        player.totalTabLeaves = 0;
      }
    } else {
      this.players.clear();
    }

    this.notifyChanged();
  }

  // ========================
  // State Serialization
  // ========================

  getLeaderboard() {
    const list = Array.from(this.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      emoji: player.emoji,
      totalScore: player.totalScore,
      isOnline: player.isOnline
    }));
    list.sort((a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name, 'ru'));
    return list;
  }

  serializePublicPlayers(currentRound) {
    return Array.from(this.players.values())
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((player) => ({
        name: player.name,
        emoji: player.emoji,
        isOnline: player.isOnline,
        totalScore: player.totalScore,
        hasSubmitted: currentRound ? currentRound.submissions.has(player.id) : false
      }));
  }

  _serializeTabLeaveEntry(entry) {
    if (!entry) {
      return { count: 0, totalAwaySec: 0, isCurrentlyAway: false };
    }
    const extraMs =
      entry.isCurrentlyAway && entry.lastLeftAt ? Math.max(0, Date.now() - entry.lastLeftAt) : 0;
    return {
      count: entry.count,
      totalAwaySec: Math.round((entry.totalAwayMs + extraMs) / 1000),
      isCurrentlyAway: entry.isCurrentlyAway
    };
  }

  buildStudentStateForPlayer(playerId) {
    const player = playerId ? this.players.get(playerId) : null;
    const round = this.getCurrentRound();

    let publicRound = null;
    if (round) {
      const showAnswer =
        this.status === GAME_STATUS.ROUND_RESULTS || this.status === GAME_STATUS.FINISHED;
      publicRound = {
        roundNumber: round.roundNumber,
        totalQuestions: this.questions.length,
        title: round.title,
        titleKk: round.titleKk || '',
        question: round.question,
        questionKk: round.questionKk || '',
        timeLimit: round.timeLimit,
        durationSeconds: round.durationSeconds,
        remainingSeconds: this.getRemainingSeconds(round),
        remainingMs: this.getRemainingMs(round),
        isPaused: round.isPaused,
        referenceAnswer: showAnswer ? round.referenceAnswer : null,
        referenceAnswerKk: showAnswer ? (round.referenceAnswerKk || '') : null
      };
    }

    let playerData = null;
    if (player) {
      const submission = round ? round.submissions.get(player.id) || null : null;
      playerData = {
        id: player.id,
        name: player.name,
        emoji: player.emoji,
        totalScore: player.totalScore,
        submission
      };
    }

    let roundResults = null;
    if (this.status === GAME_STATUS.ROUND_RESULTS && round?.publishedResults) {
      const playerLookup = new Map(
        Array.from(this.players.values()).map((p) => [p.id, p])
      );
      const bestIds = round.publishedResults.bestPlayerIds || [];
      const evaluations = [...round.publishedResults.evaluations]
        .map((ev) => ({
          playerName: ev.playerName,
          answer: ev.answer,
          score: ev.score,
          comment: ev.comment,
          emoji: playerLookup.get(ev.playerId)?.emoji || '🧠',
          isWinner: bestIds.includes(ev.playerId),
          isMe: Boolean(playerId && ev.playerId === playerId)
        }))
        .sort((a, b) => b.score - a.score || (a.isMe ? -1 : b.isMe ? 1 : 0));

      const myEvaluation = evaluations.find((ev) => ev.isMe) || null;

      roundResults = {
        judgeSource: round.publishedResults.judgeSource,
        modelUsed: round.publishedResults.modelUsed,
        roundSummary: round.publishedResults.roundSummary,
        referenceAnswer: round.referenceAnswer,
        referenceAnswerKk: round.referenceAnswerKk || '',
        myEvaluation,
        evaluations
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
            roundSummary: rec.publishedResults.roundSummary
          });
        }
      }
      roundHistory.sort((a, b) => a.roundNumber - b.roundNumber);
    }

    const publicLeaderboard = this.getLeaderboard().map((entry) => ({
      name: entry.name,
      emoji: entry.emoji,
      totalScore: entry.totalScore,
      isOnline: entry.isOnline,
      isMe: Boolean(playerId && entry.id === playerId)
    }));

    return {
      status: this.status,
      quizTitle: this.settings.quizTitle,
      quizTitleKk: this.settings.quizTitleKk || '',
      totalQuestions: this.questions.length,
      player: playerData,
      players: this.serializePublicPlayers(round),
      currentRound: publicRound,
      roundResults,
      leaderboard: publicLeaderboard,
      roundHistory,
      availableEmojis: PLAYER_EMOJIS
    };
  }

  buildAdminState() {
    const round = this.getCurrentRound();

    const adminPlayers = Array.from(this.players.values())
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((player) => {
        const submission = round ? round.submissions.get(player.id) || null : null;
        const leaveRaw = round ? round.tabLeaves.get(player.id) : null;
        return {
          id: player.id,
          name: player.name,
          emoji: player.emoji,
          isOnline: player.isOnline,
          totalScore: player.totalScore,
          roundScores: player.roundScores,
          submission,
          totalTabLeaves: player.totalTabLeaves,
          tabLeaveInfo: this._serializeTabLeaveEntry(leaveRaw)
        };
      });

    let currentRoundData = null;
    if (round) {
      const tabLeaveMap = {};
      for (const [pId, entry] of round.tabLeaves.entries()) {
        tabLeaveMap[pId] = this._serializeTabLeaveEntry(entry);
      }

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
        totalPlayers: this.players.size,
        tabLeaveMap,
        draftResults: round.draftResults,
        publishedResults: round.publishedResults
      };
    }

    return {
      status: this.status,
      currentRoundIndex: this.currentRoundIndex,
      settings: this.getAdminSettings(),
      questions: this.questions,
      players: adminPlayers,
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
  PLAYER_EMOJIS
};
