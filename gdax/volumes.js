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

const stream = () => {
  return Observable
    .fromEvent(websocket, 'message')
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
    .mergeMap(res => Observable.fromPromise(request({
      method: 'POST',
      uri: 'https://app.datadoghq.com/api/v1/series',
      qs: {
        api_key: config.datadog.api_key
      },
      body: {
        series: [
          {
            metric: `gdax.${argv.env}.${currency.toLowerCase()}.volumes`,
            points: [[res.time, res.value]],
            type: 'gauge',
            host: 'api.gdax.com',
            tags: [`gdax:${argv.env}`]
          }
        ]
      },
      json: true
    })))
    .subscribe(
      console.log,
      console.log
    )
}

stream()
