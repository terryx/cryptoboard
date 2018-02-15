const { Observable } = require('rxjs')
const Gdax = require('gdax')
const moment = require('moment')
const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const numeral = require('numeral')
const currency = argv.currency

const getTotal = (size, price) => {
  return numeral(size).multiply(numeral(price).value())
}

const websocket = new Gdax.WebsocketClient([`${currency.toUpperCase()}-USD`])

const stream = () => {
  return Observable
    .fromEvent(websocket, 'message')
    .filter(res => res.type === 'received')
    .distinct(res => res.order_id)
    .filter(res => getTotal(res.size, res.price).value() >= config.gdax.filter_amount)
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
    .do(console.info)
    .mergeMap(points => Observable.fromPromise(datadog.send([
      {
        metric: `gdax.${argv.env}.${currency.toLowerCase()}.whales`,
        points: points,
        type: 'gauge',
        host: 'api.gdax.com',
        tags: [`gdax:${argv.env}`]
      }
    ])))
    .subscribe({}, console.error)
}

stream()
