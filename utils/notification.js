const Telegram = require('telegraf/telegram')

const sendMessage = (token, channel, message) => {
  const bot = new Telegram(token)

  return bot.sendMessage(channel, message, { parse_mode: 'HTML' })
}

module.exports = { sendMessage }
