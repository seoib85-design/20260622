const { getSupabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const hasUrl = !!process.env.SUPABASE_URL;
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  let dbOk = false;
  let dbError = null;

  if (hasUrl && hasKey) {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('lotto_draws').select('id').limit(1);
      dbOk = !error;
      if (error) dbError = error.message;
    } catch (err) {
      dbError = err.message;
    }
  }

  return res.status(200).json({
    version: 'supabase-v2',
    supabaseEnv: hasUrl && hasKey,
    supabaseDb: dbOk,
    error: dbError,
  });
};
