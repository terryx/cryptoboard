const request = require('request-promise')

const constructor = (apiKey) => {
  const req = request.defaults({
    headers: {
      'Content-Type': 'application/json'
    },
    baseUrl: 'https://app.datadoghq.com/api/v1',
    qs: {
      api_key: apiKey
    },
    json: true
  })

  const send = (series) => {
    return req({
      method: 'POST',
      uri: '/series',
      body: { series }
    })
  }

  return { req, send }
}

module.exports = constructor
