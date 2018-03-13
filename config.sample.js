module.exports = {
  datadog: {
    api_key: ''
  },
  telegram: {
    bot_token: '',
    channel_id: ''
  },
  gdax: {
    buffer_time: 10000,
    'BTC-USD': {
      filter_total_price: 10000,
      size: 3,
      notify_amount: {
        buy: 10000000,
        sell: -10000000
      }
    },
    'ETH-USD': {
      filter_total_price: 10000,
      size: 50,
      notify_amount: {
        buy: 1000000,
        sell: -1000000
      }
    },
    'LTC-USD': {
      filter_total_price: 10000,
      size: 10,
      notify_amount: {
        buy: 1000000,
        sell: -1000000
      }
    },
    'BCH-USD': {
      filter_total_price: 20000,
      size: 10,
      notify_amount: {
        buy: 10000000,
        sell: -10000000
      }
    }
  },
  gemini: {
    filter_amount: 100000,
    currency_amount: {
      eth: 100,
      btc: 10
    }
  },
  bitfinex: {
    filter_amount: {
      buy: 1000,
      sell: 1000
    },
    notify_amount: {
      buy: 1000,
      sell: 1000
    },
    currency: {
      xrp: {
        positive: 10000,
        negative: -10000
      },
      eth: {
        positive: 1,
        negative: -1
      },
      ltc: {
        positive: 1,
        negative: -1
      }
    }
  },
  okex: {
    buffer_time: 5000,
    'BTCUSDT': {
      channel: 'ok_sub_spot_btc_usdt_deals',
      filter_total_price: 10000,
      filter_remaining_size: 1,
      notify_amount: {
        buy: 100000,
        sell: -100000
      }
    }
  },
  market: {
    buffer_time: 10000,
    alert: {
      buy: 1000000000, // 1b
      sell: -1000000000
    }
  }
}
