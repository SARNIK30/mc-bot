const mineflayer = require('mineflayer');
const dns = require('dns').promises;

const HOST = process.env.MC_HOST;                 
const PORT_ENV = process.env.MC_PORT;             // можно не задавать
const USERNAME = process.env.MC_USER || 'Snorlax';
const LS_PASS = process.env.LS_PASS;

if (!HOST) {
  console.log('❌ MC_HOST not set');
  process.exit(1);
}
if (!LS_PASS) {
  console.log('❌ LS_PASS not set');
  process.exit(1);
}

let bot = null;
let reconnectTimer = null;
let attempt = 0;
let shuttingDown = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function cleanupBot() {
  try {
    if (bot) {
      bot.removeAllListeners();
      bot.end(); // безопасно закрыть
    }
  } catch {}
  bot = null;
}

function scheduleReconnect(reason = 'unknown') {
  if (shuttingDown) return;
  if (reconnectTimer) return; // уже запланировано

  attempt += 1;

  // backoff: 5s, 10s, 20s, 40s ... max 2 min
  const delay = Math.min(120000, 5000 * Math.pow(2, Math.min(5, attempt - 1)));

  console.log(`🔁 Reconnect scheduled in ${Math.round(delay / 1000)}s (attempt ${attempt}) | reason: ${reason}`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot().catch((e) => {
      console.log('Start error:', e?.message || e);
      scheduleReconnect('start_error');
    });
  }, delay);
}

async function startBot() {
  cleanupBot();

  const target = await resolveTarget(HOST);
  console.log(`Connecting to ${target.host}:${target.port} (domain ${HOST})`);

  bot = mineflayer.createBot({
    host: target.host,
    port: target.port,
    username: USERNAME,
    version: '1.21.11', // если надо — раскомментируй
  });

  // если подключилось — сбрасываем попытки
  bot.once('login', () => {
    attempt = 0;
    console.log('✅ Logged in');
  });

  bot.once('spawn', async () => {
    console.log('✅ Spawned');

    // чтобы античит/логин не кикал за "слишком быстро"
    await sleep(10000);

    try {
      bot.chat(`/login ${LS_PASS}`);
      console.log('Sent /login');
    } catch {}
  });

  bot.on('messagestr', (msg) => {
    console.log('CHAT:', msg);
  });

  bot.on('kicked', (reason) => {
    console.log('❌ Kicked:', reason?.toString?.() ?? reason);
    scheduleReconnect('kicked');
  });

  bot.on('end', () => {
    console.log('⚠ Disconnected (end)');
    scheduleReconnect('end');
  });

  bot.on('error', (err) => {
    // IMPORTANT: error может прилетать пачкой — но reconnect планируем один раз
    console.log('⚠ Error:', err?.code || err?.message || err);
    scheduleReconnect(err?.code || 'error');
  });
}

// аккуратное завершение (GitHub runner иногда шлёт SIGTERM)
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
