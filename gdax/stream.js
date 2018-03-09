const { Observable, Subject } = require('rxjs')
const Gdax = require('gdax')

const stream = (config) => {
  const websocket = new Gdax.WebsocketClient(['BTC-USD', 'ETH-USD', 'LTC-USD', 'BCH-USD'])

  return Observable
    .fromEvent(websocket, 'message')
    .takeUntil(Observable.fromEvent(websocket, 'close'))
    .filter(feed => feed.type === 'received')
    .groupBy(feed => feed.product_id)
    .multicast(new Subject())
}

module.exports = { stream }
