var tls = require('tls'),
    net = require('net');

function Client(options) {
  var self = this;
  var controlConnection;
  var secureConnections = [];

  self.connect = function(callback) {
    controlConnection = tls.connect({
      host: options.host,
      port: options.port,
      key: options.key,
      cert: options.cert,
      ca: options.ca,
      rejectUnauthorized: true
    }, function() {
      controlConnection.write('open');
      if (options.timeout) {
        var timeout = setTimeout(function() {
          controlConnection.on('end', function() {
            callback(new Error('Open request timed out'));
          });
          controlConnection.end();
        }, options.timeout);
      }
      controlConnection.setEncoding('utf8');
      controlConnection.on('data', function(data) {
        var matched = data.match(/^open:success:(.*)$/);
        if (matched) {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          callback(null, matched[1]);
        } else {
          matched = data.match(/connect:(.*)/);
          if (matched) {
            // TODO: enforce a connection limit?
            var connection = net.connect({
              port: options.targetPort
            }, function() {
              // TODO: handle inactive timeouts and other errors?
              var secureConnection = tls.connect({
                host: options.host,
                port: options.port,
                key: options.key,
                cert: options.cert,
                ca: options.ca,
                rejectUnauthorized: true
              }, function() {
                // TODO: handle inactive timeouts and other errors?
                secureConnections.push(secureConnection);
                secureConnection.on('end', function() {
                  secureConnections.splice(secureConnections.indexOf(secureConnection), 1);
                  connection.end();
                });
                secureConnection.write(data);
                secureConnection.pipe(connection);
                connection.pipe(secureConnection);
              });
              secureConnection.on('error', function(error) {
                connection.end();
                // TODO: remove this error listener on successful connection?
              });
            });
            connection.on('error', function() {
              // TODO: errors should be reported back to the server
              // TODO: remove this error listener on successful connection?
            });
          } else {
            // TODO: should we emit an error event and end the
            // secureConnection here - after all we expect the server
            // to play nice
          }
        }
      });
    });
    controlConnection.on('error', function(error) {
      callback(typeof error === 'string' ? new Error(error) : error);
    });
  };

  self.disconnect = function(callback) {
    secureConnections.forEach(function(secureConnection) {
      secureConnection.end();
    });
    controlConnection.on('end', function() {
      callback();
    });
    controlConnection.end();
  };
}

module.exports = Client;