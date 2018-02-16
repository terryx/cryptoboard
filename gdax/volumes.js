const { Observable } = require('rxjs')
const moment = require('moment')
const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const numeral = require('numeral')
const currency = argv.currency
const w3cwebsocket = require('websocket').w3cwebsocket

const getTotal = (size, price) => {
  return numeral(size).multiply(numeral(price).value())
}

const next = (socket) => {
  return socket.next(JSON.stringify({
    type: 'subscribe',
    channels: ['full'],
    product_ids: [
      `${currency.toUpperCase()}-USD`
    ]
  }))
}

const stream = () => {
  const websocket = Observable.webSocket({
    url: `wss://ws-feed.gdax.com`,
    WebSocketCtor: w3cwebsocket
  })

  websocket
    .filter(res => res.type === 'received')
    .distinct(res => res.order_id)
    .bufferTime(5000)
    .filter(res => res.length > 0)
    .mergeMap(res => Observable
      .from(res)
      .reduce((acc, cur) => {
        const side = cur.side.toUpperCase()
        const total = getTotal(cur.size, cur.price).value()

        if (side === 'BUY') {
          acc = numeral(acc).add(total)
        }

        if (side === 'SELL') {
          acc = numeral(acc).subtract(total)
        }

        return acc.value()
      }, 0)
    )
    .map(volume => ([ parseInt(moment().format('X')), numeral(volume).format('0.00') ]))
    .mergeMap(points => Observable.fromPromise(datadog.send([
      {
        metric: `gdax.${argv.env}.${currency.toLowerCase()}.volumes`,
        points: [ points ],
        type: 'gauge',
        host: 'api.gdax.com',
        tags: [`gdax:${argv.env}`]
      }
    ])))
    .subscribe(
      () => {},
      (err) => {
        console.error(err.message)
        websocket.complete()
      }
    )

  return next(websocket)
}

stream()
