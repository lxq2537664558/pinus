"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const handler_1 = require("./common/handler");
const pinus_protocol_1 = require("pinus-protocol");
const EventEmitter = require("events");
const pinus_logger_1 = require("pinus-logger");
var logger = pinus_logger_1.getLogger('pinus', __filename);
var ST_INITED = 0;
var ST_WAIT_ACK = 1;
var ST_WORKING = 2;
var ST_CLOSED = 3;
class UdpSocket extends EventEmitter {
    constructor(id, socket, peer) {
        super();
        this.id = id;
        this.socket = socket;
        this.peer = peer;
        this.host = peer.address;
        this.port = peer.port;
        this.remoteAddress = {
            ip: this.host,
            port: this.port
        };
        var self = this;
        this.on('package', function (pkg) {
            if (!!pkg) {
                pkg = pinus_protocol_1.Package.decode(pkg);
                handler_1.default(self, pkg);
            }
        });
        this.state = ST_INITED;
    }
    ;
    /**
     * Send byte data package to client.
     *
     * @param  {Buffer} msg byte data
     */
    send(msg) {
        if (this.state !== ST_WORKING) {
            return;
        }
        if (msg instanceof String) {
            msg = new Buffer(msg);
        }
        else if (!(msg instanceof Buffer)) {
            msg = new Buffer(JSON.stringify(msg));
        }
        this.sendRaw(pinus_protocol_1.Package.encode(pinus_protocol_1.Package.TYPE_DATA, msg));
    }
    ;
    sendRaw(msg) {
        this.socket.send(msg, 0, msg.length, this.port, this.host, function (err, bytes) {
            if (!!err) {
                logger.error('send msg to remote with err: %j', err.stack);
                return;
            }
        });
    }
    ;
    sendForce(msg) {
        if (this.state === ST_CLOSED) {
            return;
        }
        this.sendRaw(msg);
    }
    ;
    handshakeResponse(resp) {
        if (this.state !== ST_INITED) {
            return;
        }
        this.sendRaw(resp);
        this.state = ST_WAIT_ACK;
    }
    ;
    sendBatch(msgs) {
        if (this.state !== ST_WORKING) {
            return;
        }
        var rs = [];
        for (var i = 0; i < msgs.length; i++) {
            var src = pinus_protocol_1.Package.encode(pinus_protocol_1.Package.TYPE_DATA, msgs[i]);
            rs.push(src);
        }
        this.sendRaw(Buffer.concat(rs));
    }
    ;
    disconnect() {
        if (this.state === ST_CLOSED) {
            return;
        }
        this.state = ST_CLOSED;
        this.emit('disconnect', 'the connection is disconnected.');
    }
    ;
}
exports.UdpSocket = UdpSocket;
//# sourceMappingURL=udpsocket.js.map