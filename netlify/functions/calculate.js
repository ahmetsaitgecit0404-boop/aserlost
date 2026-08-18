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
    for (const m of messages) {
      if (typeof m.content === 'string') {
        if (m.content.length > 8000) {
          return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Message too long' }) };
        }
        m.content = m.content.replace(/<[^>]*>/g, '').slice(0, 8000);
      }
    }
    const groqBody = {
      model: model || 'openai/gpt-oss-120b',
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.3,
      max_tokens: max_tokens || 2048
    };
    if (responseFormat) groqBody.response_format = { type: 'json_object' };
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(groqBody),
      signal: AbortSignal.timeout(45000)
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI service temporarily unavailable' }) };
    }
    const data = await groqRes.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return { statusCode: 504, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI service did not respond' }) };
    }
    console.error('Function error:', err.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server error' }) };
  }
};
