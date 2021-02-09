const settings = require('../../settings');
const noble = require('noble');
const Constants = require('./_constants');
const request = require('./_request');
const events = require('../../lib/events');

let sportsEquipment = undefined;
let rx = undefined;
let tx = undefined;
let equipmentInformation = undefined;
let readCurrentTimer = undefined;
let updateValues = undefined;
let current = {
	connected: false,
	mode: Constants.Mode.Idle
};
let disconnectedHook = undefined;

exports.current = current;

function connect(callOnDisconnect) {
	disconnectedHook = callOnDisconnect;
	setTimeout(initializeBle, 2000);
	events.on('controlRequested', controlRequested);
}
exports.connect = connect;

function disconnect() {
	sportsEquipment.disconnect();
}
exports.disconnect = disconnect;

function peripheralDisconnected() {
	console.log('Disonnected :-(');
	current.connected = false;
	current.mode = Constants.Mode.Idle;
	
	if (readCurrentTimer) {
		clearInterval(readCurrentTimer);
	}
	sportsEquipment = undefined;
	readCurrentTimer = undefined;
	updateValues = undefined;
	rx = undefined;
	tx = undefined;
	
	if (disconnectedHook) {
		disconnectedHook();
	}
	
	noble.startScanning();
}

function controlRequested(message) {
	if (! readCurrentTimer) {
		return;
	}
	
	let speed = undefined;
	if (message.kph) {
		if (equipmentInformation.Metric) {
			speed = safeParseFloat(message.kph);
		} else {
			speed = safeParseFloat(message.kph) * 0.621;
		}
	} else if (message.mph) {
		if (equipmentInformation.Metric) {
			speed = safeParseFloat(message.mph) / 0.621;
		} else {
			speed = safeParseFloat(message.mph);
		}
	}

	const updates = [];
	if (speed !== undefined) {
		if (speed <= equipmentInformation.MinKph) {
			updates.push({
				characteristic: Constants.Characteristic.Mode,
				value: Constants.Mode.Pause
			});
		} else {
			if (speed >= equipmentInformation.MaxKph) {
				speed = equipmentInformation.MaxKph;
			}
			updates.push({
				characteristic: Constants.Characteristic.Kph,
				value: speed
			});
		}
	}

	let newIncline = message.incline ? message.incline : message.zwiftIncline;
	if (newIncline !== undefined) {
		let incline = safeParseFloat(newIncline);
		if (incline <= equipmentInformation.MinIncline) {
			incline = equipmentInformation.MinIncline;
		} else if (incline >= equipmentInformation.MaxIncline) {
			incline = equipmentInformation.MaxIncline;
		}
		updates.push({
			characteristic: Constants.Characteristic.Incline,
			value: incline
		});
	}
	
	if (current.mode === Constants.Mode.Active) {
		updateValues = updates;
	}
}

function prettyPrintedBleCode() {
	return settings.bleCode.substring(2) + settings.bleCode.substring(0, 2);
}

function initializeBle() {
	
	//once a BLE device was found check if it is a iFit sport equiment
	noble.on('discover', function(peripheral) {
		if (! peripheral.advertisement.manufacturerData) {
			return;
		}
		if (peripheral.advertisement.manufacturerData
				&& peripheral.advertisement.manufacturerData.toString('hex')
						.toLowerCase().endsWith('dd' + settings.bleCode)) {
			noble.stopScanning();

			console.log('Found treadmill name with code '
					+ prettyPrintedBleCode()
					+ ' and name '
					+ settings.bleDeviceName);
			sportsEquipment = peripheral;
			
			peripheral.on('disconnect', peripheralDisconnected);
	
			setTimeout(exploreSportsEquipment, 1000);
		}
	});
	
	//start scanning for sports equiments
	noble.on('stateChange', function(state) {
		if (state === 'poweredOn') {
			console.log('BLE: Powered On.');
			noble.startScanning();
		} else {
			console.log('BLE: Powered Off.');
			noble.stopScanning();
		}
	});

}

//connect to the sport equiment and store its characteristics
function exploreSportsEquipment() {
	
	sportsEquipment.connect(function(error) {
		if (error) {
			console.log('Could not connect to treadmill:', error);
			return;
		}
		
		request.initTxAndRx(sportsEquipment, (error, newTx, newRx) => {
			if (error) {
				console.log(error);
				sportsEquipment.disconnect();
				return;
			}
			tx = newTx;
			rx = newRx;
			loadEquipmentInformation();
		})

	});		
}

// initialize tx/rx communication
function loadEquipmentInformation() {
	
	request.getEquipmentInformation(tx, rx, function(data, error) {
		if (error) {
			console.log('Could not get equipment information:', error);
			sportsEquipment.disconnect();
		} else {
			equipmentInformation = data;
			loadSupportedCapabilities();
		}
	});
	
}

function loadSupportedCapabilities() {

	request.getSupportedCapabilities(equipmentInformation, tx, rx, function(supportedCapabilities, error) {
		if (error) {
			console.log('Could not get supported equipments:', error);
			sportsEquipment.disconnect();
		} else {
			equipmentInformation = {
					...equipmentInformation,
					...supportedCapabilities
				};
			enable();
		}
	});

}

function enable() {

	request.enable(equipmentInformation, tx, rx, function(data, error) {
		if (error) {
			console.log('Failed to enable:', error);
			sportsEquipment.disconnect();
		} else {
			equipmentInformation = {
					...equipmentInformation,
					...data
				};
			readMaxAndMin();
		}
	}, settings.bleActivation);

}

function readMaxAndMin() {

	const reads = [
			Constants.Characteristic.MaxIncline,
			Constants.Characteristic.MinIncline,
			Constants.Characteristic.MaxKph,
			Constants.Characteristic.MinKph,
			Constants.Characteristic.MaxPulse,
			Constants.Characteristic.Metric
		];
	request.writeAndRead(equipmentInformation, undefined, reads, tx, rx, function(data, error) {
		if (error) {
			console.log('Failed to read max and mins:', error);
			sportsEquipment.disconnect();
		} else {
			equipmentInformation = {
					...equipmentInformation,
					...data
				};
			console.log('Connected :-)');
			current.connected = true;
			readCurrentTimer = setInterval(readCurrentValues, 500);
		}
	});

}

function readCurrentValues() {
	const reads = [
			Constants.Characteristic.Kph,
			Constants.Characteristic.CurrentKph,
			Constants.Characteristic.CurrentIncline,
			Constants.Characteristic.Pulse,
			Constants.Characteristic.Mode,
		];
	request.writeAndRead(equipmentInformation, updateValues, reads, tx, rx, function(data, error) {
		if (error) {
			if (error === 'disconnected') {
				clearInterval(readCurrentTimer);
			} else {
				console.log('Failed to read current values:', error);
			}
		} else {
			updateValues = undefined;
			
			current.mode = data.Mode;
			const changes = {};
			let currentSpeed;
			let configuredSpeed;
			if (equipmentInformation.Metric === settings.metric) {
				currentspeed = safeParseFloat(data.CurrentKph);
				configuredSpeed = safeParseFloat(data.Kph);
			} else if (equipmentInformation.Metric) {
				currentspeed = safeParseFloat(data.CurrentKph) * 0.621;
				configuredSpeed = safeParseFloat(data.Kph) * 0.621;
			} else {
				currentspeed = safeParseFloat(data.CurrentKph) / 0.621;
				configuredSpeed = safeParseFloat(data.Kph) * 0.621;
			}
			let speed = !currentSpeed || currentSpeed === 0 ? configuredSpeed : currentSpeed;
			if (speed < 0.1) {
				speed = 0;
			} else {
				if (settings.speedOffset) {
					speed += safeParseFloat(settings.speedOffset);
				}
				if (settings.speedMultiplier) {
					speed *= safeParseFloat(settings.speedMultiplier);
				}
			}
			changes[settings.metric ? 'kph' : 'mph'] = speed;
			
			changes['incline'] = safeParseFloat(data.CurrentIncline);
			
			if (data.Pulse && (data.Pulse.source !== Constants.PulseSource.No)) {
				changes['hr'] = data.Pulse.pulse;
			}
			
			events.fire('changeReceived', changes);
		}
	});
	
}

function safeParseFloat(val) {
	try {
		return parseFloat(val);
	}
	catch (err) {
		return 0;
	}
}
