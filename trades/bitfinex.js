const { Observable } = require('rxjs')
const numeral = require('numeral')
const w3cwebsocket = require('websocket').w3cwebsocket
const helper = require('../utils/helper')

const next = (socket, symbol) => {
  return socket.next(JSON.stringify({
    event: 'subscribe',
    channel: 'trades',
    symbol: `${symbol.toUpperCase()}`
  }))
}

const stream = (symbol) => {
  const websocket = Observable.webSocket({
    url: `wss://api.bitfinex.com/ws/2`,
    WebSocketCtor: w3cwebsocket
  })

  next(websocket, symbol)

  return websocket
    .filter(res => Array.isArray(res))
    .skip(1)
    .filter(res => res[1] === 'tu')
    .map(res => helper.getTotal(res[2][2], res[2][3]))
    .scan((acc, cur) => {
      acc.add(cur)

      return acc
    }, numeral(0))
    .map(total => total.value())
}

module.exports = { stream }
