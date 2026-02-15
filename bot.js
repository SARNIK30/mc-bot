const mineflayer = require('mineflayer')

const HOST = process.env.MC_HOST
const PORT = parseInt(process.env.MC_PORT || 25565)
const USERNAME = process.env.MC_USER || 'Snorlax'
const VERSION = '1.21.11'
const LS_PASS = process.env.LS_PASS

if (!HOST) {
  console.log('❌ MC_HOST not set')
  process.exit(1)
}

if (!LS_PASS) {
  console.log('❌ LS_PASS not set')
  process.exit(1)
}

let bot

function startBot() {
  console.log(`Connecting to ${HOST}:${PORT}`)

  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION
  })

  bot.on('spawn', () => {
    console.log('✅ Spawned')

    setTimeout(() => {
      bot.chat(`/login ${LS_PASS}`)
      console.log('Sent /login')
    }, 3000)
  })

  bot.on('messagestr', (msg) => {
    console.log('CHAT:', msg)
  })

  bot.on('kicked', (reason) => {
    console.log('❌ Kicked:', reason)
    reconnect()
  })

  bot.on('end', () => {
    console.log('⚠ Disconnected')
    reconnect()
  })

  bot.on('error', (err) => {
    console.log('Error:', err.message)
  })
}

function reconnect() {
  console.log('Reconnecting in 30s...')
  setTimeout(startBot, 30000)
}

startBot()
