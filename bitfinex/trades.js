const { Observable } = require('rxjs')
const { argv } = require('yargs')
const moment = require('moment')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const notification = require('../utils/notification')
const numeral = require('numeral')
const currency = argv.currency
const w3cwebsocket = require('websocket').w3cwebsocket
const helper = require('../utils/helper')

const next = (socket) => {
  return socket.next(JSON.stringify({
    event: 'subscribe',
    channel: 'trades',
    symbol: `${currency.toUpperCase()}`
  }))
}

const stream = () => {
  const volume = numeral(0)

  const websocket = Observable.webSocket({
    url: `wss://api.bitfinex.com/ws/2`,
    WebSocketCtor: w3cwebsocket
  })

  websocket
    .filter(res => Array.isArray(res))
    .skip(1)
    .filter(res => res[1] === 'tu')
    .map(res => helper.getTotal(res[2][2], res[2][3]))
    .bufferTime(config.buffer_time)
    .filter(res => res.length > 0)
    .mergeMap(res => Observable
      .from(res)
      .reduce((acc, cur) => {
        acc.add(cur)

        return acc
      }, numeral(0))
      .map(total => total.value())
    )
    .do(total => Observable
      .fromPromise(datadog.send([{
        metric: `bitfinex.${argv.env}.${currency.toLowerCase()}.trades`,
        points: [[ moment().format('X'), numeral(total).format('0.00') ]],
        type: 'gauge',
        host: 'bitfinex',
        tags: [`bitfinex:${argv.env}`]
      }]))
      .mapTo(total)
    )
    .do(total => {
      volume.add(total)
      if (volume.value() >= config.bitfinex[currency].notify_amount.buy) {
        const message = `
Bitfinex ${currency.toUpperCase()}
<b>BUY</b> trades ${volume.format('$0.00a')}
`
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
        volume.set(0)
      }

      if (volume.value() <= config.bitfinex[currency].notify_amount.sell) {
        const message = `
Bitfinex ${currency.toUpperCase()}
<b>SELL</b> trades ${volume.format('$0.00a')}
  `
        notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message)
        volume.set(0)
      }
    })
    .subscribe(
      () => console.info(volume.format('$0.00a')),
      (err) => {
        console.error(err.message)
        websocket.complete()
      },
      () => stream()
  )

  return next(websocket)
}

stream()
