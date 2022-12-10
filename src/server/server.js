const Fastify = require('fastify')
const rateLimitPlugin = require('@fastify/rate-limit');
const fastifySocketIo = require('fastify-socket.io');
const fastifyFormBody = require('@fastify/formbody');
const fastifyCookiePlugin = require('@fastify/cookie');
const fastifyMultiPart = require('@fastify/multipart');

const { port, urlPrefix } = require('./config');
const { setupRoutes } = require('./routes');
const { attachBodyLoggingHook } = require('./body-logging-hook');

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

  await fastify.register(rateLimitPlugin, {
    max: 1000,
    timeWindow: '1 minute',
  });


  await fastify.register(fastifySocketIo);

  if (process.env.NODE_ENV !== 'production') {
    attachBodyLoggingHook(fastify);
  }

  await fastify.register(fastifyFormBody);
  fastify.register(fastifyMultiPart)

  await fastify.register(fastifyCookiePlugin, {
    // secret: process.env.COOKIE_SECRET, // for cookies signature
    hook: 'onRequest', // set to false to disable cookie autoparsing or set autoparsing on any of the following hooks: 'onRequest', 'preParsing', 'preHandler', 'preValidation'. default: 'onRequest'
    parseOptions: {},  // options for parsing cookies
  });

  await setupRoutes(fastify);
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
    // socket.handshake.auth
    socket.join(urlPrefix);
  });
}

module.exports = {
  setup,
  run,
};
