const { urlPrefixCookieName, urlPrefix, cookieDomain, localHomeAssistant } = require('./config');

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
      console.log('URL not found', request.url);
      reply.code(404);
      done(new Error(request.url + ': Not found'));
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

  fastify.register(async function (fastify) {
    fastify.get('/api/websocket', { websocket: true }, (connection /* SocketStream */, req /* FastifyRequest */) => {

      // TODO - fix this patch
      fastify.io.s.on('ws-message', (data) => {
        let serverToClientData = data.toString();
        console.log('server to client data', serverToClientData);
        connection.socket.send(serverToClientData);
      });

      connection.socket.on('message', message => {
        console.log('client to server data', message);

        proxyWsToWs(req, message)
      })
    })
  })


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

      // Only to the relevant room
      fastify.io
        .to(urlPrefix)
        .timeout(10000)
        .emit(`http-${request.id}`, {
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
          if (typeof data === 'object') {
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

  function proxyWsToWs(req, body) {
    // Only to the relevant room
    fastify.io
      .to(urlPrefix)
      .timeout(10000)
      .emit(`ws-${req.id}`, {
        id: req.id,
        url: removeSpecialPrefixFromUrl(req.url),
        path: req.routerPath,
        params: req.params,
        headers: req.headers,
        body: body,
      });
  }


}

module.exports = {
  setupRoutes,
};
