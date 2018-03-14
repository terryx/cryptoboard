const { Observable } = require('rxjs')
const { argv } = require('yargs')
const numeral = require('numeral')
const moment = require('moment')
const bitfinex = require('./bitfinex')
const gdax = require('./gdax')
const gemini = require('./gemini')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const { symbol, productId } = argv

const stream = () => {
  return Observable
    .merge(
      bitfinex.stream(symbol),
      gdax.stream(productId),
      gemini.stream(symbol)
    )
    .scan((acc, cur) => {
      acc = acc.add(cur)

      return acc
    }, numeral(0))
    .map(total => ([ moment().format('X'), total.format('0.00') ]))
    .bufferTime(config.market.buffer_time)
    .filter(res => res.length > 0)
    .do(points => datadog.send([
      {
        metric: `market.${argv.env}.${symbol.toLowerCase()}.trades`,
        points: points,
        type: 'gauge',
        host: 'market',
        tags: [argv.env]
      }
    ]))
    .subscribe(
      console.info,
      (err) => {
        console.error(err)
        stream()
      },
      stream
    )
}

stream()
