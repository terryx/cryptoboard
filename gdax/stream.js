const { Observable } = require('rxjs')
const numeral = require('numeral')
const Gdax = require('gdax')

const getTotal = (size, price) => {
  return numeral(size).multiply(numeral(price).value()).value()
}

const stream = ({ productId, filterSize, filterTotalPrice }) => {
  const websocket = new Gdax.WebsocketClient([ productId ])

  return Observable
    .fromEvent(websocket, 'message')
    .takeUntil(Observable.fromEvent(websocket, 'close'))
    .filter(feed => feed.reason !== 'canceled')
    .filter(feed => feed.type === 'open')
    .filter(feed => numeral(feed.remaining_size).value() >= filterSize)
    .filter(feed => getTotal(feed.remaining_size, feed.price) >= filterTotalPrice)
    .bufferCount(10)
    .mergeMap(feeds => Observable.from(feeds).distinct(feed => feed.order_id))
}

module.exports = { getTotal, stream }
