module.exports = {
  urlPrefix: process.env.URL_PREFIX || '',

  cookieDomain: process.env.DOMAIN || 'localhost',
  urlPrefixCookieName: '__HostUrlPrefix',

  localHomeAssistant: process.env.LOCAL_HOME_ASSISTANT_URL || 'http://homeassistant.local:8123',
  port: process.env.PORT || 3000,
};
