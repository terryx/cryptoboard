const { argv } = require('yargs')
const { Observable } = require('rxjs')
const config = require(`../config.${argv.env}`)
const datadog = require('../utils/datadog')(config.datadog.api_key)
const numeral = require('numeral')
const moment = require('moment')
const Okex = require('./stream')
const helper = require('../utils/helper')

const watch = () => {
  const okex = Okex(config.okex, argv.currency)

  const stream = okex.tradeStream()

  stream
    .bufferTime(config.okex.buffer_time)
    .filter(feeds => feeds.length > 0)
    .mergeMap(feeds => Observable
      .from(feeds)
      .reduce((acc, cur) => {
        const total = helper.getTotal(cur[1], cur[2])
        const cumulator = numeral(acc)
        const side = cur[4].toUpperCase()

        if (side === 'BID') {
          cumulator.add(total)
        }

        if (side === 'ASK') {
          cumulator.subtract(total)
        }

        return cumulator.value()
      }, 0)
      .map(value => ({ value, product: argv.currency }))
    )
    .mergeMap(data => {
      const currency = argv.currency.toLowerCase()
      return Observable
        .fromPromise(datadog.send([{
          metric: `okex.${argv.env}.${currency}`,
          points: [ [moment().format('X'), data.value] ],
          type: 'gauge',
          host: `okex:${currency}`,
          tags: [currency]
        }]))
        .mapTo(data)
    })
    .subscribe(
      (result) => console.info(result),
      (error) => console.error(error.message),
      () => {
        console.log('completed')
        watch()
      }
    )

  return okex.next(stream)
}

watch()
