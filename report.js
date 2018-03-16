const { argv } = require('yargs')
const { Observable } = require('rxjs')
const numeral = require('numeral')
const moment = require('moment')
const streams = require('crypto-streams')
const config = require(`./config.${argv.env}`)
const datadog = require('./utils/datadog')(config.datadog.api_key)
const notification = require('./utils/notification')
const { base, counter } = argv

const subject = streams[counter.toLowerCase()](base)

subject.connect()

const metric = () => subject
  .scan((acc, cur) => {
    acc = acc.add(cur)

    return acc
  }, numeral(0))
  .do(total => console.log(total.format('0.000a')))
  .find(total => total.value() > config.market.point.buy || total.value() < config.market.point.sell)
  .map(total => ([ moment().format('X'), total.format('0.00') ]))
  .do(point => datadog.send([
    {
      metric: `market.${argv.env}.${base.toLowerCase()}_${counter.toLowerCase()}.trades`,
      points: [ point ],
      type: 'gauge',
      host: 'market',
      tags: [argv.env]
    }
  ]))
  .subscribe(
    (res) => console.log('datadog', res),
    (err) => console.error(err.message),
    metric
  )

const notify = () => subject
  .scan((acc, cur) => {
    acc = acc.add(cur)

    return acc
  }, numeral(0))
  .find(total => total.value() > config.market.alert.buy || total.value() < config.market.alert.sell)
  .mergeMap(total => {
    let message = `${base.toUpperCase()}${counter.toUpperCase()} market `
    if (total.value() > 0) {
      message += `GAIN ${total.format('0.00a')}`
    }

    if (total.value() < 0) {
      message += `LOST ${total.format('0.00a')}`
    }

    return Observable.fromPromise(notification.sendMessage(config.telegram.bot_token, config.telegram.channel_id, message))
  })
  .subscribe(
    (res) => console.log('telegram', res),
    (err) => console.error(err.message),
    notify
  )

metric()
notify()
