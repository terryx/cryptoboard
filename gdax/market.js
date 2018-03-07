const moment = require('moment')
const { argv } = require('yargs')
const { Observable, Subject } = require('rxjs')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const notification = require('../utils/notification')
const numeral = require('numeral')
const gdax = require('./stream')

const accumulator = () => {
  const source = gdax
    .stream(config.gdax)
    .mergeMap(feeds => Observable
      .from(feeds)
      .groupBy(feed => feed.product_id)
      .mergeMap(innerObs => innerObs
        .reduce((acc, cur) => {
          acc = numeral(acc).add(cur.total).value()

          return acc
        }, 0)
        .map(value => ({ value: value, product: innerObs.key }))
      )
    )

  return source
}

const trackMetric = accumulator().multicast(new Subject())

trackMetric
  .mergeMap(data => {
    const currency = data.product.substr(0, 3).toLowerCase()
    return Observable
      .fromPromise(datadog.send([{
        metric: `gdax.${argv.env}.${currency}`,
        points: [ [moment().format('X'), data.value] ],
        type: 'gauge',
        host: `gdax:${currency}`,
        tags: [`gdax:${argv.env}`]
      }]))
      .mapTo(data)
  })
  .subscribe(
    (res) => console.info('metric', res),
    (err) => console.error(err.message)
  )

const volume = {
  'BTC-USD': numeral(0),
  'ETH-USD': numeral(0),
  'LTC-USD': numeral(0),
  'BCH-USD': numeral(0)
}

const notify = ({ side, product }) => {
  const message = `
GDAX ${product.toUpperCase()}
<b>${side}</b> wall ${volume[product].format('$0.00a')}
`
  return Observable
    .fromPromise(notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message))
    .do(() => volume[product].set(0))
}

trackMetric
  .concatMap(data => {
    volume[data.product].add(data.value)
    if (volume[data.product].value() >= config.gdax[data.product].notify_amount.buy) {
      return notify({ side: 'BUY', product: data.product })
    }

    if (volume[data.product].value() <= config.gdax[data.product].notify_amount.sell) {
      return notify({ side: 'SELL', product: data.product })
    }

    return Observable.of(`${data.product} ${volume[data.product].format('$0.00a')}`)
  })
  .subscribe(
    (res) => console.info('notify', res),
    (err) => console.error(err.message)
  )

trackMetric.connect()
