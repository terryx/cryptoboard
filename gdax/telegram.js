const { argv } = require('yargs')
const { Observable } = require('rxjs')
const config = require(`../config.${argv.env}`)
const notification = require('../utils/notification')
const numeral = require('numeral')
const gdax = require('./stream')
const helper = require('../utils/helper')

const market = gdax.stream(config.gdax)
const volume = {
  'BTC-USD': numeral(0),
  'ETH-USD': numeral(0),
  'LTC-USD': numeral(0),
  'BCH-USD': numeral(0)
}

market
  .mergeMap(innerObs => {
    return innerObs
      .skipWhile(feed => config.gdax[feed.product_id] === undefined)
      .filter(feed => feed.size >= config.gdax[feed.product_id].size)
      .filter(feed => helper.getTotal(feed.size, feed.price) >= config.gdax[feed.product_id].filter_total_price)
      .map(feed => {
        const total = helper.getTotal(feed.size, feed.price)
        if (feed.side === 'buy') {
          volume[feed.product_id].add(total)
        }

        if (feed.side === 'sell') {
          volume[feed.product_id].subtract(total)
        }

        return { product: innerObs.key, total: volume[feed.product_id].value() }
      })
      .filter(data =>
        (data.total >= config.gdax[data.product].notify_amount.buy) ||
        (data.total <= config.gdax[data.product].notify_amount.sell)
      )
      .debounceTime(1000)
      .mergeMap(data => {
        const side = data.total > 0 ? 'BUY' : 'SELL'
        const message = `<b>${side}</b> ${data.product} ${numeral(data.total).format('$0.00a')}`
        volume[data.product].set(0)

        return Observable
          .fromPromise(notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message))
          .mapTo(data)
      })
  })
  .subscribe(
    (res) => console.info('telegram', res),
    (err) => console.error(err.message)
  )

market.connect()
