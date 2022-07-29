const logger = require('../common/logger');
const Axios = require('axios');
const { io } = require("socket.io-client");
const { loadConfig } = require('./config-home-assistant');


/**
 * @type {{
 *  localHomeAssistantUrl: string,
 *  remoteWsUrl: string,
 *  logLevel: string,
 *  socketToken: string,
 * }}
 */
let config;

async function run() {
  config = await loadConfig();

  logger.level = config.logLevel ?? 'info';

  const localHomeAssistant = config.localHomeAssistantUrl ?? process.env.LOCAL_HOME_ASSISTANT_URL ?? 'http://homeassistant.local:8123'

  // TODO - in prod use wws (WebSocket + SSL)
  const remoteUrl = config.remoteWsUrl ?? process.env.REMOTE_WS_URL ?? 'ws://localhost:3000';

  logger.debug({
    remoteUrl,
    localHomeAssistant,
  })

  logger.info(`Local Home Assistant address: ${localHomeAssistant}`);
  logger.info(`Remote WebSocket URL: ${remoteUrl}`);

  const axios = Axios.create({
    baseURL: localHomeAssistant,
  });

  const socket = io(remoteUrl, {
    auth: {
      token: config.socketToken
    }
  });

  socket.on("connect", () => {
    logger.info(`socket connected: ${socket.id}`);
  });

  socket.onAny((event, req, cb) => {
    logger.debug({ event, req }, 'got event');

    if (!event.startsWith('request-')) {
      logger.error('unknown event', { event, data: req });
      cb({ message: 'unknown event', error: true });
      return;
    }

    // Cause 400 error
    delete req.headers['x-forwarded-for'];

    axios.request({
      method: req.method,
      data: req.body,
      headers: req.headers,
      params: req.params,
      url: req.url,
    }).then((res) => {
      logger.debug('Response was successful', {
        status: res.status,
        headers: res.headers,
        data: res.data,
      });
      cb({
        status: res.status,
        headers: res.headers,
        data: res.data,
      })
    }).catch((error) => {
      logger.error({ response: error.response, error }, 'Some error in the response');

      cb({
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data,
      })
    })
  });
}


run()
  .catch((error) => {
    logger.error({ error }, 'had an error')
  });
