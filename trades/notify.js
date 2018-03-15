const { Observable } = require('rxjs')
const { argv } = require('yargs')
const numeral = require('numeral')
const bitfinex = require('./bitfinex')
const gdax = require('./gdax')
const gemini = require('./gemini')
const config = require(`../config.${argv.env}`)
const notification = require('../utils/notification')
const { currency } = argv

const stream = (defaultValue = 0) => {
  const source = Observable
    .merge(
      bitfinex.stream(currency),
      gdax.stream(currency),
      gemini.stream(currency)
    )
    .scan((acc, cur) => {
      acc = acc.add(cur)

      return acc
    }, numeral(defaultValue))
    .do(total => console.log(total.format('0.000a')))
    .find(total => total.value() >= config.market.alert.buy || total.value() <= config.market.alert.sell)
    .mergeMap(total => {
      let message = `${currency.toUpperCase()} market`
      if (total.value() > 0) {
        message += ` GAIN ${total.format('0.00a')}`
      }

      if (total.value() < 0) {
        message += ` LOST ${total.format('0.00a')}`
      }

      return Observable.fromPromise(notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message))
    })

  return source.subscribe(
    console.info,
    (err) => {
      console.error(err)
      stream()
    },
    stream
  )
}

stream()
