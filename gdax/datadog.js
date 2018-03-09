const moment = require('moment')
const { argv } = require('yargs')
const { Observable } = require('rxjs')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const numeral = require('numeral')
const gdax = require('./stream')
const helper = require('../utils/helper')

const market = gdax.stream(config.gdax)

market
  .mergeMap(innerObs => {
    return innerObs
      .skipWhile(feed => config.gdax[feed.product_id] === undefined)
      .filter(feed => feed.size >= config.gdax[feed.product_id].size)
      .filter(feed => helper.getTotal(feed.size, feed.price) >= config.gdax[feed.product_id].filter_total_price)
      .map(feed => {
        const total = helper.getTotal(feed.size, feed.price)
        const time = moment(feed.time).format('X')
        const volume = numeral(0)
        if (feed.side === 'buy') {
          volume.add(total)
        }

        if (feed.side === 'sell') {
          volume.subtract(total)
        }

        return { time, value: volume.value() }
      })
      .bufferTime(config.gdax.buffer_time)
      .map(data => ({ product: innerObs.key, data }))
  })
  .filter(res => res.data.length > 0)
  .mergeMap(res => {
    const currency = res.product.substr(0, 3).toLowerCase()
    return Observable
      .from(res.data)
      .reduce((acc, cur) => {
        const tick = []
        tick.push(cur.time, cur.value)
        acc.push(tick)

        return acc
      }, [])
      .map(ticks => ({ currency, ticks }))
  })
  .mergeMap(data => Observable
    .fromPromise(datadog.send([{
      metric: `gdax.${argv.env}.${data.currency}`,
      points: data.ticks,
      type: 'gauge',
      host: `gdax:${data.currency}`,
      tags: [`gdax:${argv.env}`]
    }]))
    .mapTo(data)
  )
  .subscribe(
    (res) => console.info('datadog', res),
    (err) => console.error(err.message)
  )

market.connect()
