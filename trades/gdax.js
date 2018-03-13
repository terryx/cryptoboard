const { Observable } = require('rxjs')
const Gdax = require('gdax')
const numeral = require('numeral')
const helper = require('../utils/helper')

const stream = (productId) => {
  const websocket = new Gdax.WebsocketClient([productId.toUpperCase()])

  return Observable
    .fromEvent(websocket, 'message')
    .takeUntil(Observable.fromEvent(websocket, 'close'))
    .filter(feed => feed.type === 'match')
    .scan((acc, cur) => {
      const total = helper.getTotal(cur.size, cur.price)
      if (cur.side === 'buy') {
        acc.add(total)
      } else {
        acc.subtract(total)
      }

      return acc
    }, numeral(0))
    .map(total => total.value())
}

module.exports = { stream }
