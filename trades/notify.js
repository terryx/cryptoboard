const { Observable } = require('rxjs')
const { argv } = require('yargs')
const numeral = require('numeral')
const bitfinex = require('./bitfinex')
const gdax = require('./gdax')
const gemini = require('./gemini')
const config = require(`../config.${argv.env}`)
const notification = require('../utils/notification')
const { symbol, productId } = argv

const stream = (defaultValue = 0) => {
  return Observable
    .merge(
      bitfinex.stream(symbol),
      gdax.stream(productId),
      gemini.stream(symbol)
    )
    .scan((acc, cur) => {
      acc = acc.add(cur)

      return acc
    }, numeral(defaultValue))
    .do(total => console.log(total.format('0.000a')))
    .filter(total => total.value() >= config.market.alert.buy || total.value() <= config.market.alert.sell)
    .take(1)
    .mergeMap(total => {
      let message = 'Market trades'
      if (total.value() > 0) {
        message += ` BUY ${total.format('0.00a')}`
      }

      if (total.value() < 0) {
        message += ` SELL ${total.format('0.00a')}`
      }

      return Observable.fromPromise(notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message))
    })
    .subscribe(console.info, console.error, stream)
}

stream()
