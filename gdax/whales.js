const moment = require('moment')
const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const notification = require('../utils/notification')
const numeral = require('numeral')
const currency = argv.currency
const gdax = require('./stream')

const stream = () => {
  const data = {
    productId: `${currency.toUpperCase()}-USD`,
    filterSize: config.gdax.currency[currency],
    filterTotalPrice: config.gdax.filter_amount
  }

  const volume = numeral(0)

  return gdax
    .stream(data)
    .map(res => {
      const total = gdax.getTotal(res.remaining_size, res.price)
      const point = []

      point.push(moment(res.time).format('X'))

      const side = res.side.toUpperCase()

      if (side === 'BUY') {
        volume.add(total)
        point.push(numeral(total).format('0.00'))
      }

      if (side === 'SELL') {
        volume.subtract(total)
        point.push(numeral(0).subtract(total).format('0.00'))
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
        host: 'gdax',
        tags: [`gdax:${argv.env}`]
      },
      {
        metric: `gdax.${argv.env}.${currency}.volumes`,
        points: [ [moment().format('X'), volume.format('0.00')] ],
        type: 'gauge',
        host: currency.toLowerCase(),
        tags: [`gdax:${argv.env}`]
      }
    ]))
    .subscribe(
      () => console.info(volume.format('$0.00a')),
      (err) => {
        console.error(err.message)
        stream()
      },
      () => stream()
    )
}

stream()
