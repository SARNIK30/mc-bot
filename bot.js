const mineflayer = require('mineflayer');
const { resolveMinecraftSrv } = require('mc-dns');

const HOST = process.env.MC_HOST;              
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

let bot;

async function getTarget() {
  // Если порт задан — используем его
  if (PORT_ENV) {
    return { host: HOST, port: Number(PORT_ENV) };
  }

  // Если порт НЕ задан — пытаемся взять из SRV (_minecraft._tcp)
  try {
    const { host, port } = await resolveMinecraftSrv(HOST);
    return { host, port };
  } catch (e) {
    // Если SRV нет — fallback на 25565
    return { host: HOST, port: 25565 };
  }
}

async function startBot() {
  const target = await getTarget();
  console.log(`Connecting to ${target.host}:${target.port} (from ${HOST})`);

  bot = mineflayer.createBot({
    host: target.host,
    port: target.port,
    username: USERNAME,
    // version: '1.21.11', // если надо — раскомментируй
  });

  bot.once('spawn', () => {
    console.log('✅ Spawned');

    setTimeout(() => {
      bot.chat(`/login ${LS_PASS}`);
      console.log('Sent /login');
    }, 3000);
  });

  bot.on('messagestr', (msg) => console.log('CHAT:', msg));

  bot.on('kicked', (reason) => {
    console.log('❌ Kicked:', reason?.toString?.() ?? reason);
    reconnect();
  });

  bot.on('end', () => {
    console.log('⚠ Disconnected');
    reconnect();
  });

  bot.on('error', (err) => {
    console.log('Error:', err.code || err.message);
  });
}

function reconnect() {
  console.log('Reconnecting in 30s...');
  setTimeout(() => startBot().catch(console.error), 30000);
}

startBot().catch(console.error);
