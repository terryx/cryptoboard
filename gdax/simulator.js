const { argv } = require('yargs')
const config = require(`../config.${argv.env}`)
const chalk = require('chalk')
const numeral = require('numeral')
const currency = argv.currency
const gdax = require('./stream')

const simulate = () => {
  const volume = numeral(0)

  const data = {
    productId: `${currency.toUpperCase()}-USD`,
    filterSize: config.gdax.currency[currency],
    filterTotalPrice: config.gdax.filter_amount
  }

  return gdax
    .stream(data)
    .map(res => {
      const total = gdax.getTotal(res.remaining_size, res.price)
      const side = res.side.toUpperCase()

      if (side === 'BUY') {
        volume.add(total)
        return chalk.green(volume.format('$0.00a'))
      }

      if (side === 'SELL') {
        volume.subtract(total)
        return chalk.red(volume.format('$0.00a'))
      }

      return volume.format('$0.00a')
    })
    .subscribe(
      console.info,
      (err) => {
        console.error(err.message)
        simulate()
      },
      () => simulate()
    )
}

simulate()
