const { Observable } = require('rxjs')
const { w3cwebsocket } = require('websocket')
const numeral = require('numeral')
const helper = require('../utils/helper')

const constructor = (config, symbol) => {
  const url = 'wss://real.okex.com:10441/websocket'
  const api = {}

  const currency = config[symbol]

  api.tradeStream = () => {
    const websocket = Observable.webSocket({
      url,
      WebSocketCtor: w3cwebsocket
    })

    return websocket
      .mergeMap(res => Observable.from(res))
      .map(res => res.data)
      .filter(data => Array.isArray(data))
      .mergeMap(data => Observable.from(data))
      .filter(data => numeral(data[2]).value() >= currency.filter_remaining_size)
      .filter(data => helper.getTotal(data[1], data[2]) >= currency.filter_total_price)
  }

  api.next = (websocket) => {
    return websocket.next(JSON.stringify({
      event: 'addChannel',
      channel: currency.channel
    }))
  }

  return api
}

module.exports = constructor
