var child_process = require('child_process');
var net = require('net');
var redis = require('redis');
var utils = require('./utils.js');
const {promisify} = require('util');

// Create a Redis client. This connects to a Redis server running on the local
// machine at the default port.
var redis_client = redis.createClient();

const redisGetAsync = promisify(redis_client.get).bind(redis_client);
const redisSetAsync = promisify(redis_client.set).bind(redis_client);

var portnum = 8070;
if (process.argv.length > 2) {
  portnum = process.argv[2];
}

var server = net.createServer();
server.on('connection', handleConnection);

server.listen(portnum, function() {
  console.log('Serving on port %d', portnum);
});

function handleConnection(conn) {
  var remoteAddress = conn.remoteAddress + ':' + conn.remotePort;
  console.log('peer %s connected', remoteAddress);

  conn.on('data', onConnData);
  conn.once('close', onConnClose);
  conn.on('error', onConnError);

  function onConnData(d) {
    var num = utils.buf2num(d);
    console.log('num %d', num);

    var cachekey = 'primecache:' + num;
    // TODO: attach error handler
    redisGetAsync(cachekey).then(res => {
      if (res === null) {
        return offload_isprime_promise(num);
      } else {
        console.log('cached num %d is %s', num, res);
        return Promise.resolve(res);
      }
    }).then(res => {
      console.log(res);
      conn.write(res + '\n');
    });
  }

  function onConnClose() {
    console.log('connection from %s closed', remoteAddress);
  }

  function onConnError(err) {
    console.log('connection %s error: %s', remoteAddress, err.message);
  }
}

function offload_isprime_promise(n) {
  return new Promise(
      function (resolve, reject) {
        var child = child_process.fork('./primeworker.js');
        child.send(n);
        child.on('message', message => {resolve(message)});
        child.on('error', message => {reject(message)});
      });
}