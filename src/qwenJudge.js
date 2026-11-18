const DEFAULT_QWEN_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const DEFAULT_QWEN_MODEL = 'qwen-plus';

/**
 * Normalizes the API base URL and builds the chat completions endpoint.
 */
function buildChatCompletionsUrl(baseUrl) {
  const clean = (baseUrl || DEFAULT_QWEN_BASE_URL).trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  return `${clean}/chat/completions`;
}

/**
 * Extracts and parses a JSON object from an LLM text response,
 * stripping optional markdown code fences.
 */
function extractJsonFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Пустой ответ от модели Qwen');
  }

  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const slice = candidate.slice(firstBrace, lastBrace + 1);
      return JSON.parse(slice);
    }
    throw new Error('Не удалось разобрать JSON из ответа модели Qwen');
  }
}

/**
 * Clamps a numeric score to an integer in [0, 100].
 */
function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * Algorithmic fallback closeness evaluator used only when Qwen API is unavailable
 * and the administrator chooses fallback scoring.
 */
function fallbackJudgeAnswers({ referenceAnswer, teamAnswers, reason }) {
  const ref = String(referenceAnswer || '').trim();
  const refLower = ref.toLowerCase();
  const refNums = extractNumbers(ref);

  const evaluations = teamAnswers.map((item) => {
    const ans = String(item.answer || '').trim();
    if (!ans) {
      return {
        teamId: item.teamId,
        teamName: item.teamName,
        answer: '',
        score: 0,
        comment: 'Команда не отправила ответ в этом раунде.'
      };
    }

    const ansLower = ans.toLowerCase();
    let score = 0;

    if (ansLower === refLower) {
      score = 100;
    } else {
      const ansNums = extractNumbers(ans);
      let numScore = null;

      if (refNums.length > 0 && ansNums.length > 0) {
        const target = refNums[0];
        let bestDiffRatio = Infinity;
        for (const candidate of ansNums) {
          const denom = Math.max(Math.abs(target), 1e-9);
          const ratio = Math.abs(candidate - target) / denom;
          if (ratio < bestDiffRatio) bestDiffRatio = ratio;
        }
        if (bestDiffRatio <= 0.02) numScore = 98;
        else if (bestDiffRatio <= 0.1) numScore = 88;
        else if (bestDiffRatio <= 0.25) numScore = 72;
        else if (bestDiffRatio <= 0.5) numScore = 52;
        else if (bestDiffRatio <= 1.0) numScore = 30;
        else numScore = 10;
      }

      const textScore = Math.round(computeTokenAndBigramSimilarity(refLower, ansLower) * 100);
      score = numScore !== null ? Math.max(numScore, textScore) : textScore;
    }

    score = clampScore(score);
    let comment = 'Резервная автооценка: ответ частично близок к эталону.';
    if (score >= 85) {
      comment = 'Резервная автооценка: очень близкий к эталону ответ.';
    } else if (score >= 55) {
      comment = 'Резервная автооценка: верное направление, но есть расхождения с эталоном.';
    } else if (score < 30) {
      comment = 'Резервная автооценка: ответ существенно отличается от эталонного.';
    }

    return {
      teamId: item.teamId,
      teamName: item.teamName,
      answer: ans,
      score,
      comment
    };
  });

  const best = pickBestTeamIds(evaluations);
  const summary = best.length > 0
    ? `Выполнена резервная алгоритмическая оценка (причина: ${reason || 'ИИ API недоступен'}). Проверьте баллы перед публикацией.`
    : 'В этом раунде ни одна команда не дала ответа.';

  return {
    evaluations,
    bestTeamIds: best,
    roundSummary: summary,
    judgeSource: 'fallback',
    modelUsed: 'algorithmic-fallback',
    warning: reason || 'Использована резервная оценка вместо Qwen API'
  };
}

function extractNumbers(text) {
  const normalized = text.replace(/(\d)\s+(?=\d)/g, '$1').replace(/,/g, '.');
  const matches = normalized.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map(Number).filter(Number.isFinite);
}

function computeTokenAndBigramSimilarity(a, b) {
  const tokenize = (s) =>
    s
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);

  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  let tokenJaccard = 0;
  if (tokensA.size > 0 && tokensB.size > 0) {
    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }
    tokenJaccard = intersection / (tokensA.size + tokensB.size - intersection);
  }

  const bigrams = (s) => {
    const clean = s.replace(/\s+/g, ' ').trim();
    const set = new Set();
    for (let i = 0; i < clean.length - 1; i++) {
      set.add(clean.slice(i, i + 2));
    }
    return set;
  };

  const bgA = bigrams(a);
  const bgB = bigrams(b);
  let bigramDice = 0;
  if (bgA.size > 0 && bgB.size > 0) {
    let intersection = 0;
    for (const g of bgA) {
      if (bgB.has(g)) intersection++;
    }
    bigramDice = (2 * intersection) / (bgA.size + bgB.size);
  }

  return Math.min(1, tokenJaccard * 0.6 + bigramDice * 0.4);
}

function pickBestTeamIds(evaluations) {
  const withScore = evaluations.filter((e) => e.score > 0 && e.answer);
  if (withScore.length === 0) return [];
  const maxScore = Math.max(...withScore.map((e) => e.score));
  return withScore.filter((e) => e.score === maxScore).map((e) => e.teamId);
}

/**
 * Calls Qwen API (OpenAI-compatible endpoint) to evaluate all submitted team answers.
 */
async function judgeRoundAnswers({
  question,
  referenceAnswer,
  criteria,
  teamAnswers,
  config = {}
}) {
  const apiKey = (config.apiKey || process.env.QWEN_API_KEY || '').trim();
  const baseUrl = (config.baseUrl || process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL).trim();
  const model = (config.model || process.env.QWEN_MODEL || DEFAULT_QWEN_MODEL).trim();

  const emptyTeams = [];
  const submittedTeams = [];

  for (const item of teamAnswers) {
    const cleanAnswer = String(item.answer || '').trim();
    if (!cleanAnswer) {
      emptyTeams.push({
        teamId: item.teamId,
        teamName: item.teamName,
        answer: '',
        score: 0,
        comment: 'Команда не отправила ответ в этом раунде.'
      });
    } else {
      submittedTeams.push({
        teamId: item.teamId,
        teamName: item.teamName,
        answer: cleanAnswer
      });
    }
  }

  if (submittedTeams.length === 0) {
    return {
      evaluations: emptyTeams,
      bestTeamIds: [],
      roundSummary: 'В этом раунде ни одна команда не отправила ответ.',
      judgeSource: 'system',
      modelUsed: model
    };
  }

  if (!apiKey) {
    const err = new Error('Не указан API-ключ Qwen (QWEN_API_KEY). Укажите его в настройках админ-панели или в .env.');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  const endpoint = buildChatCompletionsUrl(baseUrl);

  const systemPrompt = [
    'Ты — беспристрастный и доброжелательный ИИ-судья интеллектуального командного квиза.',
    'Твоя задача — сравнить ответы команд с эталонным правильным ответом и оценить каждый ответ от 0 до 100 баллов.',
    'Правила оценивания:',
    '1. Оценивай близость по смыслу, точность фактов или числовую близость (если ответ числовой — чем ближе к эталону, тем выше балл).',
    '2. 100 баллов ставь за полностью верный или максимально точный ответ; 0 баллов — за совершенно неверный или бессмысленный ответ.',
    '3. Для каждой команды напиши краткий, понятный комментарий на русском языке (1–2 предложения): что верно, чего не хватило или насколько ответ близок к истине.',
    '4. Сформулируй краткий общий итог раунда (roundSummary, 1–2 предложения) на русском языке.',
    '5. Ответь СТРОГО одним валидным JSON-объектом без лишнего текста до или после JSON.'
  ].join('\n');

  const userPayload = {
    question,
    referenceAnswer,
    judgingCriteria: criteria || 'Оценивайте смысловую или числовую близость ответа к эталону от 0 до 100.',
    teams: submittedTeams.map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      answer: t.answer
    })),
    requiredOutputSchema: {
      evaluations: [
        {
          teamId: 'строка (точный teamId из входных данных)',
          score: 'целое число от 0 до 100',
          comment: 'строка на русском языке (1-2 предложения)'
        }
      ],
      roundSummary: 'строка на русском языке (краткий итог раунда от судьи)'
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload, null, 2) }
      ]
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const err = new Error(`Ошибка Qwen API (${response.status}): ${errorText.slice(0, 300) || response.statusText}`);
    err.code = 'QWEN_API_ERROR';
    throw err;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonFromText(content);

  const aiById = new Map();
  if (Array.isArray(parsed?.evaluations)) {
    for (const entry of parsed.evaluations) {
      if (entry && entry.teamId) {
        aiById.set(String(entry.teamId), entry);
      }
    }
  }

  const judgedSubmitted = submittedTeams.map((team) => {
    const match = aiById.get(String(team.teamId));
    return {
      teamId: team.teamId,
      teamName: team.teamName,
      answer: team.answer,
      score: match ? clampScore(match.score) : 0,
      comment: match?.comment
        ? String(match.comment).trim()
        : 'Судья не предоставил отдельный комментарий для этого ответа.'
    };
  });

  const allEvaluations = [...judgedSubmitted, ...emptyTeams];
  const bestTeamIds = pickBestTeamIds(allEvaluations);

  return {
    evaluations: allEvaluations,
    bestTeamIds,
    roundSummary: parsed?.roundSummary
      ? String(parsed.roundSummary).trim()
      : 'ИИ-судья Qwen оценил все ответы команд.',
    judgeSource: 'qwen',
    modelUsed: data?.model || model
  };
}

/**
 * Sends a lightweight test request to verify Qwen API connectivity and credentials.
 */
async function testQwenConnection(config = {}) {
  const apiKey = (config.apiKey || process.env.QWEN_API_KEY || '').trim();
  const baseUrl = (config.baseUrl || process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL).trim();
  const model = (config.model || process.env.QWEN_MODEL || DEFAULT_QWEN_MODEL).trim();

  if (!apiKey) {
    return {
      ok: false,
      error: 'API-ключ не указан.'
    };
  }

  const endpoint = buildChatCompletionsUrl(baseUrl);
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 30,
        temperature: 0,
        messages: [
          { role: 'user', content: 'Ответь одним словом: Готов' }
        ]
      }),
      signal: AbortSignal.timeout(20000)
    });

    const elapsedMs = Date.now() - startedAt;

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return {
        ok: false,
        elapsedMs,
        error: `HTTP ${response.status}: ${errBody.slice(0, 300) || response.statusText}`
      };
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || '(пустой ответ)';
    return {
      ok: true,
      elapsedMs,
      model: data?.model || model,
      reply
    };
  } catch (err) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: err.message || 'Ошибка соединения с Qwen API'
    };
  }
}

module.exports = {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_MODEL,
  judgeRoundAnswers,
  fallbackJudgeAnswers,
  testQwenConnection
};
