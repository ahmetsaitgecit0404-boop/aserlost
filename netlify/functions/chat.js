const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// gpt-oss / qwen3.6 reasoning modelleri: düşünme adımları da completion token
// bütçesinden yeniyor, kapatılmazsa content boş dönüyor. Kabul edilen değer
// modele göre farklı (gpt-oss: low|medium|high, qwen: none|default).
const REASONING_HEADROOM = 1200;
function reasoningEffortFor(model) {
  const m = String(model || '');
  if (m.startsWith('qwen/')) return 'none';
  if (m.startsWith('openai/gpt-oss')) return 'low';
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const GROQ_API_KEY = process.env.GROQ_KEY;
  if (!GROQ_API_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'API key not configured' }) };
  }
  try {
    const { model, messages, temperature, max_tokens } = JSON.parse(event.body);
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request format' }) };
    }
    for (const m of messages) {
      if (typeof m.content !== 'string' || m.content.length > 4096) {
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Message too long' }) };
      }
      m.content = m.content.replace(/<[^>]*>/g, '').slice(0, 4096);
    }
    const groqBody = {
      model: model || 'openai/gpt-oss-120b',
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.8,
      max_tokens: Math.max(1024, (max_tokens || 1024) + REASONING_HEADROOM),
      ...(reasoningEffortFor(model || 'openai/gpt-oss-120b') ? { reasoning_effort: reasoningEffortFor(model || 'openai/gpt-oss-120b') } : {})
    };
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(groqBody),
      signal: AbortSignal.timeout(30000)
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Chat service temporarily unavailable' }) };
    }
    const data = await groqRes.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return { statusCode: 504, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Chat service did not respond' }) };
    }
    console.error('Function error:', err.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server error' }) };
  }
};
