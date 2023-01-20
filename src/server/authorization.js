const Cookie = require('cookie');
const { urlPrefixCookieName, urlPrefix } = require('./config');

function getCookies(req) {
  if(req.cookies) {
    return req.cookies;
  }

  let cookieHeader = req.headers?.cookie;

  if(!cookieHeader) {
    // jump by 2 as it's key-value
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if(req.rawHeaders[i].toLowerCase() === 'cookie') {
        cookieHeader = req.rawHeaders[i + 1];
        break;
      }
    }
  }

  if(!cookieHeader) {
    return;
  }

  return Cookie.parse(cookieHeader, {});
}

function isAuthorized(req) {
  let cookie = getCookies(req);

  if(!cookie) {
    req.log.error('request does not contain cookie');
    return false;
  }

  if(cookie[urlPrefixCookieName] !== urlPrefix) {
    req.log.error({cookie}, 'The cookie value does not match the url prefix')
    return false;
  }

  return true;
}

module.exports = {
  isAuthorized
}
