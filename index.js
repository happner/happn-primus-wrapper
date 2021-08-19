const Primus = require('primus');

Primus.Spark.prototype.getProtocolVersion = function(spark) {
  try {
    const parsedVersion = parseInt(spark.happnProtocol.replace('happn_', ''));
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
  const spark = this;
  const now = Date.now();

  //not alive anymore, end  the spark
  if (!spark.alive) {
    return this.endUnresponsive();
  }

  //the protocol has not been set via CONFIGURE-SESSION, or protocol is lower than "4"
  if (this.getProtocolVersion(spark) < 4) {
    //spark has not pinged yet - set lastPing to now
    if (!spark.lastPing) spark.lastPing = Date.now();
    //lastPing was five times the default legacy ping interval ago
    //even if the spark is non-legacy, the 25 second wait for CONFIGURE-SESSION should be adequate
    const lastPingThreshold = 25e3 * 5;
    if ((now - spark.lastPing) > lastPingThreshold) {
      spark.alive = false;
      console.warn(`legacy client unresponsive after ${lastPingThreshold} seconds`);
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
  const lastPing = Date.now();
  this.lastPing = lastPing;
  this.alive = true;
  this.skipped = 0; //reset skipped as we are alive
  this._write('primus::pong::' + pingMessage.split('::')[2]);
  this.emit('heartbeat');
};

module.exports = Primus;
