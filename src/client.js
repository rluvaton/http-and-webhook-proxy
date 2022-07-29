const logger = require('./logger');
const Axios = require('axios');
const { io } = require("socket.io-client");
const curlirize = require('axios-curlirize');

const localHomeAssistant = process.env.LOCAL_HOME_ASSISTANT_URL || 'http://homeassistant.local:8123'

// TODO - in prod use wws (WebSocket + SSL)

const remoteUrl = process.env.REMOTE_URL || process.env.NODE_ENV !== 'production' ? 'ws://localhost:3000' : 'ws://http-and-webhook-proxy.herokuapp.com'

logger.info({
  env: process.env.NODE_ENV,
  remoteUrl,
  localHomeAssistant,
})
// logger.info(process.env.NODE_ENV, 'Remote Server is on:', remoteUrl)

const axios = Axios.create({
  baseURL: localHomeAssistant,
});

// Print out all request as CURL
curlirize(axios, (curlResult, err) => {
  const { command } = curlResult;

   if (err) {
    logger.error('Failed to convert to CURL:', err);
    return;
  }

  logger.info(`Convert request into CURL:${command}`);
});

const socket = io(remoteUrl);


socket.on("connect", () => {
  logger.info(`socket connected: ${socket.id}`); // "G5p5..."
});

socket.onAny((event, req, cb) => {
  logger.info({ event, req }, 'got event');
  if (!event.startsWith('request-')) {
    logger.error('unknown event', { event, data: req });
    cb({ message: 'unknown event', error: true });
    return;
  }

  // console.log(`got ${event}`, req);

  // Cause 400 error
  delete req.headers['x-forwarded-for'];

  axios.request({
    method: req.method,
    data: req.body,
    headers: req.headers,
    params: req.params,
    url: req.url,
  }).then((res) => {
    logger.info('Response was successful', {
      status: res.status,
      headers: res.headers,
      data: res.data,
    });
    cb({
      status: res.status,
      headers: res.headers,
      data: res.data,
    })
  }).catch((err) => {
    logger.error('Some error in the request', err.message);

    cb({
      status: err.response.status,
      headers: err.response.headers,
      data: err.response.data,
    })
  })
});
