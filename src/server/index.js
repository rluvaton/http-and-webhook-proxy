const { setup, run } = require('./server');

async function start() {
  await setup();

  await run();
}

start()
  .catch((error) => {
    console.error('Failed to start server', error);

    // In case there is something that keep this process alive kill it after timeout as it useless
    const timeout = setTimeout(() => {
      console.error('process did not exit by itself, forcing it');
      process.exit(1);
    }, 1000);

    // Making sure, we are not the one stopping the server from exiting
    timeout.unref();
  })
