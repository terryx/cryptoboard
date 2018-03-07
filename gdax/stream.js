const { Observable } = require('rxjs')
const numeral = require('numeral')
const Gdax = require('gdax')

const getTotal = (size, price) => {
  return numeral(size).multiply(numeral(price).value()).value()
}

const stream = (config) => {
  const websocket = new Gdax.WebsocketClient(config.products)

  return Observable
    .fromEvent(websocket, 'message')
    .takeUntil(Observable.fromEvent(websocket, 'close'))
    .filter(feed => feed.reason !== 'canceled')
    .filter(feed => feed.type === 'open')
    .groupBy(feed => feed.product_id)
    .mergeMap(innerObs => {
      return innerObs
        .skipWhile(feed => config[feed.product_id] === undefined)
        .filter(feed => feed.remaining_size >= config[feed.product_id].filter_remaining_size)
        .filter(feed => getTotal(feed.remaining_size, feed.price) >= config[feed.product_id].filter_total_price)
        .map(feed => {
          const volume = numeral(0)
          const total = getTotal(feed.remaining_size, feed.price)
          if (feed.side === 'buy') {
            volume.add(total)
          }

          if (feed.side === 'sell') {
            volume.subtract(total)
          }

          return {
            product_id: feed.product_id,
            total: volume.value()
          }
        })
    })
    .bufferTime(config.buffer_time)
    .filter(feeds => feeds.length > 0)
}

module.exports = { getTotal, stream }
