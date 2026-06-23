const { getSupabase } = require('../lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    body = JSON.parse(body);
  }
  return body || {};
}

function validateNumbers(numbers) {
  if (!Array.isArray(numbers) || numbers.length !== 6) {
    throw new Error('numbers는 1~45 범위의 6개 정수 배열이어야 합니다.');
  }
  const nums = numbers.map(Number);
  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > 45)) {
    throw new Error('numbers는 1~45 범위의 정수여야 합니다.');
  }
  if (new Set(nums).size !== 6) {
    throw new Error('numbers에 중복이 있습니다.');
  }
  return [...nums].sort((a, b) => a - b);
}

function validateBonus(bonus, numbers) {
  if (bonus === null || bonus === undefined || bonus === '') return null;
  const b = Number(bonus);
  if (!Number.isInteger(b) || b < 1 || b > 45) {
    throw new Error('bonus는 1~45 범위의 정수여야 합니다.');
  }
  if (numbers.includes(b)) {
    throw new Error('bonus는 numbers와 중복될 수 없습니다.');
  }
  return b;
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const supabase = getSupabase();

    if (req.method === 'GET') {
      const sessionId = req.query?.session_id;
      if (!sessionId) {
        return res.status(400).json({ error: 'session_id가 필요합니다.' });
      }

      const { data, error } = await supabase
        .from('lotto_draws')
        .select('id, numbers, bonus, draw_type, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return res.status(200).json({ draws: data || [] });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const sessionId = body.session_id;
      if (!sessionId) {
        return res.status(400).json({ error: 'session_id가 필요합니다.' });
      }

      const numbers = validateNumbers(body.numbers);
      const bonus = validateBonus(body.bonus, numbers);
      const drawType = body.draw_type === 'saju' ? 'saju' : 'random';

      const { data, error } = await supabase
        .from('lotto_draws')
        .insert({
          session_id: sessionId,
          numbers,
          bonus,
          draw_type: drawType,
        })
        .select('id, numbers, bonus, draw_type, created_at')
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const sessionId = req.query?.session_id;
      if (!sessionId) {
        return res.status(400).json({ error: 'session_id가 필요합니다.' });
      }

      const { error } = await supabase
        .from('lotto_draws')
        .delete()
        .eq('session_id', sessionId);

      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('draws API error:', err);
    return res.status(500).json({
      error: err.message || '추첨 기록 처리 중 오류가 발생했습니다.',
    });
  }
};
