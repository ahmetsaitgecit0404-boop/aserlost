const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const GROQ_API_KEY = process.env.GROQ_KEY;
  if (!GROQ_API_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'API key not configured' }) };
  }
  try {
    const { model, messages, temperature, max_tokens, responseFormat } = JSON.parse(event.body);
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request format' }) };
    }
    const groqBody = {
      model: model || 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.3,
      max_tokens: max_tokens || 1024
    };
    if (responseFormat) groqBody.response_format = { type: 'json_object' };
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(groqBody),
      signal: AbortSignal.timeout(30000)
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq Vision API error:', groqRes.status, errText);
      return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Vision service temporarily unavailable' }) };
    }
    const data = await groqRes.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return { statusCode: 504, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Vision service did not respond' }) };
    }
    console.error('Function error:', err.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server error' }) };
  }
};
