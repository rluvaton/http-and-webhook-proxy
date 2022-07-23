const Axios = require('axios');
const { io } = require("socket.io-client");

const localHomeAssistant = process.env.LOCAL_HOME_ASSASSIN_URL || 'http://homeassistant.local:8123'

// TODO - in prod use wws (WebSocket + SSL)

const remoteUrl = process.env.REMOTE_URL || process.env.NODE_ENV !== 'production' ? 'ws://localhost:3000' : 'ws://http-and-webhook-proxy.herokuapp.com'

console.log(process.env.NODE_ENV, 'Remote Server is on:', remoteUrl)

const axios = Axios.create({
  baseURL: localHomeAssistant,
});


const socket = io(remoteUrl);


socket.on("connect", () => {
  console.log(socket.id); // "G5p5..."
});

socket.onAny((event, req, cb) => {
  if (!event.startsWith('request-')) {
    console.error('unknown event', { event, data: req });
    cb({ message: 'unknown event', error: true });
    return;
  }

  console.log(`got ${event}`, req);

  Axios.request({
    method: req.method,
    data: req.body,
    headers: req.headers,
    params: req.params,
    url: req.url,
    baseURL: localHomeAssistant,
  }).then((res) => {
    console.log(res);
    cb({
      status: res.status,
      headers: res.headers,
      data: res.data
    })
  }).catch((err) => {
    console.error(err);
    cb({
      status: err.response.status,
      headers: err.response.headers,
      data: err.response.data
    })
  })
});
