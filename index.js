var Primus = require('primus');

Primus.Spark.prototype.getProtocolVersion = function(spark) {
  try {
    let parsedVersion = parseInt(spark.happnProtocol.replace('happn_', ''));
    if (isNaN(parsedVersion)) return -1;
    return parsedVersion;
  } catch (e) {
    //any failures would make the protocol configuration legacy or unconfigured
    return -1;
  }
};

Primus.Spark.prototype.endUnresponsive = function() {
  this.emit('unresponsive');
  //skip a single beat, always
  if (!this.primus.options.allowSkippedHeartBeats) this.primus.options.allowSkippedHeartBeats = 1;
  if (!this.skipped) this.skipped = 0;
  this.skipped++;
  if (this.skipped <= this.primus.options.allowSkippedHeartBeats) {
    return; //skip a beat before killing
  }
  this.end(undefined, {
    reconnect: true
  });
};

//overrides happen here
Primus.Spark.prototype.heartbeat = function heartbeat() {
  let spark = this;
  let now = Date.now();
  //we have just connected with a client, if CONFIGURE-SESSION has not
  //happened yet or the spark is legacy, getProtocolVersion will return -1
  //we then wait until the next ping to ensure we know the spark is legacy
  //or not
  if (this.getProtocolVersion(spark) == -1 &&
    (now - spark.happnConnected <= spark.primus.options.pingInterval)) {
      return;
    }

  //not alive anymore, end  the spark
  if (!spark.alive) {
    return this.endUnresponsive();
  }

  //we have waited for CONFIGURE-SESSION,
  //the protocol has not been set, or protocol is lower than "4"
  if (this.getProtocolVersion(spark) < 4) {
    //spark has not pinged yet - set lastPing to now
    if (!spark.lastPing) spark.lastPing = Date.now();
    //lastPing was twice the default legacy ping interval ago
    if ((now - spark.lastPing) > (25e3 * 2)) {
      spark.alive = false;
      this.endUnresponsive();
    }
    return; //dont send outgoing pings to legacy clients
  }

  spark.skipped = 0; // reset skipped, as we are alive
  spark.alive = false;
  spark.emit('outgoing::ping', now);
  spark._write(`primus::ping::${now}`);
};

//we receive a client ping, just pong straight back
// - this function gets called by the handleMessage function in the session service in happn-3
Primus.Spark.prototype.onLegacyPing = function(pingMessage) {
  let lastPing = Date.now();
  this.lastPing = lastPing;
  this.alive = true;
  this.skipped = 0; //reset skipped as we are alive
  this._write('primus::pong::' + pingMessage.split('::')[2]);
  this.emit('heartbeat');
};

module.exports = Primus;
