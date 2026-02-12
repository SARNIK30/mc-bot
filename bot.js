const mineflayer = require('mineflayer');

const HOST = process.env.MC_HOST;
const PORT = Number(process.env.MC_PORT || 25565);
const USERNAME = 'Snorlax';
const VERSION = '1.21.11';
const LS_PASS = process.env.LS_PASS; // Secret

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

if (!HOST || !PORT) {
  console.log('Missing MC_HOST or MC_PORT secrets');
  process.exit(1);
}
if (!LS_PASS) {
  console.log('Missing LS_PASS secret (LoginSecurity password)');
  process.exit(1);
}

let bot = null;
let ready = false;     // ✅ теперь объявлено
let authed = false;    // чтобы не спамить /login
let startedLoops = false;

function reconnect() {
  console.log('Reconnecting in 60s...');
  setTimeout(() => startBot(), 30000);
}

function safeText(x) {
  try { return String(x); } catch { return '<unprintable>'; }
}

function startBot() {
  console.log(`Connecting to ${HOST}:${PORT} as ${USERNAME}`);

  // сброс флагов на каждый новый коннект
  ready = false;
  authed = false;
  startedLoops = false;

  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION
  });

  // Логи чата
  bot.on('message', (msg) => {
    console.log('CHAT:', msg.toString());
  });

  // LoginSecurity авто-команды
  bot.on('messagestr', async (text) => {
    const t = text.toLowerCase();

    if (t.includes('successfully logged in') || t.includes('успешно вош')) {
      authed = true;
      return;
    }

    // Если просит /register
    if (t.includes('/register')) {
      await sleep(1200);
      bot.chat(`/register ${LS_PASS} ${LS_PASS}`);
      console.log('Sent /register');
      return;
    }

    // Если просит /login
    if (t.includes('/login')) {
      if (authed) return;
      await sleep(1200);
      bot.chat(`/login ${LS_PASS}`);
      console.log('Sent /login');
      return;
    }
  });

  bot.once('spawn', async () => {
    console.log('Spawned! Waiting a bit for LoginSecurity...');
    ready = false;

    // ждём подсказки /login, потом fallback
    await sleep(3000);
    if (!authed) {
      bot.chat(`/login ${LS_PASS}`);
      console.log('Tried /login (fallback)');
    }

    // Дадим миру догрузиться + чтобы не ловить "moved wrongly" сразу
    await sleep(5000);

    // считаем "готов" только если есть entity/позиция
    if (bot.entity && bot.entity.position) {
      ready = true;
    }

    // запускаем циклы один раз за подключение
    if (!startedLoops) {
      startedLoops = true;
      startMovementLoop();
      startDigLoop();
    }
  });

  // После респавна — снова пауза и "ready"
  bot.on('respawn', async () => {
    console.log('Respawned');
    ready = false;
    bot.clearControlStates();
    await sleep(5000);
    ready = Boolean(bot.entity && bot.entity.position);
  });

  // Если умер — попробуем respawn (и остановим движения)
  bot.on('death', async () => {
    console.log('Died -> stopping movement and respawn');
    ready = false;
    bot.clearControlStates();
    await sleep(1500);
    try { bot.respawn(); } catch {}
  });

  bot.on('kicked', (reason) => {
    try {
      console.log('Kicked raw:', JSON.stringify(reason, null, 2));
    } catch {
      console.log('Kicked:', safeText(reason));
    }
    reconnect();
  });

  bot.on('end', () => {
  console.log('Отключен. Переподключение через 15 сек...')
  setTimeout(createBot, 15000)
})

  bot.on('error', (err) => {
    console.log('Error:', err?.message || err);
  });
}

// Мягкие "тапы" вместо удержания (меньше moved wrongly)
async function tap(key, ms) {
  if (!bot) return;
  bot.setControlState(key, true);
  await sleep(ms);
  bot.setControlState(key, false);
}

function startMovementLoop() {
  setInterval(async () => {
    if (!bot || !ready || !bot.entity || !bot.entity.position) return;

    // иногда вообще ничего не делаем
    if (Math.random() < 0.25) return;

    // лево/право коротко
    if (Math.random() < 0.5) await tap('left', 180 + Math.floor(Math.random() * 220));
    else await tap('right', 180 + Math.floor(Math.random() * 220));

    // редкий прыжок
    if (Math.random() < 0.10) await tap('jump', 120);
  }, 2500);
}

function startDigLoop() {
  (async () => {
    while (true) {
      await sleep(8000 + Math.floor(Math.random() * 7000)); // реже, чтобы не палиться
      if (!bot || !ready || !authed || !bot.entity || !bot.entity.position) continue;

      try {
        const block = bot.blockAtCursor(4);
        if (!block) continue;

        const name = block.name || '';

        // НЕ трогаем опасное/контейнеры/механизмы
        const deny = [
          'air', 'water', 'lava', 'bedrock',
          'chest', 'barrel', 'shulker', 'furnace', 'hopper',
          'door', 'trapdoor', 'button', 'lever', 'pressure_plate'
        ];
        if (deny.some(d => name.includes(d))) continue;

        // иногда пропускаем
        if (Math.random() < 0.45) continue;

        await bot.dig(block, true);
        console.log('Dug:', name);
      } catch (e) {
        console.log('Dig error:', safeText(e?.message || e));
      }
    }
  })();
}

// Если Mineflayer/physics крашнется — не даём workflow умереть
process.on('uncaughtException', (err) => {
  console.log('uncaughtException:', err);
  try { bot?.end(); } catch {}
  reconnect();
});

startBot();
