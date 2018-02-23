const { Observable } = require('rxjs')
const moment = require('moment')
const { argv } = require('yargs')
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
    type: 'subscribe',
    channels: ['full'],
    product_ids: [
      `${currency.toUpperCase()}-USD`
    ]
  }))
}

const volume = numeral(0)

const stream = () => {
  const websocket = Observable.webSocket({
    url: `wss://ws-feed.gdax.com`,
    WebSocketCtor: w3cwebsocket
  })

  websocket
    .filter(res => res.type === 'received')
    .distinct(res => res.order_id)
    .filter(res => numeral(res.size).value() >= config.gdax.currency[currency])
    .filter(res => getTotal(res.size, res.price).value() >= config.gdax.filter_amount)
    .map(res => {
      const total = getTotal(res.size, res.price)
      const point = []

      point.push(moment(res.time).format('X'))

      const side = res.side.toUpperCase()

      if (side === 'BUY') {
        volume.add(total.value())
        point.push(total.format('0.00'))
      }

      if (side === 'SELL') {
        volume.subtract(total.value())
        point.push(numeral(0).subtract(total.value()).format('0.00'))
      }

      return point
    })
    .bufferTime(5000)
    .do(() => {
      if (volume.value() >= config.gdax.notify_amount.buy) {
        const message = `
GDAX ${currency.toUpperCase()}
<b>BUY</b> wall reach ${volume.format('$0.00a')}
`
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
        volume.set(0)
      }

      if (volume.value() <= config.gdax.notify_amount.sell) {
        const message = `
GDAX ${currency.toUpperCase()}
<b>SELL</b> wall reach ${volume.format('$0.00a')}
  `
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
        volume.set(0)
      }
    })
    .filter(res => res.length > 0)
    .do(points => datadog.send([
      {
        metric: `gdax.${argv.env}.${currency}.whales`,
        points: points,
        type: 'gauge',
        host: 'api.gdax.com',
        tags: [`gdax:${argv.env}`]
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
