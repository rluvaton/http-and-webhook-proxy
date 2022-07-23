const { Readable } = require('stream');

const fastify = require('fastify')({
  // TODO - remove this after finish of the development, pino-pretty is not very performant
  logger: {
    transport: {
      target: 'pino-pretty',
    },
  },
});

const localHomeAssistant = process.env.LOCAL_HOME_ASSASSIN_URL || 'http://homeassistant.local:8123'


fastify.register(require('fastify-socket.io'), {
  // put your options here
})

// Must be before the addHook as it will have problems otherwise
// fastify.register(require('@fastify/http-proxy'), {
//   upstream: localHomeAssistant,
//
//   replyOptions: {
//     // For debugging, this can have memory leak and more problems
//     onResponse: (request, reply, res) => {
//       let resStream = res;
//
//       // Or use the example in https://nodejs.org/api/zlib.html#compressing-http-requests-and-responses for supporting other content encoding
//       if (reply.getHeader('content-encoding') === 'deflate') {
//         const inflate = createInflate();
//         res.pipe(inflate);
//         resStream = inflate;
//       }
//
//       getBody(reply, resStream)
//         .then((body) => {
//           reply.log.info({
//             status: reply.statusCode,
//             headers: reply.getHeaders(),
//             body,
//           });
//         });
//
//
//       // Keep the default response
//       reply.send(res);
//     },
//   },
//   // logLevel: 'trace'
//
//   // prefix: '/', // optional
//   // http2: false // optional
// });


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


fastify.register(require('@fastify/formbody'));
// Declare a route

declareRoutes();

function proxyHttpRequestToWs(request, reply) {
  return new Promise((resolve, reject) => {
    fastify.io.timeout(10000).emit(`request-${request.id}`, {
      id: request.id,
      method: request.method,
      url: request.url,
      path: request.routerPath,
      params: request.params,
      headers: request.headers,
      body: request.body,
    }, (err, [response]) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('################'); // "got it"
      console.log({ err, response }); // "got it"

      reply.status(response.status).headers(response.headers).send(response.data);
      // response.
      resolve();
    });
  });
}


function declareRoutes() {
  fastify.get('/auth/authorize', (request, reply) => {

    // The url contains the query parameters and the path without the domain
    reply.redirect(`${localHomeAssistant}${request.url}`);
  })

  fastify.post('/auth/token', async function (request, reply) {
    // await proxyHttpRequestToWs(request, reply);

    console.log('Client IP', request.ip);
    console.log('Method:', request.method)
    console.log('URL: ', request.url);
    console.log('Headers:', request.headers);
    console.log('Body:', request.body);
    console.log('Cookies:', request.cookies);


    console.log('redirect to local home assistant');

    // status code 307 to maintain the POST method - https://github.com/fastify/fastify/issues/1049
    reply.redirect(307, `${localHomeAssistant}${request.url}`);
  });


  fastify.all('*', async function (request, reply) {
    await proxyHttpRequestToWs(request, reply);

    console.log('Client IP', request.ip);
    console.log('Method:', request.method)
    console.log('URL: ', request.url);
    console.log('Headers:', request.headers);
    console.log('Body:', request.body);
    console.log('Cookies:', request.cookies);


    // console.log('redirect to local home assistant');

    // reply.redirect(`${localHomeAssistant}${request.url}`);
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
