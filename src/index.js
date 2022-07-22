const fastify = require('fastify')({
  logger: true
})

// Declare a route

fastify.all('*', function (request, reply) {
  console.log('Client IP', request.ip);
  console.log('Method:', request.method)
  console.log('URL: ', request.url);
  console.log('Headers:', request.headers);
  console.log('Body:', request.body);
  console.log('Cookies:', request.cookies);

  reply.send({ hello: 'world' });
});

const port = parseInt(process.env.PORT, 10) || 3000;

// Run the server!
fastify.listen({ port }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})
