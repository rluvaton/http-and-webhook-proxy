const { Readable } = require('stream');
const qs = require('qs');

const urlPrefix = process.env.URL_PREFIX || '';

const fastify = require('fastify')({
  logger: {
    ...(process.env.NODE_ENV === 'production' ? {} : {
      transport: {
        target: 'pino-pretty',
      },
    }),
  },
});

fastify.register(import('@fastify/rate-limit'), {
  max: 1000,
  timeWindow: '1 minute',
})

const localHomeAssistant = process.env.LOCAL_HOME_ASSASSIN_URL || 'http://homeassistant.local:8123'


fastify.register(require('fastify-socket.io'), {
  // put your options here
})

if (process.env.NODE_ENV !== 'production') {

// Added body logging
  fastify.addHook('preValidation', async (req) => {
    console.log(typeof req.body, req.body?.on)

    const baseRequestMetadata = {
      method: req.method,
      url: req.url,
      path: req.routerPath,
      parameters: req.params,
      headers: req.headers,
    };

    if (!(req.body instanceof Readable)) {
      req.log.info({
        ...baseRequestMetadata,
        body: req.body,
      });

      return;
    }

    let isLogBodyEnabled = false;

    // Waiting for data listener and only then listen to body logging,
    // this is done, so we won't take the data from the body original listener (fastify)
    // As I'm thinking that maybe HTTP incoming messages start pushing to the data event as soon as there is 1 listener
    // If we listen to it first Fastify will not get the body, so we will wait for it to first listen
    // Listening in the newListener is not dangerous, as it called synchronously, so we won't miss the data
    req.body.on('newListener', (event) => {
      if (event !== 'data' || isLogBodyEnabled) {
        return;
      }

      isLogBodyEnabled = true;

      getBody(req, req.body)
        .then((body) => {
          req.log.info({
            ...baseRequestMetadata,
            body,
          });
        });
    })
  });
}


function getBody(reqOrRes, bodyStream) {
  return new Promise((resolve, reject) => {
    let body = Buffer.alloc(0)

    function onData(chunk) {
      body = Buffer.concat([body, chunk])
    }

    function onEnd() {
      const bodyString = body.toString();

      let parsedBody = bodyString;

      const headers = typeof reqOrRes.getHeaders === 'function' ? reqOrRes.getHeaders() : reqOrRes.headers;

      if (headers?.['content-type'] === 'application/x-www-form-urlencoded') {
        parsedBody = [...new URLSearchParams(parsedBody).entries()].reduce((bodyObj, [key, value]) => {
          bodyObj[key] = value;
          return bodyObj;
        }, {});
      } else if (bodyString.trim().startsWith('{')) {
        try {
          parsedBody = JSON.parse(bodyString);
        } catch (e) {
          reqOrRes.log.error('Body is not a valid JSON', e);
        }
      }

      resolve(parsedBody);
    }

    bodyStream.on('error', (error) => {
      reject(error);
      bodyStream.removeListener('data', onData);
      bodyStream.removeListener('end', onEnd);
    });
    bodyStream.on('data', onData);
    bodyStream.on('end', onEnd);
  });
}

function removeSpecialPrefixFromUrl(url) {
  if(urlPrefix === '') {
    return url;
  }

  if(url.startsWith(`/${urlPrefix}`)) {
    return url.substring(`/${urlPrefix}`.length);
  }

  return url;
}


fastify.register(require('@fastify/formbody'));

fastify.register((instance, opts, next) => {

  instance.get('/auth/authorize', (request, reply) => {

    // The url contains the query parameters and the path without the domain
    reply.redirect(`${localHomeAssistant}${removeSpecialPrefixFromUrl(request.url)}`);
  });


  instance.all('*', async function (request, reply) {
    await proxyHttpRequestToWs(request, reply);
  });

  next()

  // This is done to secure ourself from anyone sending things to our server
}, { prefix: urlPrefix })

function proxyHttpRequestToWs(request, reply) {
  return new Promise((resolve, reject) => {
    let body = request.body;
    if (request.headers['content-type'] === 'application/x-www-form-urlencoded') {
      body = qs.stringify(body);
    }
    fastify.io.timeout(10000).emit(`request-${request.id}`, {
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

      reply.status(response?.status ?? 500).headers(response?.headers ?? {}).send(response?.data ?? {});

      // response.
      resolve();
    });
  });
}


const port = process.env.PORT || 3000;

// Run the server!
fastify.listen({ host: '0.0.0.0', port }, function (err) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})
