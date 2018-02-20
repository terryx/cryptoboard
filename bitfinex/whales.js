const { Observable } = require('rxjs')
const { argv } = require('yargs')
const moment = require('moment')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const notification = require('../utils/notification')
const numeral = require('numeral')
const currency = argv.currency
const w3cwebsocket = require('websocket').w3cwebsocket

const getTotal = (size, price) => {
  return numeral(size).multiply(numeral(price).value())
}

const next = (socket) => {
  return socket.next(JSON.stringify({
    event: 'subscribe',
    channel: 'trades',
    pair: `${currency.toUpperCase()}USD`
  }))
}

const stream = () => {
  const websocket = Observable.webSocket({
    url: `wss://api.bitfinex.com/ws/2`,
    WebSocketCtor: w3cwebsocket
  })

  websocket
    .filter(res => Array.isArray(res))
    .filter(res => res[1] === 'te')
    .map(res => res[2])
    .map(data => {
      const point = []
      const time = moment(data[1]).format('X')
      const size = data[2]
      const price = data[3]
      const total = getTotal(size, price)

      point.push(time, total)

      return point
    })
    .filter(point => point[1].value() >= config.bitfinex.filter_buy_amount || point[1].value() <= config.bitfinex.filter_sell_amount)
    .do(point => {
      if (point[1].value() >= (config.bitfinex.filter_buy_amount * 5)) {
        const message = `Bitfinex ${currency.toUpperCase()}-USD BUY ${point[1].format('$0.00a')}`
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
      }

      if (point[1].value() <= (config.bitfinex.filter_buy_amount * 5)) {
        const message = `Bitfinex ${currency.toUpperCase()}-USD SELL ${point[1].format('$0.00a')}`
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
      }
    })
    .map(point => [point[0], point[1].format('0.00')])
    .bufferTime(5000)
    .filter(points => points.length > 0)
    .do(console.info)
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
      () => {},
      (err) => {
        console.error(err.message)
        websocket.complete()
      },
      () => stream()
  )

  return next(websocket)
}

stream()
