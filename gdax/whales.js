const { Observable } = require('rxjs')
const Gdax = require('gdax')
const moment = require('moment')
const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
const numeral = require('numeral')
const request = require('request-promise')
const currency = argv.currency
const websocket = new Gdax.WebsocketClient([`${currency.toUpperCase()}-USD`])

const getTotal = (size, price) => {
  return numeral(size).multiply(numeral(price).value())
}

const buildSeriesPoint = (res, side) => Observable.from(res)
  .filter(res => res.side === side)
  .reduce((acc, cur) => {
    const point = []
    point.push(cur.time, cur.value)
    acc.push(point)

    return acc
  }, [])

const stream = () => {
  return Observable
    .fromEvent(websocket, 'message')
    .filter(res => res.type === 'received')
    .distinct(res => res.order_id)
    .filter(res => getTotal(res.size, res.price).value() >= config.gdax.filter_amount)
    .map(res => ({
      time: moment(res.time).format('X'),
      side: res.side.toUpperCase(),
      value: getTotal(res.size, res.price).format('0.00')
    }))
    .bufferTime(5000)
    .filter(res => res.length > 0)
    .mergeMap(res => Observable.zip(
      buildSeriesPoint(res, 'BUY'),
      buildSeriesPoint(res, 'SELL')
    ))
    .mergeMap(res => {
      const series = []

      if (res[0].length) {
        series.push({
          metric: `gdax.${argv.env}.${currency.toLowerCase()}.whales.buy`,
          points: res[0],
          type: 'gauge',
          host: 'api.gdax.com',
          tags: [`gdax:${argv.env}`]
        })
      }

      if (res[1].length) {
        series.push({
          metric: `gdax.${argv.env}.${currency.toLowerCase()}.whales.sell`,
          points: res[0],
          type: 'gauge',
          host: 'api.gdax.com',
          tags: [`gdax:${argv.env}`]
        })
      }

      return Observable.fromPromise(request({
        method: 'POST',
        uri: 'https://app.datadoghq.com/api/v1/series',
        qs: {
          api_key: config.datadog.api_key
        },
        body: { series },
        json: true
      }))
    })
    .subscribe(console.info, console.error)
}

stream()
