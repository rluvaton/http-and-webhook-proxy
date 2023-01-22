const { urlPrefixCookieName, urlPrefix, cookieDomain, localHomeAssistant } = require('./config');

const {randomUUID} = require('node:crypto');

function removeSpecialPrefixFromUrl(url) {
  if (urlPrefix === '') {
    return url;
  }

  if (url.startsWith(`/${urlPrefix}`)) {
    return url.substring(`/${urlPrefix}`.length);
  }

  return url;
}

const TIMEOUT = 40_000;

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


  setupWsRoute(fastify, '/api/websocket');
  setupWsRoute(fastify, `/${urlPrefix}/api/websocket`);


  // fastify.get('/auth/authorize', (request, reply) => {
  //   // const url = removeSpecialPrefixFromUrl(request.url);
  //   // const searchParams = new URLSearchParams(url.split('?')[1]);
  //   // if(searchParams.has('client_id')) {
  //   //   searchParams.set('client_id', localHomeAssistant + '/');
  //   // }
  //   // // The url contains the query parameters and the path without the domain
  //   // reply.redirect(`${localHomeAssistant}/auth/authorize?${searchParams.toString()}`);
  //   reply.redirect(`${localHomeAssistant}${removeSpecialPrefixFromUrl(request.url)}`);
  // });

  fastify.all('*', async function (request, reply) {
    await proxyHttpRequestToWs(fastify, request, reply);
  });



}

function proxyHttpRequestToWs(fastify, request, reply) {
  return new Promise((resolve, reject) => {
    let body = request.body;

    // Only to the relevant room
    fastify.io
      .to(urlPrefix)
      .timeout(TIMEOUT)
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


function setupWsRoute(fastify, route) {
  fastify.get(route, { websocket: true }, (connection /* SocketStream */, req /* FastifyRequest */) => {
    const clientId = randomUUID();

    connection.on('close', () => {
      console.log('connection closed');
    });
    connection.socket.on('close', () => {
      console.log('socket closed');
      closeWebSocket(fastify, clientId);
    });

    startWs(fastify, route, clientId);

    // Listen to web socket events from the connected web socket
    // TODO - add catch
    // TODO - add comment why we do this without await - https://www.npmjs.com/package/@fastify/websocket using event handlers
    fastify.io.to(urlPrefix).fetchSockets()
      .then((sockets) => {
        sockets.map(s => s.on('ws-message', (data) => {
          let serverToClientData = data.toString();
          console.log('server to client data', serverToClientData);
          connection.socket.send(serverToClientData);
        }));
      })

    connection.socket.on('message', message => {
      console.log('client to server data', message);

      proxyWsToWs(fastify, req, message, clientId);
    })
  })

}


function proxyWsToWs(fastify, req, body, clientId) {
  // Only to the relevant room
  fastify.io
    .to(urlPrefix)
    .timeout(TIMEOUT)
    .emit(`ws-${req.id}`, {
      clientId,
      id: req.id,
      url: removeSpecialPrefixFromUrl(req.url),
      path: req.routerPath,
      params: req.params,
      headers: req.headers,
      body: body,
    });
}
function startWs(fastify, url, clientId) {
  // Only to the relevant room
  fastify.io
    .to(urlPrefix)
    .timeout(TIMEOUT)
    .emit(`ws-open`, {
      clientId,
      url: removeSpecialPrefixFromUrl(url),
    });
}

function closeWebSocket(fastify, clientId) {
  // Only to the relevant room
  fastify.io
    .to(urlPrefix)
    .timeout(TIMEOUT)
    .emit(`ws-close`, {
      clientId
    });
}

module.exports = {
  setupRoutes,
};
