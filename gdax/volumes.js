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
    .scan((acc, cur) => {
      const side = cur.side.toUpperCase()
      const total = getTotal(cur.size, cur.price)

      if (side === 'BUY') {
        acc.value = numeral(acc.value).add(total.value())
      }

      if (side === 'SELL') {
        acc.value = numeral(acc.value).subtract(total.value())
      }

      return {
        value: acc.value.value(),
        time: moment(cur.time).format('X')
      }
    }, { value: 0, time: '' })
    .throttleTime(5000)
    .mergeMap(res => Observable.fromPromise(datadog.send([
      {
        metric: `gdax.${argv.env}.${currency.toLowerCase()}.volumes`,
        points: [[res.time, res.value]],
        type: 'gauge',
        host: 'api.gdax.com',
        tags: [`gdax:${argv.env}`]
      }
    ])))
    .subscribe(
      console.log,
      console.log
    )

  return next(websocket)
}

stream()
