const mineflayer = require('mineflayer');

const HOST = process.env.MC_HOST; // например: snorlaxmine.mcsh.io
const PORT = Number(process.env.MC_PORT || 25565);

const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: 'Pizdamatilda228',
  version: '1.21.4'
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

bot.on('spawn', async () => {
  console.log('Spawned!');

  // Чуть рандома — меньше похоже на бота
  bot.setControlState('jump', false);

  // 1) Ходим влево-вправо
  let side = 0;
  setInterval(() => {
    side = 1 - side;

    bot.setControlState('left', side === 0);
    bot.setControlState('right', side === 1);

    // иногда прыгаем
    if (Math.random() < 0.18) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 250);
    }
  }, 2500);

  // 2) Ломаем блок перед собой (ОСТОРОЖНО: может триггерить античит)
  // Паузы и случайность добавлены специально.
  while (true) {
    try {
      await sleep(4500 + Math.floor(Math.random() * 2500));

      // блок по прицелу до 4 блоков
      const block = bot.blockAtCursor(4);
      if (!block) continue;

      const name = block.name || '';

      // не ломаем очевидно "плохие" цели
      if (
        name === 'air' ||
        name.includes('water') ||
        name.includes('lava') ||
        name === 'bedrock'
      ) continue;

      // иногда пропускаем действие
      if (Math.random() < 0.35) continue;

      // повернуться и копать
      await bot.dig(block, true);
      console.log('Dug:', name);
    } catch (e) {
      // частые мелкие ошибки норм (не достал, блок уже сломан, лагает, и т.д.)
      // Главное — не падаем.
      console.log('Dig error:', String(e?.message || e));
    }
  }
});

bot.on('kicked', (reason) => {
  console.log('Kicked:', reason);
  process.exit(1); // чтобы workflow заметил и перезапустил
});

bot.on('end', () => {
  console.log('Disconnected');
  process.exit(1);
});

bot.on('error', (err) => {
  console.log('Error:', err);
});
