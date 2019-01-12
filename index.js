var Primus = require('primus');

Primus.Spark.prototype.sparkIsLegacy = function(spark){

  if (spark.lastPing) return true;
  if (!spark.happnProtocol) return true;//old happn clients
  var protocolNumber = spark.happnProtocol.substring(spark.happnProtocol.length - 1);

  if (isNaN(protocolNumber)) return true;
  if (parseInt(protocolNumber) < 4) return true;
  return false;
}

Primus.Spark.prototype.endUnresponsive = function(){

  this.emit('unresponsive');

  //skip a single beat, always
  if (!this.primus.options.allowSkippedHeartBeats) this.primus.options.allowSkippedHeartBeats = 1;
  if (!this.skipped) this.skipped = 0;

  this.skipped++;

  if (this.skipped <= this.primus.options.allowSkippedHeartBeats) return;//skip a beat before killing

  this.end(undefined, { reconnect: true });
}

//overrides happen here
Primus.Spark.prototype.heartbeat = function heartbeat() {

  var spark = this;
  const now = Date.now();

  //we have just connected with a client, need either client side or server side ping
  if (now - spark.happnConnected <= spark.primus.options.pingInterval) return;

  //not alive anymore, end  the spark
  if (!spark.alive) return this.endUnresponsive();

  if (this.sparkIsLegacy(spark)){//lastPing has been set, or protocol has not been set, or protocol is lower than "4"

    //spark has not pinged yet - just set lastPing to now
    if (!spark.lastPing) spark.lastPing = Date.now();

    //lastPing was twice the ping interval ago
    if ((now - spark.lastPing) > (spark.primus.options.pingInterval * 2)){
      spark.alive = false;
      this.endUnresponsive();
    }

    return;//dont send outgoing pings to legacy clients
  }

  spark.skipped = 0;// reset skipped, as we are alive
  spark.alive = false;
  spark.emit('outgoing::ping', now);
  spark._write(`primus::ping::${now}`);
}

//we receive a client ping, just pong straight back
// - this function gets called by the handleMessage function in the session service in happn-3
Primus.Spark.prototype.onLegacyPing = function(pingMessage){
  const lastPing = Date.now();
  this.lastPing = lastPing;
  this.alive = true;
  this.skipped = 0;//reset skipped as we are alive
  this._write('primus::pong::' + pingMessage.split('::')[2]);
  this.emit('heartbeat');
}

//wish we could assign initialization functions to the class and not the instance, but not doable :(
// Primus.Spark.initialise(function(){
//
//   const spark = this;
//
//   spark.primus.transform('incoming', function(packet, next) {
//
//     if (packet.data.indexOf && packet.data.indexOf('primus::ping') == 0) return this.onLegacyPing();
//
//     next();
//   });
// });

module.exports = Primus;
