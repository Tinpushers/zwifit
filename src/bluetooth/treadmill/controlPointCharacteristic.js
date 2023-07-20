var util = require('util');
var bleno = require('bleno');
var events = require('../../lib/events'),
    constants = require('../../settings');

function ControlPointCharacteristic(incline) {
    bleno.Characteristic.call(this, {
        uuid: '2AD9',
        properties: ['write'],
        descriptors: [
            new bleno.Descriptor({
                uuid: '2901',
                value: 'Gets or sets the treadmill incline.'
            })
        ]
    });

    
}


util.inherits(ControlPointCharacteristic, bleno.Characteristic);

ControlPointCharacteristic.prototype.onWriteRequest = function (data, offset, withoutResponse, callback) {

    if (data.length == 3) {
        console.log("Control point request received " + String(data.readUInt8(0)) + "," + String(data.readUInt8(1)) + "," + String(data.readUInt8(2)));
    }

    if (offset) {
        //console.log("Incline change request not long enough:");
        callback(this.RESULT_ATTR_NOT_LONG);
    }
    else if (data.length !== 3) {
               
        callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
    }
    else if (data.readUInt8(0) !== 3) {
        //console.log("Not a valid incline request");
        
        callback(this.RESULT_UNLIKELY_ERROR);
    }
    else {
        

        var incline = Math.round(data.readUInt8(1) * 0.1);     

        maxinc = parseInt(constants.maxinc);
        mininc = parseInt(constants.mininc);

        if (incline > maxinc) { incline = maxinc; }
        if (incline < mininc) { incline = mininc; }
                


        if (incline !== this.incline) {
            this.incline = incline;
            console.log("Incline change request received :" + String(incline));
            events.fire('controlRequested', this)
            events.fire('changeReceived', this);
        }
        callback(this.RESULT_SUCCESS);         
            
        }
    
};


util.inherits(ControlPointCharacteristic, bleno.Characteristic);
module.exports = ControlPointCharacteristic;
