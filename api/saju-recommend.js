const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    sajuSummary: {
      type: 'string',
      description: '일간·오행·기본 사주 요약 (2~3문장)',
    },
    numbers: {
      type: 'array',
      items: { type: 'integer' },
      description: '로또 추천 번호 6개 (1~45, 중복 없음, 오름차순)',
    },
    bonus: {
      type: 'integer',
      description: '보너스 추천 번호 (1~45, numbers와 중복 없음)',
    },
    numberReasons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          reason: { type: 'string' },
        },
        required: ['number', 'reason'],
      },
      description: '각 번호별 사주 근거 설명',
    },
    bonusReason: {
      type: 'string',
      description: '보너스 번호 추천 사유',
    },
    overallAdvice: {
      type: 'string',
      description: '종합 조언 및 행운의 방향',
    },
  },
  required: ['sajuSummary', 'numbers', 'bonus', 'numberReasons', 'bonusReason', 'overallAdvice'],
};

function buildPrompt(gender, birthDate) {
  const genderLabel = gender === 'male' ? '남성' : '여성';
  return `당신은 한국 사주명리학 전문가입니다. 아래 정보를 바탕으로 로또 6/45 번호를 추천하세요.

## 사용자 정보
- 성별: ${genderLabel}
- 생년월일: ${birthDate} (양력)

## 규칙
1. 1~45 중 중복 없는 번호 6개와 보너스 번호 1개를 추천하세요.
2. numbers는 반드시 오름차순 6개 정수 배열입니다.
3. bonus는 numbers에 포함되지 않은 1~45 정수입니다.
4. 사주의 일간(日干), 오행(목·화·토·금·수), 십성, 용신·기신, 생년월일의 음양오행 균형 등을 근거로 각 번호를 설명하세요.
5. 번호와 오행·숫자학(수리)의 연관을 구체적으로 서술하세요. (예: "수(水) 기운 보완을 위해 1·6 계열...")
6. numberReasons에는 numbers 6개 각각에 대한 reason을 number와 함께 제공하세요.
7. 재미와 참고용임을 overallAdvice 마지막에 한 문장으로 언급하세요.
8. 모든 설명은 한국어로 작성하세요.`;
}

function validateResult(data) {
  if (!data || !Array.isArray(data.numbers) || data.numbers.length !== 6) {
    throw new Error('Invalid numbers in AI response');
  }

  const nums = data.numbers.map(Number);
  const bonus = Number(data.bonus);

  if (nums.some(n => n < 1 || n > 45 || !Number.isInteger(n))) {
    throw new Error('Numbers out of range');
  }
  if (new Set(nums).size !== 6) {
    throw new Error('Duplicate numbers');
  }
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45 || nums.includes(bonus)) {
    throw new Error('Invalid bonus number');
  }

  data.numbers = [...nums].sort((a, b) => a - b);
  data.bonus = bonus;
  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수에 추가해 주세요.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const { gender, birthDate } = body || {};

  if (!gender || !['male', 'female'].includes(gender)) {
    return res.status(400).json({ error: '성별(male/female)을 입력해 주세요.' });
  }
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return res.status(400).json({ error: '생년월일(YYYY-MM-DD)을 입력해 주세요.' });
  }

  const [y, m, d] = birthDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return res.status(400).json({ error: '올바른 생년월일을 입력해 주세요.' });
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(gender, birthDate) }] }],
          generationConfig: {
            temperature: 0.9,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = geminiData?.error?.message || 'Gemini API request failed';
      return res.status(geminiRes.status).json({ error: msg });
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: 'AI 응답을 받지 못했습니다.' });
    }

    const parsed = validateResult(JSON.parse(text));
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('saju-recommend error:', err);
    return res.status(500).json({
      error: err.message || '번호 추천 중 오류가 발생했습니다.',
    });
  }
};
