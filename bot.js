const mineflayer = require('mineflayer');

const HOST = process.env.MC_HOST;
const PORT = Number(process.env.MC_PORT || 25565);
const USERNAME = 'Pizdamatilda228';
const VERSION = '1.21.4';
const LS_PASS = process.env.LS_PASS; // пароль для LoginSecurity

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

if (!HOST || !PORT) {
  console.log('Missing MC_HOST or MC_PORT secrets');
  process.exit(1);
}
if (!LS_PASS) {
  console.log('Missing LS_PASS secret (LoginSecurity password)');
  process.exit(1);
}

let bot;

function scheduleReconnect() {
  console.log('Reconnecting in 30s...');
  setTimeout(() => startBot(), 30000);
}

function startBot() {
  console.log(`Connecting to ${HOST}:${PORT} as ${USERNAME}`);

  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION
  });

  // Печать всех сообщений сервера
  bot.on('message', (msg) => {
    const text = msg.toString();
    console.log('CHAT:', text);
  });

  // Авто-логин для LoginSecurity/AuthMe-подобных
  bot.on('messagestr', async (text) => {
    const t = text.toLowerCase();

    // часто сервер пишет "Please register" / "Use /register" / "Please login" и т.п.
    if (t.includes('/register')) {
      await sleep(1200);
      bot.chat(`/register ${LS_PASS} ${LS_PASS}`);
      console.log('Sent /register');
      return;
    }

    if (t.includes('/login')) {
      await sleep(1200);
      bot.chat(`/login ${LS_PASS}`);
      console.log('Sent /login');
      return;
    }
  });

  bot.once('spawn', async () => {
    console.log('Spawned! Waiting a bit for LoginSecurity...');

    // даём серверу время прислать подсказку /login или /register
    await sleep(3000);

    // если подсказку не поймали, попробуем login (безопасно: если уже залогинен — просто скажет ошибку)
    bot.chat(`/login ${LS_PASS}`);
    console.log('Tried /login (fallback)');

    // начинаем активность чуть позже, чтобы не триггерить плагины сразу после входа
    await sleep(4000);

    // Ходим влево-вправо
    let side = 0;
    setInterval(() => {
      side = 1 - side;
      bot.setControlState('left', side === 0);
      bot.setControlState('right', side === 1);

      if (Math.random() < 0.18) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 250);
      }
    }, 2500);

    // Копаем блок
    while (true) {
      await sleep(4500 + Math.floor(Math.random() * 2500));
      try {
        const block = bot.blockAtCursor(4);
        if (!block) continue;

        const name = block.name || '';
        if (
          name === 'air' ||
          name.includes('water') ||
          name.includes('lava') ||
          name === 'bedrock'
        ) continue;

        if (Math.random() < 0.35) continue;

        await bot.dig(block, true);
        console.log('Dug:', name);
      } catch (e) {
        console.log('Dig error:', String(e?.message || e));
      }
    }
  });

  bot.on('kicked', (reason) => {
    try {
      console.log('Kicked raw:', JSON.stringify(reason, null, 2));
    } catch {
      console.log('Kicked:', String(reason));
    }
    scheduleReconnect();
  });

  bot.on('end', () => {
    console.log('Disconnected');
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    console.log('Error:', err?.message || err);
  });
}

startBot();
