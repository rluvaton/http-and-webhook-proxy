module.exports = {
  urlPrefix: process.env.URL_PREFIX || '',

  cookieDomain: process.env.DOMAIN || 'localhost',
  urlPrefixCookieName: '__HostUrlPrefix',

  port: process.env.PORT || 3000,

  prettyLogs: process.env.PRETTY_LOGS === 'true',
  logBodyRequests: process.env.LOG_BODY_REQUESTS === 'true'
};
