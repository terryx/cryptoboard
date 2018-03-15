module.exports = {
  datadog: {
    api_key: ''
  },
  telegram: {
    bot_token: '',
    channel_id: ''
  },
  market: {
    buffer_time: 10000,
    alert: {
      buy: 1000000000, // 1b
      sell: -1000000000
    },
    point: {
      buy: 1000000,
      sell: -1000000
    }
  }
}
