describe('Primus', function () {
  'use strict';

  var common = require('./common')
    , Primus = common.Primus
    , http = require('http')
    , expect = common.expect
    , fs = require('fs')
    , server
    , primus;

  beforeEach(function beforeEach(done) {
    server = http.createServer();
    primus = new Primus(server, { pingInterval: false });

    server.portnumber = common.port;
    server.listen(server.portnumber, done);
  });

  afterEach(function afterEach(done) {
    server.close(function () {
      done();
    });
  });

  it('exposes the Spark constructor', function () {
    expect(Primus.Spark).to.be.a('function');
  });

  it('exposes the Transformer contructor', function () {
    expect(Primus.Transformer).to.be.a('function');
  });

  it('exposes the current version number', function () {
    expect(primus.version).to.be.a('string');
    expect(primus.version).to.equal(require('../package.json').version);
  });

  it('exposes the client library', function () {
    expect(primus.client).to.be.a('string');
    expect(primus.client).to.include('{primus::version}');
  });

  it('exposes the wrapped Spark constructor', function () {
    expect(primus.Spark).to.be.a('function');
  });

  it('expooses static methods on wrapped Spark constructor', function () {
    for (var key in Primus.Spark) {
      expect(primus.Spark[key]).to.be.eql(Primus.Spark[key]);
    }
  });

  it('pre-binds the primus server in to the spark', function () {
    var spark = new primus.Spark();
    expect(spark.primus).to.equal(primus);
  });

  it('can customize the pathname', function () {
    expect(primus.pathname).to.equal('/primus');
    expect(new Primus(server, {
      pingInterval: false,
      pathname: '/foo'
    }).pathname).to.equal('/foo');
    expect(new Primus(server, {
      pingInterval: false,
      pathname: 'foo'
    }).pathname).to.equal('/foo');
  });

  it('emits an `initialised` event when the server is fully constructed', function (done) {
    var primus = new Primus(server, { pingInterval: false });

    primus.on('initialised', function (transformer, parser) {
      expect(transformer).to.equal(primus.transformer);
      expect(parser).to.equal(primus.parser);

      done();
    });
  });

  it('accepts custom message parsers', function () {
    var primus = new Primus(server, { parser: 'ejson', pingInterval: false });

    expect(primus.parser.library).to.be.a('string');
    expect(primus.parser.library).to.include('EJSON');
  });

  it('accepts a third-party parser', function () {
    var parser = {
      encoder: function () {},
      decoder: function () {}
    };

    var primus = new Primus(server, { parser, pingInterval: false });

    expect(primus.parser).to.equal(parser);
    expect(primus.encoder).to.equal(parser.encoder);
    expect(primus.decoder).to.equal(parser.decoder);

    try {
      new Primus(server, { parser: function () {}, pingInterval: false });
    } catch (e) {
      return expect(e).to.be.instanceOf(Error);
    }

    throw new Error('I should have throwed above');
  });

  it('stores new connections internally', function (done) {
    expect(primus.connected).to.equal(0);
    var spark = new primus.Spark();

    setImmediate(function () {
      expect(primus.connected).to.equal(1);
      var sparks = new primus.Spark();

      setTimeout(function () {
        expect(Object.keys(primus.connections).length).to.equal(primus.connected);
        sparks.end();
        spark.end();

        done();
      });
    });
  });

  it('serves the primus client on /primus/primus.js', function (done) {
    common.request({
      uri: 'http://localhost:'+ server.portnumber +'/primus/primus.js',
      method: 'GET'
    }, function (err, res, body) {
      if (err) return done(err);

      expect(res.statusCode).to.equal(200);
      expect(body).to.include('Primus.prototype');

      done();
    });
  });

  it('accepts a third-party transformer', function () {
    var Optimus = Primus.Transformer.extend({
      server: function () {},
      client: function () {}
    });

    var primus = new Primus(server, {
      transformer: Optimus,
      pingInterval: false
    });
    expect(primus.transformer).to.be.instanceOf(Optimus);

    try {
      new Primus(server, { transformer: [], pingInterval: false });
    } catch (e) {
      return expect(e).to.be.instanceOf(Error);
    }

    throw new Error('I should have throwed');
  });

  it('doesn\'t change the context of the original request/upgrade listeners', function (done) {
    primus.destroy(function () {
      server = http.createServer();

      server.on('request', function (req, res) {
        expect(this).to.equal(server);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('foo');
      });

      server.on('upgrade', function (req, socket) {
        expect(this).to.equal(server);

        socket.write([
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: WebSocket',
          'Connection: Upgrade',
          '',
          ''
        ].join('\r\n'));

        socket.pipe(socket);
      });

      server.on('listening', function () {
        common.request({
          url: 'http://localhost:'+ server.portnumber
        }, function (err, res, body) {
          if (err) return done(err);

          expect(res.statusCode).to.equal(200);
          expect(body).to.equal('foo');

          http.get({
            headers: { 'Connection': 'Upgrade', 'Upgrade': 'websocket' },
            port: server.portnumber,
            hostname: 'localhost'
          }).on('upgrade', function (res, socket) {
            socket.on('end', done);
            socket.end();
          });
        });
      });

      primus = new Primus(server, { pingInterval: false });
      server.portnumber = common.port;
      server.listen(server.portnumber);
    });
  });

  it('removes connections internally on disconnect', function (done) {
    var spark = new primus.Spark()
      , sparks = new primus.Spark();

    setImmediate(function () {
      expect(primus.connected).to.equal(2);
      sparks.end();
      spark.end();

      setTimeout(function () {
        expect(primus.connected).to.equal(0);
        expect(Object.keys(primus.connections).length).to.equal(primus.connected);

        done();
      });
    });
  });

  it('throws a human readable error for an unsupported transformer', function () {
    var restoreConsole = stub(console, 'error');

    try {
      new Primus(server, { transformer: 'cowsack' });
    } catch (e) {
      expect(e).to.be.instanceOf(Error);
      return expect(e.message).to.include('cowsack');
    } finally {
      restoreConsole();
    }

    throw new Error('Should have thrown');
  });

  it('throws a human readable error for an unsupported parser', function () {
    var restoreConsole = stub(console, 'error');

    try {
      new Primus(server, { parser: 'cowsack' });
    } catch (e) {
      expect(e).to.be.instanceOf(Error);
      return expect(e.message).to.include('cowsack');
    } finally {
      restoreConsole();
    }

    throw new Error('Should have thrown');
  });

  it('throws an error if initialised with an invalid server instance', function () {
    var app = function () {};

    try {
      new Primus(app);
    } catch (e) {
      expect(e).to.be.instanceOf(Error);
      return expect(e.message).to.include('server instance');
    }

    throw new Error('Should have thrown');
  });

  describe('#plugin', function () {
    it('throws an error if no valid name is provided', function () {
      try { primus.plugin({}); }
      catch (e) {
        expect(e).to.be.instanceOf(Error);
        expect(e.message).to.equal('Plugin name must be a non empty string');
        return;
      }

      throw new Error('Should have thrown');
    });

    it('should check if the name is a string', function () {
      try { primus.plugin(function () {}); }
      catch (e) {
        expect(e).to.be.instanceOf(Error);
        expect(e.message).to.include('Plugin');
        return expect(e.message).to.include('string');
      }

      throw new Error('Should have thrown');
    });

    it('doesnt allow duplicate definitions', function () {
      primus.plugin('foo', { client: function () {} });

      try { primus.plugin('foo', { client: function () {} }); }
      catch (e) {
        expect(e).to.be.instanceOf(Error);
        expect(e.message).to.equal('Plugin name already defined');
        return;
      }

      throw new Error('Should have thrown');
    });

    it('should have a client or server function', function () {
      var called = 0;

      try { primus.plugin('cow', { foo: 'bar' }); }
      catch (e) {
        expect(e).to.be.instanceOf(Error);
        expect(e.message).to.include('missing');
        expect(e.message).to.include('client');
        expect(e.message).to.include('server');
        called++;
      }

      expect(called).to.equal(1);

      primus.plugin('client', { client: function () {} });
      primus.plugin('server', { server: function () {} });
      primus.plugin('both', { server: function () {}, client: function () {} });
    });

    it('should accept function as second argument', function () {
      function Room() {}
      Room.server = function (p) { p.foo = 'bar'; };
      Room.client = function () {};

      primus.plugin('room', Room);

      expect(primus.foo).to.equal('bar');
    });

    it('should accept instances as second argument', function () {
      var A = function () {};
      A.prototype.server = function (p) { p.foo = 'bar'; };
      A.prototype.client = function () {};

      var B = function () {};
      B.prototype.server = function (p) { p.bar = 'foo'; };
      B.prototype.client = function () {};

      var a = new A();
      var b = Object.create(B.prototype);

      primus
        .plugin('a', a)
        .plugin('b', b);

      expect(primus.foo).to.equal('bar');
      expect(primus.bar).to.equal('foo');
    });

    it('should check if energon is an object or a function', function () {
      try { primus.plugin('room', true); }
      catch (e) {
        expect(e).to.be.instanceOf(Error);
        expect(e.message).to.equal('Plugin should be an object or function');
        return;
      }

      throw new Error('Should have thrown');
    });

    it('returns this', function () {
      var x = primus.plugin('foo', { client: function () {}});

      expect(x).to.equal(primus);
    });

    it('should have no plugins', function () {
      expect(Object.keys(primus.ark)).to.have.length(0);
    });

    it('calls the supplied server plugin', function (done) {
      var primus = new Primus(server, { foo: 'bar', pingInterval: false });

      primus.plugin('test', {
        server: function server(pri, options) {
          expect(options).to.be.a('object');
          expect(options.foo).to.equal('bar');
          expect(pri).to.equal(primus);
          expect(this).to.equal(pri);

          done();
        }
      });
    });
  });

  describe('#forEach', function () {
    it('iterates over all active connections', function (done) {
      new primus.Spark();
      new primus.Spark();

      setImmediate(function () {
        expect(primus.connected).to.equal(2);

        var iterations = 0;

        primus.forEach(function (client, id, connections) {
          expect(connections).to.be.a('object');
          expect(client).to.be.instanceOf(primus.Spark);
          expect(id).to.be.a('string');

          iterations++;
        });

        expect(iterations).to.equal(2);
        done();
      });
    });

    it('can bailout by returning false', function (done) {
      new primus.Spark();
      new primus.Spark();

      setImmediate(function () {
        expect(primus.connected).to.equal(2);

        var iterations = 0;

        primus.forEach(function () {
          iterations++;

          return false;
        });

        expect(iterations).to.equal(1);
        done();
      });
    });

    it('iterates over all active connections asynchronously', function (done) {
      var initial = 4
        , iterations = 0;

      for (var i = 0; i < initial; i++) {
        new primus.Spark();
      }

      setImmediate(function () {
        expect(primus.connected).to.equal(4);

        var first = true;

        primus.forEach(function (spark, next) {
          iterations++;
          expect(spark).to.be.instanceOf(primus.Spark);
          setTimeout(function () {
            next();

            if (first) {
              for (var i = 0; i < 4; i++) {
                new primus.Spark();
              }

              first = false;
            }
          }, 2);
        }, function () {
          expect(iterations).to.equal(8);
          done();
        });
      });
    });

    it('can bailout async', function (done) {
      var initial = 4
        , iterations = 0;

      for (var i = 0; i < initial; i++) {
        new primus.Spark();
      }

      setImmediate(function () {
        expect(primus.connected).to.equal(4);

        primus.forEach(function (spark, next) {
          iterations++;
          expect(spark).to.be.instanceOf(primus.Spark);
          next(undefined, false);
        }, function () {
          expect(iterations).to.equal(1);
          done();
        });
      });
    });
  });

  describe('#library', function () {
    it('includes the library of the transformer', function () {
      const primus = new Primus(server, {
        transformer: 'engine.io',
        pingInterval: false
      });
      const library = primus.library();

      expect(library).to.be.a('string');
      expect(primus.transformer.library).to.be.a('string');

      expect(library).to.include(primus.transformer.library);
    });

    it('includes the transformers client', function () {
      const primus = new Primus(server, {
        transformer: 'engine.io',
        pingInterval: false
      });
      const library = primus.library();

      expect(library).to.be.a('string');
      expect(primus.transformer.client).to.be.a('function');

      expect(library).to.include(primus.transformer.client.toString());
    });

    it('includes the prism client library', function () {
      expect(primus.library()).to.include('Primus(url, options);');
    });

    it('includes the configuration details', function () {
      expect(primus.library()).to.include(primus.version);
      expect(primus.library()).to.include(primus.pathname);
    });

    it('includes the library of the parsers', function () {
      var primus = new Primus(server, { parser: 'ejson', pingInterval: false })
        , library = primus.library();

      expect(library).to.be.a('string');
      expect(primus.parser.library).to.be.a('string');
      expect(library).to.include(primus.parser.library);
    });

    it('includes the decoders', function () {
      expect(primus.library()).to.include(primus.encoder.toString());
      expect(primus.library()).to.include(primus.decoder.toString());
    });

    it('includes the client plugins', function () {
      var primus = new Primus(server, { pingInterval: false })
        , library;

      primus.plugin('log', { client: function () {
        console.log('i am a client plugin');
      }});

      library = primus.library();

      expect(library).to.be.a('string');
      expect(library).to.include('i am a client plugin');
    });

    it('updates the default value of the `pingTimeout` option', function (done) {
      var primus = new Primus(server, { pingInterval: 60000 })
        , socket = new primus.Socket('http://localhost:'+ server.portnumber);

      expect(socket.options.pingTimeout).to.equal(90000);
      socket.on('open', primus.destroy.bind(primus, { close: false }));
      socket.on('end', function () {
        primus = new Primus(server, { pingInterval: false });
        socket = primus.Socket('http://localhost:'+ server.portnumber);

        expect(socket.options.pingTimeout).to.equal(false);
        socket.on('open', socket.end).on('end', done);
      });
    });

    it('still allows overriding the value of the `pingTimeout` option', function (done) {
      var primus = new Primus(server, { pingInterval: false })
        , Socket = primus.Socket;

      var socket = new Socket('http://localhost:'+ server.portnumber, {
        pingTimeout: 100
      });

      expect(socket.options.pingTimeout).to.equal(100);
      socket.on('open', socket.end).on('end', done);
    });

    it('allows the use of options when using the default connection URL', function () {
      var Socket = primus.Socket;

      var socket = new Socket({
        pingTimeout: 100,
        strategy: false,
        manual: true
      });

      expect(socket.url).to.eql(socket.parse('http://127.0.0.1'));
      expect(socket.options.pingTimeout).to.equal(100);
      expect(socket.options.strategy).to.have.length(0);
    });

    it('allows option.(url|uri) as url', function () {
      var socket = new primus.Socket({
        url: 'http://google.com',
        pingTimeout: 100,
        strategy: false,
        manual: true
      });

      expect(socket.url).to.eql(socket.parse('http://google.com'));

      socket = new primus.Socket({
        uri: 'http://google.com',
        pingTimeout: 100,
        strategy: false,
        manual: true
      });

      expect(socket.url).to.eql(socket.parse('http://google.com'));
    });

    it('does not add a trailing slash to the connection URL pathname', function () {
      var socket = new primus.Socket({ manual: true })
        , uri = socket.uri({ query: true });

      expect(socket.parse(uri).pathname).to.equal('/primus');
    });
  });

  describe('#save', function () {
    it('saves the library in the specified location', function (done) {
      var async = __dirname + '/primus.save.async.js'
        , sync = __dirname + '/primus.save.sync.js';

      primus.save(sync);
      expect(fs.readFileSync(sync, 'utf-8')).to.equal(primus.library());

      primus.save(async, function (err) {
        if (err) return done(err);

        expect(fs.readFileSync(async, 'utf-8')).to.equal(primus.library());
        done();
      });
    });

    it('allows setting a custom client class name', function (done) {
      var async = __dirname + '/primus.save.async.js'
        , sync = __dirname + '/primus.save.sync.js';

      var primus = new Primus(server, {
        pingInterval: false,
        global: 'Unicron'
      });

      // Ensures that the JS is still executable;
      expect(primus.Socket).to.be.a('function');

      primus.save(sync);
      expect(fs.readFileSync(sync, 'utf-8')).to.equal(primus.library());
      expect(fs.readFileSync(sync, 'utf-8')).to.include('"Unicron"');

      primus.save(async, function (error) {
        if (error) return done(error);

        expect(fs.readFileSync(async, 'utf-8')).to.equal(primus.library());
        expect(fs.readFileSync(async, 'utf-8')).to.include('"Unicron"');
        done();
      });
    });
  });

  describe('#reserved', function () {
    it('sees all incoming:: and outgoing:: as reserved', function () {
      expect(primus.reserved('incoming::error')).to.equal(true);
      expect(primus.reserved('outgoing::error')).to.equal(true);
      expect(primus.reserved('incoming::')).to.equal(true);
      expect(primus.reserved('outgoing::')).to.equal(true);
      expect(primus.reserved('somwhatincoming::error')).to.equal(false);
      expect(primus.reserved('somwhatoutgoing::error')).to.equal(false);
      expect(primus.reserved('INCOMING::ERROR')).to.equal(false);
      expect(primus.reserved('OUTGOING::ERROR')).to.equal(false);
      expect(primus.reserved('INCOMING::')).to.equal(false);
      expect(primus.reserved('OUTGOING::')).to.equal(false);
    });

    it('sees specific events as reserved', function () {
      expect(primus.reserved('log')).to.equal(true);
      expect(primus.reserved('ERROR')).to.equal(false);
    });
  });

  describe('#createServer', function () {
    it('returns a new primus instance', function (done) {
      const primus = Primus.createServer({
        port: common.port,
        iknowhttpsisbetter: true,
        pingInterval: false
      });

      expect(primus).to.be.instanceOf(Primus);
      expect(primus.server).to.be.instanceOf(http.Server);

      primus.server.once('listening', function () {
        primus.end(done);
      });
    });

    it('applies the options to the Primus server', function (done) {
      const primus = Primus.createServer({
        port: common.port,
        transformer: 'engine.io',
        iknowhttpsisbetter: true,
        pingInterval: false
      });

      expect(primus.spec.transformer).to.equal('engine.io');

      primus.server.once('listening', function () {
        primus.end(done);
      });
    });
  });

  describe('#destroy', function () {
    it('emits a final close event on the primus instance', function (done) {
      primus.on('close', function (options) {
        expect(options).to.eql({});
        done();
      });

      primus.destroy();
    });

    it('emits a final close event on the transformer instance', function (done) {
      primus.transformer.on('close', function (options) {
        expect(options).to.eql({});
        done();
      });

      primus.destroy();
    });

    it('does not throw errors when called multiple times', function (done) {
      var count = 0;

      function next() {
        if (++count === 4) done();
      }

      primus.destroy(next);
      primus.destroy(next);
      primus.destroy(next);
      primus.destroy(next);
    });

    it('reattaches the original listeners back to the server', function (done) {
      var requestHandler = function () {}
        , upgradeHandler = function () {}
        , close = true
        , primus
        , server;

      server = http.createServer();
      server.on('request', requestHandler);
      server.on('upgrade', upgradeHandler);
      primus = new Primus(server);

      server.on('listening', function () {
        expect(server.listeners('request')[0]).to.not.equal(requestHandler);
        expect(server.listeners('upgrade')[0]).to.not.equal(upgradeHandler);
        primus.destroy({ close: close }, function () {
          expect(server.listeners('request')[0]).to.equal(requestHandler);
          expect(server.listeners('upgrade')[0]).to.equal(upgradeHandler);

          if (!close) return server.close(done);

          close = false;
          primus = new Primus(server);
          server.listen(common.port);
        });
      });

      server.listen(common.port);
    });

    it('can trigger a client-side reconnect', function (done) {
      var socket = new primus.Socket('http://localhost:'+ server.portnumber);

      socket.on('reconnect scheduled', function () {
        socket.end();
        done();
      });

      socket.on('open', function () {
        primus.destroy({ reconnect: true });
      });
    });
  });
});

function stub(obj, prop) {
  const stubbed = obj[prop];
  obj[prop] = () => {};
  return () => { obj[prop] = stubbed; };
}
