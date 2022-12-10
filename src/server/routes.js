const { urlPrefixCookieName, urlPrefix, cookieDomain, localHomeAssistant } = require('./config');
const qs = require('qs');


function removeSpecialPrefixFromUrl(url) {
  if (urlPrefix === '') {
    return url;
  }

  if (url.startsWith(`/${urlPrefix}`)) {
    return url.substring(`/${urlPrefix}`.length);
  }

  return url;
}

/**
 *
 * @param {FastifyInstance} fastify
 * @return {Promise<void>}
 */
async function setupRoutes(fastify) {

  // Made all requests to either start with the url prefix or have a cookie with that
  fastify.addHook('preHandler', (request, reply, done) => {
    if (request.cookies[urlPrefixCookieName] !== urlPrefix && !request.url.startsWith(`/${urlPrefix}`)) {
      reply.code(404);
      done(new Error('Not found'));
      return;
    }

    reply
      .setCookie(urlPrefixCookieName, urlPrefix, {
        domain: cookieDomain,
        path: '/',
        httpOnly: true,
      });

    done()
  });


  fastify.get('/auth/authorize', (request, reply) => {
    // The url contains the query parameters and the path without the domain
    reply.redirect(`${localHomeAssistant}${removeSpecialPrefixFromUrl(request.url)}`);
  });


  fastify.all('*', async function (request, reply) {
    await proxyHttpRequestToWs(request, reply);
  });

  function proxyHttpRequestToWs(request, reply) {
    return new Promise((resolve, reject) => {
      let body = request.body;
      if (request.headers['content-type'] === 'application/x-www-form-urlencoded') {
        body = qs.stringify(body);
      }

      // Only to the relevant room
      fastify.io
        .to(urlPrefix)
        .timeout(10000)
        .emit(`request-${request.id}`, {
          id: request.id,
          method: request.method,
          url: removeSpecialPrefixFromUrl(request.url),
          path: request.routerPath,
          params: request.params,
          headers: request.headers,
          body: body,
        }, (err, [response]) => {
          if (err) {
            reject(err);
            return;
          }

          reply.status(response?.status ?? 500).headers(response?.headers ?? {});

          let data = response?.data ?? {};

          // Should not be needed but for some reason it failed with unable to parse
          if(typeof data === 'object') {
            data = JSON.stringify(data);
          }

          try {
            reply.send(data);
          } catch (e) {
            console.error('Failed sending data', e);
            reject(e);
          }

          resolve();
        });
    });
  }


}

module.exports = {
  setupRoutes,
};
