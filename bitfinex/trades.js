const { Observable } = require('rxjs')
const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const moment = require('moment')
const numeral = require('numeral')
const symbol = argv.symbol
const w3cwebsocket = require('websocket').w3cwebsocket
const helper = require('../utils/helper')

const next = (socket) => {
  return socket.next(JSON.stringify({
    event: 'subscribe',
    channel: 'trades',
    symbol: `${symbol.toUpperCase()}`
  }))
}

const stream = () => {
  const websocket = Observable.webSocket({
    url: `wss://api.bitfinex.com/ws/2`,
    WebSocketCtor: w3cwebsocket
  })

  websocket
    .filter(res => Array.isArray(res))
    .skip(1)
    .filter(res => res[1] === 'tu')
    .map(res => helper.getTotal(res[2][2], res[2][3]))
    .bufferTime(config.bitfinex.buffer_time)
    .filter(res => res.length > 0)
    .mergeMap(res => Observable
      .from(res)
      .reduce((acc, cur) => {
        acc.add(cur)

        return acc
      }, numeral(0))
      .map(total => total.value())
    )
    .do(total => datadog.send([
      {
        metric: `bitfinex.${argv.env}.${symbol.toLowerCase()}.trades`,
        points: [[ moment().format('X'), numeral(total).format('0.00') ]],
        type: 'gauge',
        host: 'bitfinex',
        tags: [`bitfinex:${argv.env}`]
      }
    ]))
    .subscribe(console.info, console.error, stream)

  return next(websocket)
}

stream()
