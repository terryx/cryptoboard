const { Observable } = require('rxjs')
const { argv } = require('yargs')
const moment = require('moment')
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
    event: 'subscribe',
    channel: 'book',
    pair: `${currency.toUpperCase()}USD`,
    prec: 'R0'
  }))
}

const stream = () => {
  const websocket = Observable.webSocket({
    url: `wss://api.bitfinex.com/ws/2`,
    WebSocketCtor: w3cwebsocket
  })

  websocket
    .filter(res => Array.isArray(res))
    .map(res => res[1])
    .skip(1)
    .filter(row => row[1] > 0)
    .filter(row =>
      numeral(row[2]).value() >= config.bitfinex.currency_amount[currency.toLowerCase()].positive ||
      numeral(row[2]).value() <= config.bitfinex.currency_amount[currency.toLowerCase()].negative
    )
    .filter(row =>
      getTotal(row[2], row[1]).value() >= config.bitfinex.filter_buy_amount ||
      getTotal(row[2], row[1]).value() <= config.bitfinex.filter_sell_amount
    )
    .map(data => {
      const point = []
      const time = moment().format('X')
      const size = data[2]
      const price = data[1]
      const total = getTotal(size, price).value()

      point.push(time, total)

      return point
    })
    .bufferTime(5000)
    .filter(points => points.length > 0)
    .mergeMap(points => Observable.fromPromise(datadog.send([
      {
        metric: `bitfinex.${argv.env}.${currency.toLowerCase()}.whales`,
        points: points,
        type: 'gauge',
        host: currency.toLowerCase(),
        tags: [`bitfinex:${argv.env}`]
      }
    ])))
    .subscribe(
      console.info,
      (err) => {
        console.error(err.message)
        websocket.complete()
      },
      () => stream()
  )

  return next(websocket)
}

stream()
