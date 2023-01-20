const Fastify = require('fastify')
const rateLimitPlugin = require('@fastify/rate-limit');
const fastifySocketIo = require('fastify-socket.io');
const fastifyCookiePlugin = require('@fastify/cookie');
const fastifyWebsocketPlugin = require('@fastify/websocket');

const { port, urlPrefix } = require('./config');
const { setupRoutes } = require('./routes');
const { attachBodyLoggingHook } = require('./body-logging-hook');
const { isAuthorized } = require('./authorization');

/**
 * @type FastifyInstance
 */
let fastify;

async function setup() {
  if (fastify) {
    console.error('already initialized!');
    throw new Error('already initialized!');
  }

  fastify = Fastify({
    logger: {
      //  ...(process.env.NODE_ENV === 'production' ? {} : {
      transport: {
        target: 'pino-pretty',
      },
      //}),
    },
  });

  // Get raw data so we won't get 500 errors
  fastify.addContentTypeParser('*', function (request, payload, done) {
    let data = Buffer.from([])
    payload.on('data', chunk => {
      data = Buffer.concat([data, chunk])
    })
    payload.on('end', () => {
      done(null, data);
    })
  });

  await fastify.register(rateLimitPlugin, {
    max: 1000,
    timeWindow: '1 minute',
  });

  await fastify.register(fastifySocketIo, {
    // 100 MB - this is needed as otherwise the client fail to send it back
    maxHttpBufferSize: 1e8,
  });

  if (process.env.NODE_ENV !== 'production') {
    attachBodyLoggingHook(fastify);
  }

  await fastify.register(fastifyCookiePlugin, {
    // secret: process.env.COOKIE_SECRET, // for cookies signature
    hook: 'preHandler', // set to false to disable cookie autoparsing or set autoparsing on any of the following hooks: 'onRequest', 'preParsing', 'preHandler', 'preValidation'. default: 'onRequest'
    parseOptions: {},  // options for parsing cookies
  });

  await fastify.register(fastifyWebsocketPlugin, {
    options: {
      verifyClient({ req }, next) {
        next(true);
        return;
        if(!isAuthorized(req)) {
          return next(false);
        }

        req.log.info('WebSocket client verified!');
        next(true);
      },
    },
  });

  await setupRoutes(fastify);

  return fastify;
}

async function run() {
  if (!fastify) {
    console.error('Not initialized!');
    throw new Error('Not initialized!');
  }

  try {
    await fastify.listen({ host: '0.0.0.0', port });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1)
  }

  // Setup fastify
  fastify.io.on('connection', (socket) => {
    fastify.log.info(`Socket connected! - ${socket.id} - token - ${socket.handshake.auth?.token}`);

    if (socket.handshake.auth?.token !== urlPrefix) {
      fastify.log.warn(`Unknown token, disconnecting... [${socket.id}], token ${socket.handshake.auth?.token}`);

      // Disconnect the socket
      socket.disconnect();
      return;
    }
    socket.join(urlPrefix);
  });
}

module.exports = {
  setup,
  run,
};
