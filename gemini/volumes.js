const { Observable } = require('rxjs')
const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
const moment = require('moment')
const datadog = require('../utils/datadog')(config.datadog.api_key)
const numeral = require('numeral')
const currency = argv.currency
const w3cwebsocket = require('websocket').w3cwebsocket

const getTotal = (size, price) => {
  return numeral(size).multiply(numeral(price).value())
}

const stream = () => {
  const websocket = Observable.webSocket({
    url: `wss://api.gemini.com/v1/marketdata/${currency.toUpperCase()}USD`,
    WebSocketCtor: w3cwebsocket
  })

  websocket
    .filter(res => res.type !== 'initial')
    .mergeMap(res => Observable
      .from(res.events)
      .filter(event => event.reason === 'place' && numeral(event.delta).value() > 0)
    )
    .bufferTime(5000)
    .filter(res => res.length > 0)
    .mergeMap(res => Observable
      .from(res)
      .reduce((acc, cur) => {
        const total = getTotal(cur.price, cur.delta).value()
        const side = cur.side.toUpperCase()

        if (side === 'BID') {
          acc = numeral(acc).add(total)
        }

        if (side === 'ASK') {
          acc = numeral(acc).subtract(total)
        }

        return acc.value()
      }, 0)
    )
    .map(volume => ([ parseInt(moment().format('X')), numeral(volume).format('0.00') ]))
    .do(console.log)
    .mergeMap(points => Observable.fromPromise(datadog.send([
      {
        metric: `gemini.${argv.env}.${currency.toLowerCase()}.volumes`,
        points: [ points ],
        type: 'gauge',
        host: 'api.gemini.com',
        tags: [`gemini:${argv.env}`]
      }
    ])))
    .subscribe(
      () => {},
      (err) => {
        console.error(err.message)
        websocket.complete()
      },
      () => stream()
    )
}

stream()
