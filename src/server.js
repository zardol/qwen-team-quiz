require('dotenv').config();

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const { QuizGameManager, GAME_STATUS } = require('./gameState');
const {
  judgeRoundAnswers,
  fallbackJudgeAnswers,
  testQwenConnection
} = require('./qwenJudge');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_LOGIN = (process.env.ADMIN_LOGIN || 'admin').trim();
const GENERATED_ADMIN_PASSWORD = !process.env.ADMIN_PASSWORD
  ? crypto.randomBytes(12).toString('base64url')
  : null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || GENERATED_ADMIN_PASSWORD;
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

const TRUSTED_QWEN_HOSTS = [
  'dashscope-intl.aliyuncs.com',
  'dashscope.aliyuncs.com',
  'openrouter.ai'
];

function isTrustedQwenHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (TRUSTED_QWEN_HOSTS.includes(host)) return true;
  if (host.endsWith('.maas.qwencloudapi.com') || host.endsWith('.maas.aliyuncs.com')) {
    return true;
  }
  return false;
}

function isBlockedPrivateIp(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === '0.0.0.0' || h === '::1') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h)) {
    return true;
  }
  const match172 = h.match(/^172\.(\d+)\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) {
    return true;
  }
  return false;
}

function validateQwenBaseUrl(rawUrl, { allowLocalhost = false } = {}) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('Некорректный формат Base URL.');
  }
  const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !(allowLocalhost && isLocal && parsed.protocol === 'http:')) {
    throw new Error('Base URL должен использовать протокол HTTPS.');
  }
  if (!isLocal && isBlockedPrivateIp(parsed.hostname)) {
    throw new Error('Указан недопустимый внутренний IP-адрес для Base URL.');
  }
  return parsed;
}

function signAdminToken(login) {
  const payload = {
    login,
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex')
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function safeEqualText(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 25000,
  pingInterval: 10000
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const game = new QuizGameManager();

function broadcastFullState() {
  const sockets = io.sockets.sockets;
  for (const socket of sockets.values()) {
    if (socket.data.isAdmin) {
      continue;
    }
    const state = game.buildStudentStateForPlayer(socket.data.playerId || null, {
      isSpectator: Boolean(socket.data.isSpectator)
    });
    socket.emit('game:state', state);
  }
  io.to('admins').emit('admin:state', game.buildAdminState());
}

game.setChangeHandler(broadcastFullState);

// Sync timer tick every second during an active round
setInterval(() => {
  if (game.status !== GAME_STATUS.ROUND_ACTIVE) return;
  const round = game.getCurrentRound();
  if (!round) return;
  io.emit('game:timer', {
    remainingSeconds: game.getRemainingSeconds(round),
    remainingMs: game.getRemainingMs(round),
    durationSeconds: round.durationSeconds,
    isPaused: round.isPaused
  });
}, 1000);

function extractTokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return req.headers['x-admin-token'] || '';
}

function requireAdminHttp(req, res, next) {
  const token = extractTokenFromRequest(req);
  const verified = verifyAdminToken(token);
  if (!verified) {
    return res.status(401).json({ error: 'Требуется авторизация администратора.' });
  }
  req.admin = verified;
  next();
}

// ========================
// Page & Health Routes
// ========================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: game.status,
    players: game.players.size,
    onlinePlayers: Array.from(game.players.values()).filter((p) => p.isOnline).length,
    uptimeSec: Math.round(process.uptime())
  });
});

// ========================
// Admin Auth & CRUD API
// ========================

app.post('/api/admin/login', (req, res) => {
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(clientIp);
  if (record && record.resetAt > now && record.count >= MAX_LOGIN_ATTEMPTS) {
    const waitMinutes = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({
      error: `Слишком много неудачных попыток входа. Повторите через ${waitMinutes} мин.`
    });
  }

  const { login, password } = req.body || {};
  const loginOk = safeEqualText(String(login || '').trim(), ADMIN_LOGIN);
  const passOk = safeEqualText(String(password || ''), ADMIN_PASSWORD);

  if (!loginOk || !passOk) {
    const nextCount = record && record.resetAt > now ? record.count + 1 : 1;
    const resetAt = record && record.resetAt > now ? record.resetAt : now + LOGIN_WINDOW_MS;
    loginAttempts.set(clientIp, { count: nextCount, resetAt });
    return res.status(401).json({ error: 'Неверный логин или пароль администратора.' });
  }

  loginAttempts.delete(clientIp);
  const token = signAdminToken(ADMIN_LOGIN);
  return res.json({
    ok: true,
    token,
    login: ADMIN_LOGIN
  });
});

app.get('/api/admin/verify', requireAdminHttp, (req, res) => {
  res.json({ ok: true, login: req.admin.login });
});

app.get('/api/admin/state', requireAdminHttp, (req, res) => {
  res.json(game.buildAdminState());
});

app.get('/api/admin/questions', requireAdminHttp, (req, res) => {
  res.json({ questions: game.getQuestions() });
});

app.post('/api/admin/questions', requireAdminHttp, (req, res) => {
  try {
    const question = game.addQuestion(req.body);
    res.status(201).json({ ok: true, question, questions: game.getQuestions() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/questions/:id', requireAdminHttp, (req, res) => {
  try {
    const question = game.updateQuestion(req.params.id, req.body);
    res.json({ ok: true, question, questions: game.getQuestions() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/questions/:id', requireAdminHttp, (req, res) => {
  try {
    game.deleteQuestion(req.params.id);
    res.json({ ok: true, questions: game.getQuestions() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/questions/:id/move', requireAdminHttp, (req, res) => {
  try {
    const questions = game.moveQuestion(req.params.id, req.body?.direction);
    res.json({ ok: true, questions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/settings', requireAdminHttp, (req, res) => {
  res.json({ settings: game.getAdminSettings() });
});

app.post('/api/admin/settings', requireAdminHttp, (req, res) => {
  try {
    const body = req.body || {};
    const saved = game.getQwenRuntimeConfig();
    if (typeof body.qwenBaseUrl === 'string' && body.qwenBaseUrl.trim()) {
      const parsedNew = validateQwenBaseUrl(body.qwenBaseUrl, { allowLocalhost: false });
      const parsedSaved = new URL(saved.baseUrl);
      const hasNewKey = Boolean(body.qwenApiKey && body.qwenApiKey.trim());
      if (
        parsedNew.hostname !== parsedSaved.hostname &&
        !isTrustedQwenHost(parsedNew.hostname) &&
        !hasNewKey
      ) {
        return res.status(400).json({
          error: 'При смене домена API на сторонний укажите также новый API-ключ.'
        });
      }
    }
    const settings = game.updateAdminSettings(body);
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/test-qwen', requireAdminHttp, async (req, res) => {
  try {
    const saved = game.getQwenRuntimeConfig();
    const body = req.body || {};
    const baseUrl =
      body.qwenBaseUrl && body.qwenBaseUrl.trim() ? body.qwenBaseUrl.trim() : saved.baseUrl;
    const allowLocal = process.env.ALLOW_LOCAL_QWEN_TEST === '1';
    const parsedTarget = validateQwenBaseUrl(baseUrl, { allowLocalhost: allowLocal });
    const parsedSaved = new URL(saved.baseUrl);
    const hasNewKey = Boolean(body.qwenApiKey && body.qwenApiKey.trim());

    if (
      parsedTarget.hostname !== parsedSaved.hostname &&
      !isTrustedQwenHost(parsedTarget.hostname) &&
      !hasNewKey
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Для проверки нового стороннего хоста введите API-ключ явно в форме.'
      });
    }

    const config = {
      apiKey: hasNewKey ? body.qwenApiKey.trim() : saved.apiKey,
      baseUrl,
      model: body.qwenModel && body.qwenModel.trim() ? body.qwenModel.trim() : saved.model
    };

    const result = await testQwenConnection(config);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ========================
// Socket.io Real-time Layer
// ========================

function respond(cb, payload) {
  if (typeof cb === 'function') cb(payload);
}

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};
  if (auth.role === 'admin') {
    const verified = verifyAdminToken(auth.token);
    if (verified) {
      socket.data.isAdmin = true;
      socket.join('admins');
      socket.emit('admin:state', game.buildAdminState());
    } else {
      socket.emit('admin:auth_error', { error: 'Сессия администратора истекла.' });
    }
  } else {
    socket.emit('game:state', game.buildStudentStateForPlayer(null));
  }

  // ---- Student Events ----

  socket.on('student:set_spectator', (payload, cb) => {
    socket.data.isSpectator = Boolean(payload?.enabled);
    if (socket.data.isSpectator) {
      socket.data.playerId = null;
    }
    const state = game.buildStudentStateForPlayer(socket.data.playerId || null);
    socket.emit('game:state', state);
    respond(cb, { ok: true, state });
  });

  socket.on('student:register', (payload, cb) => {
    try {
      socket.data.isSpectator = false;
      const player = game.registerOrReconnectPlayer({
        playerId: payload?.playerId,
        playerToken: payload?.playerToken,
        name: payload?.name,
        emoji: payload?.emoji,
        socketId: socket.id
      });
      socket.data.playerId = player.id;
      const state = game.buildStudentStateForPlayer(player.id);
      socket.emit('game:state', state);
      respond(cb, { ok: true, playerId: player.id, playerToken: player.token, state });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('student:rename', (payload, cb) => {
    try {
      if (!socket.data.playerId) throw new Error('Игрок не зарегистрирован.');
      game.renamePlayer(socket.data.playerId, payload?.name);
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('student:submit_answer', (payload, cb) => {
    try {
      if (!socket.data.playerId) throw new Error('Сначала войдите в игру.');
      const submission = game.submitPlayerAnswer(socket.data.playerId, payload?.text);
      respond(cb, { ok: true, submission });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('student:tab_leave', (payload, cb) => {
    const callback = typeof payload === 'function' ? payload : cb;
    const eventId = typeof payload === 'object' && payload ? payload.eventId : null;
    if (!socket.data.playerId) return respond(callback, { ok: false });
    const recorded = game.recordTabLeave(socket.data.playerId, eventId);
    if (recorded) {
      io.to('admins').emit('admin:state', game.buildAdminState());
    }
    return respond(callback, { ok: recorded });
  });

  socket.on('student:tab_return', (payload, cb) => {
    if (!socket.data.playerId) return respond(cb, { ok: false, retryable: true });
    const recorded = game.recordTabReturn(socket.data.playerId, payload?.awayMs, {
      allowLocked: true
    });
    if (recorded) {
      io.to('admins').emit('admin:state', game.buildAdminState());
    }
    return respond(cb, { ok: recorded });
  });

  socket.on('student:tab_away_completed', (payload, cb) => {
    if (!socket.data.playerId) return respond(cb, { ok: false, retryable: true });
    const recorded = game.recordTabAwayCompleted(socket.data.playerId, {
      roundNumber: payload?.roundNumber,
      awayMs: payload?.awayMs,
      eventId: payload?.eventId
    });
    if (recorded) {
      io.to('admins').emit('admin:state', game.buildAdminState());
    }
    return respond(cb, { ok: recorded });
  });

  // ---- Admin Events ----

  function ensureAdmin() {
    if (!socket.data.isAdmin) {
      throw new Error('Нет прав администратора.');
    }
  }

  socket.on('admin:auth', (payload, cb) => {
    const verified = verifyAdminToken(payload?.token);
    if (!verified) {
      respond(cb, { ok: false, error: 'Недействительный токен.' });
      return;
    }
    socket.data.isAdmin = true;
    socket.join('admins');
    const state = game.buildAdminState();
    socket.emit('admin:state', state);
    respond(cb, { ok: true, state });
  });

  socket.on('admin:start_round', (payload, cb) => {
    try {
      ensureAdmin();
      const idx = payload?.questionIndex !== undefined ? payload.questionIndex : 0;
      game.startRound(idx);
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:toggle_pause', (cb) => {
    try {
      ensureAdmin();
      game.togglePauseRound();
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:add_time', (payload, cb) => {
    try {
      ensureAdmin();
      game.addTimeToRound(payload?.seconds || 30);
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:lock_round', (cb) => {
    try {
      ensureAdmin();
      game.lockRound();
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:reopen_round', (payload, cb) => {
    try {
      ensureAdmin();
      game.reopenRound(payload?.seconds || 30);
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:judge_round', async (payload, cb) => {
    try {
      ensureAdmin();
      const round = game.getCurrentRound();
      if (!round) throw new Error('Сначала выберите и запустите раунд.');

      if (game.status === GAME_STATUS.ROUND_ACTIVE) {
        game.lockRound();
      }
      if (game.players.size === 0) {
        throw new Error('В квизе пока нет ни одного участника.');
      }

      game.setJudgingStatus(true);
      const playerAnswers = game.getPlayerAnswersForJudging();

      if (payload?.useFallback) {
        const fallbackRes = fallbackJudgeAnswers({
          referenceAnswer: round.referenceAnswer,
          referenceAnswerKk: round.referenceAnswerKk,
          playerAnswers,
          reason: payload?.reason || 'Выбрана резервная автооценка'
        });
        game.setDraftResults(fallbackRes);
        respond(cb, { ok: true, results: fallbackRes });
        return;
      }

      try {
        const aiResult = await judgeRoundAnswers({
          question: round.question,
          referenceAnswer: round.referenceAnswer,
          referenceAnswerKk: round.referenceAnswerKk,
          criteria: round.criteria,
          playerAnswers,
          config: game.getQwenRuntimeConfig()
        });
        game.setDraftResults(aiResult);
        respond(cb, { ok: true, results: aiResult });
      } catch (judgeErr) {
        game.setJudgingStatus(false);
        respond(cb, {
          ok: false,
          canUseFallback: true,
          error: judgeErr.message || 'Ошибка обращения к ИИ Qwen.'
        });
      }
    } catch (err) {
      game.setJudgingStatus(false);
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:manual_draft', (cb) => {
    try {
      ensureAdmin();
      if (game.status === GAME_STATUS.ROUND_ACTIVE) {
        game.lockRound();
      }
      const draft = game.createManualDraftResults();
      respond(cb, { ok: true, results: draft });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:update_score', (payload, cb) => {
    try {
      ensureAdmin();
      const updated = game.updateEvaluationScore({
        playerId: payload?.playerId,
        score: payload?.score,
        comment: payload?.comment
      });
      respond(cb, { ok: true, results: updated });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:publish_results', (cb) => {
    try {
      ensureAdmin();
      const results = game.publishRoundResults();
      respond(cb, { ok: true, results });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:finish_quiz', (cb) => {
    try {
      ensureAdmin();
      game.finishQuiz();
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:reset_quiz', (payload, cb) => {
    try {
      ensureAdmin();
      game.resetQuiz({ keepPlayers: Boolean(payload?.keepPlayers) });
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:kick_player', (payload, cb) => {
    try {
      ensureAdmin();
      const targetId = payload?.playerId;
      game.kickPlayer(targetId);
      for (const s of io.sockets.sockets.values()) {
        if (s.data.playerId === targetId) {
          s.data.playerId = null;
          s.emit('student:kicked');
          s.emit('game:state', game.buildStudentStateForPlayer(null));
        }
      }
      respond(cb, { ok: true });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('admin:kick_offline', (cb) => {
    try {
      ensureAdmin();
      const removedIds = game.kickOfflinePlayers();
      const removedSet = new Set(removedIds);
      for (const s of io.sockets.sockets.values()) {
        if (s.data.playerId && removedSet.has(s.data.playerId)) {
          s.data.playerId = null;
          s.emit('student:kicked');
          s.emit('game:state', game.buildStudentStateForPlayer(null));
        }
      }
      respond(cb, { ok: true, count: removedIds.length });
    } catch (err) {
      respond(cb, { ok: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    if (!socket.data.isAdmin) {
      game.handleSocketDisconnect(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Qwen Team Quiz сервер запущен: http://localhost:${PORT}`);
  console.log(`Ссылка для студентов: http://localhost:${PORT}/`);
  console.log(`Панель администратора: http://localhost:${PORT}/admin`);
  console.log(`Логин администратора: ${ADMIN_LOGIN}`);
  if (GENERATED_ADMIN_PASSWORD) {
    console.log(`Сгенерирован одноразовый пароль администратора (задайте ADMIN_PASSWORD в .env): ${GENERATED_ADMIN_PASSWORD}`);
  }
});
