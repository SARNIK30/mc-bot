const mineflayer = require('mineflayer');
const dns = require('dns').promises;

const HOST = process.env.MC_HOST;
const PORT_ENV = process.env.MC_PORT;
const USERNAME = process.env.MC_USER || 'Snorlax';
const LS_PASS = process.env.LS_PASS;

if (!HOST) { console.log('❌ MC_HOST not set'); process.exit(1); }
if (!LS_PASS) { console.log('❌ LS_PASS not set'); process.exit(1); }

let bot = null;
let reconnectTimer = null;
let attempt = 0;
let shuttingDown = false;
let afkTimer = null;
let loginTries = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function resolveTarget(host) {
  if (PORT_ENV && String(PORT_ENV).trim() !== '') {
    return { host, port: Number(PORT_ENV) };
  }
  const srvName = `_minecraft._tcp.${host}`;
  try {
    const records = await dns.resolveSrv(srvName);
    const best = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
    const targetHost = best.name.endsWith('.') ? best.name.slice(0, -1) : best.name;
    return { host: targetHost, port: best.port };
  } catch {
    return { host, port: 25565 };
  }
}

function stopAfk() {
  if (afkTimer) clearInterval(afkTimer);
  afkTimer = null;
}

function startAfk() {
  stopAfk();
  // анти-AFK: лёгкое движение/поворот раз в ~55 сек
  afkTimer = setInterval(() => {
    if (!bot) return;
    try {
      bot.setControlState('jump', true);
      setTimeout(() => bot?.setControlState('jump', false), 250);

      // чуть повернуть голову
      const yaw = bot.entity?.yaw ?? 0;
      bot.look(yaw + 0.15, bot.entity?.pitch ?? 0, true);
    } catch {}
  }, 55000);
}

function cleanupBot() {
  stopAfk();
  try {
    if (bot) {
      bot.removeAllListeners();
      bot.end();
    }
  } catch {}
  bot = null;
}

function scheduleReconnect(reason = 'unknown', extraDelayMs = 0) {
  if (shuttingDown) return;
  if (reconnectTimer) return;

  attempt += 1;

  // backoff: 10s, 20s, 40s, 80s ... max 2 min
  const baseDelay = Math.min(120000, 10000 * Math.pow(2, Math.min(4, attempt - 1)));
  const delay = Math.min(180000, baseDelay + extraDelayMs); // cap 3 min

  console.log(`🔁 Reconnect in ${Math.round(delay / 1000)}s (attempt ${attempt}) | reason: ${reason}`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot().catch((e) => {
      console.log('Start error:', e?.message || e);
      scheduleReconnect('start_error');
    });
  }, delay);
}

function normalizeReason(r) {
  try {
    if (typeof r === 'string') return r;
    if (Buffer.isBuffer(r)) return r.toString('utf8');
    if (r?.toString) return r.toString();
    return JSON.stringify(r);
  } catch {
    return String(r);
  }
}

function looksLikeLoginPrompt(text) {
  const t = text.toLowerCase();
  return (
    t.includes('/login') ||
    t.includes('login') && t.includes('password') ||
    t.includes('введите пароль') ||
    t.includes('авториз') ||
    t.includes('пароль')
  );
}

async function tryLogin() {
  if (!bot) return;
  if (loginTries >= 3) return;

  loginTries += 1;
  await sleep(2000);

  try {
    bot.chat(`/login ${LS_PASS}`);
    console.log(`🔐 Sent /login (try ${loginTries}/3)`);
  } catch {}
}

async function startBot() {
  cleanupBot();
  loginTries = 0;

  const target = await resolveTarget(HOST);
  console.log(`Connecting to ${target.host}:${target.port} (domain ${HOST})`);

  bot = mineflayer.createBot({
    host: target.host,
    port: target.port,
    username: USERNAME,
    version: '1.21.11'
    //и всё равно не коннектится — делай npm update
  });

  bot.once('login', () => {
    attempt = 0;
    console.log('✅ Logged in');
  });

  bot.once('spawn', async () => {
    console.log('✅ Spawned');
    startAfk();

    // подождать, чтобы античит/логин не кикал за "слишком быстро"
    await sleep(8000);
    await tryLogin();
  });

  bot.on('messagestr', async (msg) => {
    console.log('CHAT:', msg);

    // если сервер реально просит /login — повторяем до 3 раз
    if (looksLikeLoginPrompt(msg)) {
      await tryLogin();
    }
  });

  bot.on('kicked', (reason) => {
    const text = normalizeReason(reason);
    console.log('❌ Kicked:', text);

    // если "same username already playing" — ждём дольше, пока старая сессия умрёт
    const lower = text.toLowerCase();
    if (lower.includes('already playing') || lower.includes('уже играет') || lower.includes('same username')) {
      cleanupBot();
      scheduleReconnect('already_playing', 60000); // +60s
      return;
    }

    cleanupBot();
    scheduleReconnect('kicked');
  });

  bot.on('end', () => {
    console.log('⚠ Disconnected (end)');
    cleanupBot();
    scheduleReconnect('end');
  });

  bot.on('error', (err) => {
    const code = err?.code || '';
    const msg = err?.message || String(err);
    console.log('⚠ Error:', code || msg);

    // частая история: таймауты → не ддось, просто подожди чуть дольше
    const lower = (msg || '').toLowerCase();
    if (lower.includes('timed out') || lower.includes('timeout') || code === 'ETIMEDOUT') {
      cleanupBot();
      scheduleReconnect('timeout', 20000); // +20s
      return;
    }

    cleanupBot();
    scheduleReconnect(code || 'error');
  });
}

process.on('SIGINT', () => {
  shuttingDown = true;
  console.log('Stopping...');
  cleanupBot();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shuttingDown = true;
  console.log('Stopping...');
  cleanupBot();
  process.exit(0);
});

startBot().catch((e) => {
  console.log('Start error:', e?.message || e);
  scheduleReconnect('start_error');
});
