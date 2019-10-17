describe('Spark Unit', function() {
  'use strict';

  var common = require('./common'),
    Primus = common.Primus,
    http = require('http'),
    expect = common.expect,
    server, primus;

  beforeEach(function beforeEach(done) {
    server = http.createServer();
    server.portnumber = common.port;
    server.listen(server.portnumber, done);
  });

  afterEach(function afterEach(done) {
    primus.destroy(done);
  });

  describe('#legacy heartbeats', function() {

    it('tests sparkIsLegacy', function() {
      primus = new Primus(server);
      var spark = new primus.Spark();
      expect(spark.getProtocolVersion(spark)).to.equal(-1);
      spark.happnProtocol = 'happn_4';
      expect(spark.getProtocolVersion(spark)).to.equal(4);
      spark.happnProtocol = 'happn_10';
      expect(spark.getProtocolVersion(spark)).to.equal(10);
      spark.happnProtocol = '10';
      expect(spark.getProtocolVersion(spark)).to.equal(10);
      spark.happnProtocol = '4';
      expect(spark.getProtocolVersion(spark)).to.equal(4);
      spark.happnProtocol = '1.1.0';
      expect(spark.getProtocolVersion(spark)).to.equal(1);
      spark.happnProtocol = undefined;
      expect(spark.getProtocolVersion(spark)).to.equal(-1);
      spark.happnProtocol = 'blah';
      expect(spark.getProtocolVersion(spark)).to.equal(-1);
      spark.happnProtocol = 'happn_3';
      expect(spark.getProtocolVersion(spark)).to.equal(3);
    });

    it('tests the heartbeat override, happnConnected, non-legacy', function(done) {

      this.timeout(10000);

      primus = new Primus(server, {
        pingInterval: 3000
      });
      var spark = new primus.Spark();
      var secondHeartBeat = false;
      var pinged = false;

      spark.on('outgoing::ping', function() {
        pinged = true;
        expect(secondHeartBeat).to.equal(true);
        spark.end();
        done();
      });

      spark.happnConnected = Date.now();
      spark.heartbeat();

      setTimeout(function() {
        expect(pinged).to.equal(false);
        secondHeartBeat = true;
        spark.happnProtocol = 'happn_4';
        spark.heartbeat();
      }, 2000);
    });

    it('tests the heartbeat override, happnConnected, legacy', function(done) {

      this.timeout(10000);

      primus = new Primus(server, {
        pingInterval: 3000
      });
      var spark = new primus.Spark();
      var pinged = false;

      spark.on('outgoing::ping', function() {
        pinged = true;
      });

      spark.happnConnected = Date.now();
      spark.happnProtocol = 'happn_3';

      expect(spark.alive).to.equal(true);

      spark.heartbeat();

      setTimeout(function() {
        expect(pinged).to.equal(false);
        setTimeout(function() {
          expect(pinged).to.equal(false);
          done();
        }, 2000);
      }, 2000);
    });

    it('tests the heartbeat override, happnConnected, legacy unresponsive', function(done) {

      this.timeout(65000);

      primus = new Primus(server, {
        pingInterval: 3000
      });

      var spark = new primus.Spark();
      var unresponsive = false;

      var pinged = false;
      spark.on('outgoing::ping', function() {
        pinged = true;
      });
      spark.on('unresponsive', function() {
        unresponsive = true;
      });

      spark.happnConnected = Date.now();
      spark.happnProtocol = 'happn_3';

      expect(spark.alive).to.equal(true);

      spark.heartbeat();

      setTimeout(function() {
        expect(unresponsive).to.equal(false);
        setTimeout(function() {
          expect(unresponsive).to.equal(false);
          console.log('still testing...please wait another 50 seconds');
          setTimeout(function() {
            expect(unresponsive).to.equal(true);
            expect(pinged).to.equal(false);
            done();
          }, 55000);//client ping has not happened for 2 x 25e3
        }, 2000);
      }, 2000);
    });

    it('tests the heartbeat override, happnConnected, legacy unresponsive, with legacyPing', function(done) {

      this.timeout(15000);

      primus = new Primus(server, {
        pingInterval: 3000
      });
      var spark = new primus.Spark();
      var unresponsive = false;

      var pinged = false;
      spark.on('outgoing::ping', function() {
        pinged = true;
      });
      spark.on('unresponsive', function() {
        unresponsive = true;
      });

      spark.happnConnected = Date.now();
      spark.happnProtocol = 'happn_3';

      expect(spark.alive).to.equal(true);

      spark.heartbeat();

      setTimeout(function() {
        expect(unresponsive).to.equal(false);
        setTimeout(function() {
          expect(unresponsive).to.equal(false);
          //half way through we get a legacy ping
          setTimeout(function(){
            spark.onLegacyPing('primus::ping::' + Date.now());
          }, 3000);
          setTimeout(function() {
            expect(unresponsive).to.equal(false);
            expect(pinged).to.equal(false);
            done();
          }, 6000);//client ping has not happened for pingInterval * 2
        }, 2000);
      }, 2000);
    });

    it('tests the heartbeat override, happnConnected, non-legacy unresponsive, without pong', function(done) {

      this.timeout(15000);

      primus = new Primus(server, {
        pingInterval: 3000
      });
      var spark = new primus.Spark();
      var unresponsive = false;

      var pinged = false;
      spark.on('outgoing::ping', function() {
        pinged = true;
      });
      spark.on('unresponsive', function() {
        unresponsive = true;
      });

      spark.happnConnected = Date.now();


      expect(spark.alive).to.equal(true);
      spark.heartbeat();

      setTimeout(function() {
        expect(unresponsive).to.equal(false);
        setTimeout(function() {
          expect(unresponsive).to.equal(false);
          spark.happnProtocol = 'happn_4';
          setTimeout(function() {
            expect(unresponsive).to.equal(true);
            expect(pinged).to.equal(true);
            done();
          }, 7000);//client ping has not happened for pingInterval * 2
        }, 2000);
      }, 2000);
    });

    it('tests the heartbeat override, happnConnected, non-legacy unresponsive, with pong', function(done) {

      this.timeout(20000);

      primus = new Primus(server, {
        pingInterval: 3000
      });

      var spark = new primus.Spark({});
      var unresponsive = false;
      var pinged = false;
      spark.on('outgoing::ping', function() {
        pinged = true;
      });
      spark.on('unresponsive', function() {
        unresponsive = true;
      });

      spark.happnConnected = Date.now();
      expect(spark.alive).to.equal(true);

      spark.heartbeat();

      setTimeout(function() {
        expect(unresponsive).to.equal(false);
        setTimeout(function() {
          expect(unresponsive).to.equal(false);
          spark.happnProtocol = 'happn_4';//CONFIGURE-SESSION happens
          //half way through we get a pong
          setTimeout(function(){
            //fake ping event from spark
            spark.alive = true;
            spark.emit('heartbeat');
          }, 3000);
          setTimeout(function() {
            expect(unresponsive).to.equal(true);
            expect(pinged).to.equal(true);
            done();
          }, 12000);//client ping has not happened for pingInterval * 2
        }, 2000);
      }, 2000);
    });
  });

  describe('#skip a beat', function() {

    it('tests endUnresponsive, we skipped a beat, default 1', function(done) {
      this.timeout(10000);
      primus = new Primus(server);
      var spark = new primus.Spark();

      spark.__originalEnd = spark.end.bind(spark);

      var endMessages = [];

      spark.on('outgoing::end', function() {
        endMessages.push('outgoing::end');
      });

      spark.endUnresponsive();
      setTimeout(function() {
        expect(endMessages.length).to.equal(0);
        spark.endUnresponsive();
        setTimeout(function() {
          expect(endMessages.length).to.equal(1);
          done();
        }, 1000);
      }, 1000);
    });

    it('tests endUnresponsive, we skipped a beat with beat setting', function(done) {
      this.timeout(10000);
      primus = new Primus(server, {
        allowSkippedHeartBeats: 3
      });
      var spark = new primus.Spark();

      spark.__originalEnd = spark.end.bind(spark);

      var endMessages = [];

      spark.on('outgoing::end', function() {
        endMessages.push('outgoing::end');
      });

      spark.endUnresponsive();
      setTimeout(function() {
        expect(endMessages.length).to.equal(0);
        expect(spark.skipped).to.equal(1);
        spark.endUnresponsive();
        setTimeout(function() {
          expect(endMessages.length).to.equal(0);
          expect(spark.skipped).to.equal(2);
          spark.endUnresponsive();
          setTimeout(function() {
            expect(endMessages.length).to.equal(0);
            expect(spark.skipped).to.equal(3);
            spark.endUnresponsive();
            setTimeout(function() {
              expect(endMessages.length).to.equal(1);
              done();
            }, 1000);
          }, 1000);
        }, 1000);
      }, 1000);
    });
  });
});
