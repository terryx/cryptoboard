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
    channel: 'book',
    pair: `${currency.toUpperCase()}USD`,
    prec: 'R0'
  }))
}

const volume = numeral(0)

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
      numeral(row[2]).value() >= config.bitfinex.currency[currency.toLowerCase()].positive ||
      numeral(row[2]).value() <= config.bitfinex.currency[currency.toLowerCase()].negative
    )
    .filter(row =>
      getTotal(row[2], row[1]).value() >= config.bitfinex.filter_amount.buy ||
      getTotal(row[2], row[1]).value() <= config.bitfinex.filter_amount.sell
    )
    .map(data => {
      const point = []
      const time = moment().format('X')
      const size = data[2]
      const price = data[1]
      const total = getTotal(size, price).value()

      if (total >= 0) {
        volume.add(total)
      }

      if (total <= 0) {
        volume.subtract(total)
      }

      point.push(time, total)

      return point
    })
    .bufferTime(5000)
    .do(() => {
      if (volume.value() >= config.bitfinex.notify_amount.buy) {
        const message = `
Bitfinex ${currency.toUpperCase()}
<b>BUY</b> wall reach ${volume.format('$0.00a')}
`
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
        volume.set(0)
      }

      if (volume.value() <= config.bitfinex.notify_amount.sell) {
        const message = `
Bitfinex ${currency.toUpperCase()}
<b>SELL</b> wall reach ${volume.format('$0.00a')}
  `
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
        volume.set(0)
      }
    })
    .filter(points => points.length > 0)
    .do(points => datadog.send([
      {
        metric: `bitfinex.${argv.env}.${currency.toLowerCase()}.whales`,
        points: points,
        type: 'gauge',
        host: 'bitfinex',
        tags: [`bitfinex:${argv.env}`]
      },
      {
        metric: `bitfinex.${argv.env}.${currency}.volumes`,
        points: [ [moment().format('X'), volume.format('0.00')] ],
        type: 'gauge',
        host: currency.toLowerCase(),
        tags: [`bitfinex:${argv.env}`]
      }
    ]))
    .subscribe(
      () => console.info(volume.format('$0.00a')),
      (err) => {
        console.error(err.message)
        websocket.complete()
      },
      () => stream()
    )

  return next(websocket)
}

stream()
