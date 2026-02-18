const mineflayer = require('mineflayer');
const dns = require('dns').promises;

const HOST = process.env.MC_HOST;                 // 
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

let bot;

async function resolveTarget(host) {
  // если порт задан вручную — используем его
  if (PORT_ENV && String(PORT_ENV).trim() !== '') {
    return { host, port: Number(PORT_ENV) };
  }

  // пробуем SRV _minecraft._tcp.<host>
  const srvName = `_minecraft._tcp.${host}`;
  try {
    const records = await dns.resolveSrv(srvName);
    const best = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];

    const targetHost = best.name.endsWith('.') ? best.name.slice(0, -1) : best.name;
    return { host: targetHost, port: best.port };
  } catch {
    // если SRV нет — fallback
    return { host, port: 25565 };
  }
}

async function startBot() {
  const target = await resolveTarget(HOST);
  console.log(`Connecting to ${target.host}:${target.port} (domain ${HOST})`);

  bot = mineflayer.createBot({
    host: target.host,
    port: target.port,
    username: USERNAME,
    version: '1.21.11', // если нужно — раскомментируй
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
