const { Observable, Subject } = require('rxjs')
const { argv } = require('yargs')
const numeral = require('numeral')
const bitfinex = require('./trades/bitfinex')
const gdax = require('./trades/gdax')
const gemini = require('./trades/gemini')
const config = require(`./config.${argv.env}`)
const notification = require('./utils/notification')
const { currency } = argv

const subject = Observable
  .merge(
    bitfinex.stream(currency),
    gdax.stream(currency),
    gemini.stream(currency)
  )
  .multicast(new Subject())

subject.connect()

const source = () => subject
  .startWith(0)
  .scan((acc, cur) => {
    acc = acc.add(cur)

    return acc
  }, numeral(0))
  .do(total => console.log(total.format('0.000a')))
  .find(total => total.value() > config.market.alert.buy || total.value() < config.market.alert.sell)
  .mergeMap(total => {
    let message = `${currency.toUpperCase()} market `
    if (total.value() > 0) {
      message += `GAIN ${total.format('0.00a')}`
    }

    if (total.value() < 0) {
      message += `LOST ${total.format('0.00a')}`
    }

    return Observable.fromPromise(notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message))
  })
  .subscribe(
    (res) => {
      console.log(res)
    },
    (err) => console.error(err.message),
    () => {
      console.log('complete')
      source()
    })

source()
