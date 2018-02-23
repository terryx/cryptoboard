const { Observable } = require('rxjs')
const moment = require('moment')
const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const notification = require('../utils/notification')
const numeral = require('numeral')
const Gdax = require('gdax')
const currency = argv.currency
const websocket = new Gdax.WebsocketClient([`${currency.toUpperCase()}-USD`])

const getTotal = (size, price) => {
  return numeral(size).multiply(numeral(price).value())
}

const stream = () => {
  Observable
    .fromEvent(websocket, 'message')
    .filter(res => res.type === 'received')
    .distinct(res => res.order_id)
    .filter(res => numeral(res.size).value() >= config.gdax.currency[currency])
    .filter(res => getTotal(res.size, res.price).value() >= config.gdax.filter_amount)
    .do(res => {
      const total = getTotal(res.size, res.price)

      if (total.value() >= config.gdax.notify_amount) {
        const message = `
  GDAX ${res.product_id}
  <b>${res.side.toUpperCase()}</b> ${numeral(res.size).format('0.00')} at ${total.format('$0.00a')}
  `
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
      }

      return res
    })
    .map(res => {
      const total = getTotal(res.size, res.price)
      const point = []

      point.push(moment(res.time).format('X'))

      const side = res.side.toUpperCase()

      if (side === 'BUY') {
        point.push(total.format('0.00'))
      }

      if (side === 'SELL') {
        point.push(numeral(0).subtract(total.value()).format('0.00'))
      }

      return point
    })
    .bufferTime(5000)
    .filter(res => res.length > 0)
    .do(points => Observable.fromPromise(datadog.send([
      {
        metric: `gdax.${argv.env}.${currency}.whales`,
        points: points,
        type: 'gauge',
        host: 'api.gdax.com',
        tags: [`gdax:${argv.env}`]
      }
    ])))
    .subscribe(
      console.info,
      (err) => {
        console.error(err)
        stream()
      }
    )
}

stream()
