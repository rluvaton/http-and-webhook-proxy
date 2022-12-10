const { Readable } = require('stream');

/**
 *
 * @param {FastifyInstance} fastify
 */
function attachBodyLoggingHook(fastify) {
  fastify.addHook('preValidation', async (req) => {
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

module.exports = {
  attachBodyLoggingHook,
};
