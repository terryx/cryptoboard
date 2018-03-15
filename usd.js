const { Observable } = require('rxjs')
const { argv } = require('yargs')
const numeral = require('numeral')
const moment = require('moment')
const bitfinex = require('./trades/bitfinex')
const gdax = require('./trades/gdax')
const gemini = require('./trades/gemini')
const config = require(`./config.${argv.env}`)
const datadog = require('./utils/datadog')(config.datadog.api_key)
const { currency } = argv

const stream = () => {
  const source = Observable
    .merge(
      bitfinex.stream(currency),
      gdax.stream(currency),
      gemini.stream(currency)
    )
    .scan((acc, cur) => {
      acc = acc.add(cur)

      return acc
    }, numeral(0))
    .find(total => total.value() > config.market.point.buy || total.value() < config.market.point.sell)
    .map(total => ([ moment().format('X'), total.format('0.00') ]))
    .do(point => datadog.send([
      {
        metric: `market.${argv.env}.${currency.toLowerCase()}_usd.trades`,
        points: [ point ],
        type: 'gauge',
        host: 'market',
        tags: [argv.env]
      }
    ]))

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
