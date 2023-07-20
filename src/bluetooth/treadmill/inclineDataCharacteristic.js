let util = require('util'),
	bleno = require('bleno'),
constants = require('../../settings');

function InclineDataCharacteristic() {
	InclineDataCharacteristic.super_.call(this, {
		uuid: '2AD5',
		properties: ['read'],
		value: null,
		descriptors: []
	});
}

util.inherits(InclineDataCharacteristic, bleno.Characteristic);


InclineDataCharacteristic.prototype.onReadRequest = function (offset, callback) {
		
	
	maxinc = parseInt(constants.maxinc) * 10;
	mininc = parseInt(constants.mininc) * 10;
	minstep = parseInt(constants.minstep) * 10;

	//create a buffer value using signed integers to allow for -ve numbers
	const data = Buffer.alloc(7)
	data.writeIntLE(mininc,0,2) // minimum inclination
	data.writeIntLE(maxinc,2,3) // maximum inclination
	data.writeIntLE(minstep,4,2) // minimum increment
	
	let result = this.RESULT_SUCCESS;
	
	if (offset > data.length) {
		result = this.RESULT_INVALID_OFFSET;
		data = null;
	}
	callback(result, data);
};

module.exports = InclineDataCharacteristic;