const fastify = require('fastify')({
  logger: true
})

fastify.register(require('@fastify/formbody'))

// Declare a route

const localHomeAssistant = process.env.LOCAL_HOME_ASSASSIN_URL || 'http://homeassistant.local:8123'

fastify.get('/auth/authorize', (request, reply) => {
  // The url contains the query parameters and the path without the domain
  reply.redirect(`${localHomeAssistant}${request.url}`);
})

fastify.post('/auth/token', function (request, reply) {
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

fastify.all('*', function (request, reply) {
  console.log('Client IP', request.ip);
  console.log('Method:', request.method)
  console.log('URL: ', request.url);
  console.log('Headers:', request.headers);
  console.log('Body:', request.body);
  console.log('Cookies:', request.cookies);


  console.log('redirect to local home assistant');

  reply.redirect(`${localHomeAssistant}${request.url}`);
});

const port = process.env.PORT || 3000;

// Run the server!
fastify.listen({ host: '0.0.0.0', port }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})
