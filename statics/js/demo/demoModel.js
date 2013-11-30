
function extend(Sup, Sub) {
    Sub.prototype = Object.create(Sup.prototype);
    Sub.prototype.constructor = Sub;
    return Sub;
}
function abstract(){
    throw new Error('don\'t call me, I\'m abstract');
}

function oppositeDirectionTo(dir) {
    switch(dir){
        case 'upstream':
            return 'downstream';
        case 'downstream':
            return 'upstream';
    }
    throw new Error('unknown direction' + dir);
}

function Packet(name, direction, ordering){
    this.direction = direction;
    this.name = name;
    this.events = pubSub();
    this.isFirst = ordering.isFirst;
    this.isLast = ordering.isLast;
    
    Packet.new.emit(this);    
}
Packet.new = singleEventPubSub('new');
Packet.prototype.move = function(fromXY, toXY, latency){
    this.events('move').emit(fromXY, toXY, latency);
}
Packet.prototype.done = function(){
    this.events('done').emit();
};

function PacketHolder(name, locations){
    if( !locations ) {
        throw new Error("don't know where " + name + " is");
    }

    this.name = name;
    this.latency = 0;
    this.locations = locations || {};
    this.adjacents = {
        downstream: new EventSink('downstream void')
    ,   upstream:   new EventSink('upstream void')
    };
}
PacketHolder.prototype.accept = abstract;

PacketHolder.prototype.withDownstream = function(downstream){
    
    this.adjacents.downstream = downstream;
    downstream.adjacents.upstream = this;
        
    return this;    
};
PacketHolder.prototype.propagate = function(packet){
    this.adjacents[packet.direction].accept(packet);
};
PacketHolder.prototype.movePacket = function(packet){
    var fromLocation = oppositeDirectionTo(packet.direction),
        toLocation = packet.direction,
        fromXY = this.locations[fromLocation];
        toXY   = this.locations[toLocation];

    packet.move(fromXY, toXY, this.latency);
};

function EventSink (name) {
    this.name = name;
}


var Wire = extend( PacketHolder, function(name, locations, options) {
    
    PacketHolder.apply(this, arguments);
    this.latency = options.latency;
    this.bandwidth = options.bandwidth;
});
Wire.prototype.accept = function(packet){
    var self = this;
        
    this.movePacket(packet);

    window.setTimeout(function(){
        self.propagate(packet);
    }, this.latency);
};

var Server = extend( PacketHolder, function(name, locations, options) {
    PacketHolder.apply(this, arguments);
    this.timeBetweenPackets = options.timeBetweenPackets;
    this.initialDelay = options.initialDelay;
});
Server.prototype.accept = function(packet, locations){
    
    if( packet.name == 'request' ) {
        this.sendResponse();
        packet.done();
    }
};
Server.prototype.sendResponse = function() {
    window.setTimeout(function(){
        var i = 0,
            interval = window.setInterval(function(){
                    var ordering = {
                        isFirst: i == 0,
                        isLast: i == 6
                    };
                
                    this.propagate(new Packet('response' + i, 'downstream', ordering));
                                
                    if( ordering.isLast ) {
                        window.clearInterval(interval);
                    }
                
                    i++;
                }.bind(this), this.timeBetweenPackets);
        
    }.bind(this), this.initialDelay);
};

var Client = extend( PacketHolder, function(name, locations) {
    PacketHolder.apply(this, arguments);
});

Client.prototype.makeRequest = function(){
    this.propagate(new Packet('request', 'upstream', {isFirst:true, isLast:true}));
};
Client.prototype.accept = function(packet){
    packet.done();    
};
