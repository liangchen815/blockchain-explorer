var Synchronizer = require('./app/Synchronizer');
var helper = require('./app/common/helper');
var logger = helper.getLogger('Sync');
var ExplorerError = require('./app/common/ExplorerError');

var args = process.argv.slice(2);

var synchronizer;

async function start() {
  logger.debug('Start synchronizer');
  synchronizer = new Synchronizer(args);
  await synchronizer.initialize();

  console.log('\n');
  console.log('Synchronizer pid is ' + process.pid);
  console.log('\n');
}

start();

// this function is called when you want the server to die gracefully
// i.e. wait for existing connections
var shutDown = function () {
  console.log('<<<<<<<<<<<<<<<<<<<<<<<<<< Closing client processor >>>>>>>>>>>>>>>>>>>>>');
  if (synchronizer) {
    synchronizer.close();
  }
  setTimeout(() => {
    process.exit(0);
    setTimeout(() => {
      console.error(
        'Could not close child connections in time, forcefully shutting down'
      );
      if (synchronizer) {
        synchronizer.close();
      }
      process.exit(1);
    }, 5000);
  }, 2000);
};

process.on('unhandledRejection', up => {
  console.log('<<<<<<<<<<<<<<<<<<<<<<<<<< Synchronizer Error >>>>>>>>>>>>>>>>>>>>>');
  if (up instanceof ExplorerError) {
    console.log('Error : ', up.message);
  } else {
    console.log(up);
  }
  shutDown();
});
process.on('uncaughtException', up => {
  console.log('<<<<<<<<<<<<<<<<<<<<<<<<<< Synchronizer Error >>>>>>>>>>>>>>>>>>>>>');
  if (up instanceof ExplorerError) {
    console.log('Error : ', up.message);
  } else {
    console.log(up);
  }
  shutDown();
});

// listen for TERM signal .e.g. kill
process.on('SIGTERM', shutDown);
// listen for INT signal e.g. Ctrl-C
process.on('SIGINT', shutDown);


