async function tg(method, body) { const r = await fetch('https://api.telegram.org/bot' + process.env.BOT_TOKEN + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) }); return r.json(); }
module.exports = { tg };
