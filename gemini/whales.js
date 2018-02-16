const { Observable } = require('rxjs')
const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
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
      .filter(event => getTotal(event.price, event.delta).value() >= config.gemini.filter_amount)
      .map(event => {
        const total = getTotal(event.price, event.delta)
        const point = []

        point.push(res.timestamp)

        const side = event.side.toUpperCase()

        if (side === 'BID') {
          point.push(total.format('0.00'))
        }

        if (side === 'ASK') {
          point.push(numeral(0).subtract(total.value()).format('0.00'))
        }

        return point
      })
    )
    .bufferTime(5000)
    .filter(res => res.length > 0)
    .do(console.info)
    .mergeMap(points => Observable.fromPromise(datadog.send([
      {
        metric: `gemini.${argv.env}.${currency.toLowerCase()}.whales`,
        points: points,
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
