// DOMUSTO
import config from '../../config';
import DomustoPlugin from '../../domusto/DomustoPlugin';

// INTERFACES
import { Domusto } from '../../domusto/DomustoInterfaces';

// PLUGIN SPECIFIC
import * as rfxcom from 'rfxcom';
import DomustoDevicesManager from '../../domusto/DomustoDevicesManager';

/**
 * RFXcom plugin for DOMUSTO
 * @author Bas van Dijk
 * @version 0.0.1
 *
 * @class DomustoRfxCom
 * @extends {DomustoPlugin}
 */
class DomustoRfxCom extends DomustoPlugin {

    private attachedInputDeviceIds = [];
    private statusData: { enabledProtocols: any };

    /**
     * Creates an instance of DomustoRfxCom.
     * @param {any} Plugin configuration as defined in the config.js file
     * @memberof DomustoRfxCom
     */
    constructor(pluginConfiguration: Domusto.PluginConfiguration) {

        super({
            plugin: 'RfxCom transceiver',
            author: 'Bas van Dijk',
            category: Domusto.PluginCategories.radio,
            version: '0.0.1',
            website: 'http://domusto.com'
        });

        const isConfigurationValid = this.validateConfigurationAttributes(pluginConfiguration.settings, [
            {
                attribute: 'port',
                type: 'string'
            },
            {
                attribute: 'listenOnly',
                type: 'boolean'
            },
            {
                attribute: 'enabledProtocols',
                type: 'object'
            }
        ]);

        if (isConfigurationValid) {

            this.attachedInputDeviceIds = [];

            try {
                let rfxtrx = new rfxcom.RfxCom(pluginConfiguration.settings.port, { debug: pluginConfiguration.debug });
                this.hardwareInstance = rfxtrx;

                this.hardwareInstance.on('status', status => {
                    this.console.prettyJson(status);
                    this.statusData = status;
                });

                this.hardwareInstance.initialise(() => {

                    if (pluginConfiguration.settings.listenOnly) {
                        this.listenAll();
                        this.console.warning('Listen mode active');
                    } else {
                        this.initialisePlugin();
                    }
                    this.console.header(`${pluginConfiguration.id} plugin ready for sending / receiving data`);
                });

            } catch (error) {
                this.console.log('Initialisation of RfxCom plugin failed', error);
            }

        }

    }

    /**
     * Starts plugin bootstrap
     *
     * @memberof DomustoRfxCom
     */
    initialisePlugin() {
        this.checkEnabledModes();
        this.initialiseInputs();
    }

    /**
     * Broadcasts new device/sensor data when a radio signal is received
     *
     * @param {Domusto.Signal} signal
     * @memberof DomustoRfxCom
     */
    onSignalReceivedForPlugin(signal: Domusto.Signal) {

        if (!this.pluginConfiguration.settings.listenOnly) {

            let deviceId = signal.deviceId.split('-')[1];

            let protocol = signal.deviceId.split('-')[0];
            let protocolType = protocol.split('/')[0];
            let protocolSubType = protocol.split('/')[1];

            this.console.log(deviceId, protocol, protocolType, protocolSubType);

            // e.g. rfxcom.Lighting2, rfxcom.Lighting3 etc.
            let rfxConstructor = rfxcom[protocolType];
            let rfxProtocolType = rfxcom[protocolType.toLowerCase()];

            let rfxSwitch = new rfxConstructor(this.hardwareInstance, rfxProtocolType[protocolSubType]);

            let rfxCommand = null;

            // Convert DOMUSTO command to RfxCom command
            switch (signal.data['state']) {
                case 'on':
                    rfxCommand = 'switchOn';
                    break;
                case 'off':
                    rfxCommand = 'switchOff';
                    break;
                case 'trigger':
                    rfxCommand = 'chime';
                    break;
            }

            this.console.debug('Sending command:');
            this.console.prettyJson({
                id: deviceId,
                command: rfxCommand
            });

            // Execute command
            rfxSwitch[rfxCommand](deviceId, res => {

                this.broadcastSignal(signal.deviceId, {
                    state: signal.data['state']
                });

            });

        }

    }

    /**
     * Checks if the enabled protocols on the device match the protocols defined in the config file
     *
     * @memberof DomustoRfxCom
     */
    checkEnabledModes() {

        const hardwareEnabledProtocols = this.statusData.enabledProtocols.sort();
        const configuredEnabledProtocols = this.pluginConfiguration.settings.enabledProtocols.sort();

        this.console.header('CHECKING ENABLED PROTOCOLS ON RFXCOM DEVICE');

        // check if the enabled protocols are the same as the once on the device
        if (JSON.stringify(hardwareEnabledProtocols) === JSON.stringify(configuredEnabledProtocols)) {
            this.console.log('Enabled protocols in config are the same as on hardware. Skipping setting protocols');
        } else {
            this.console.warning('Enabled protocols in config are NOT the same as on hardware.');

            this.console.log('Enabling protocols in RFXcom device according to config...');

            let enabledProtocolArray = [];

            configuredEnabledProtocols.forEach(protocol => {
                enabledProtocolArray.push(rfxcom.protocols[protocol]);
            }, this);

            this.hardwareInstance.enableRFXProtocols(enabledProtocolArray, () => {
                this.console.error('Enabling protocols finished, please restart DOMUSTO');
            });

        }
    }


    /**
     * Initialise the input devices which use the RfxCom hardware
     *
     * @memberof DomustoRfxCom
     */
    initialiseInputs() {

        const devices = config.devices;
        const protocolsWithListeners = [];

        devices.forEach(device => {

            if (device.plugin.id === 'RFXCOM' && device.enabled) {

                let protocolEventName = null;
                let listenerId = null;
                let eventHandler = null;

                // Temp + Humidity
                if (device.role === 'input' && device.type === 'temperature') {

                    // TODO
                    protocolEventName = device.plugin['deviceId'].split('-')[0];
                    listenerId = device.plugin.id + device.role + device.type;
                    eventHandler = this.onInputTemperature;
                }
                else if (device.role === 'output' && device.type === 'switch') {

                    // TODO
                    protocolEventName = device.plugin['deviceId'].split('/')[0].toLowerCase();
                    listenerId = device.plugin.id + protocolEventName;
                    eventHandler = this.onOutputSwitch;
                }

                // Check if an protocol event name, listener id and event handler is set
                if (protocolEventName && listenerId && eventHandler) {

                    // If protocol has no listener yet
                    if (protocolsWithListeners.indexOf(listenerId) === -1) {
                        this.hardwareInstance.on(protocolEventName, eventHandler.bind(this));
                        protocolsWithListeners.push(listenerId);
                    }

                    this.attachedInputDeviceIds.push(device);

                }
            }

        }, this);

    }

    /**
     * Is triggered when a input is received most of the time via a hardware switch or remote
     *
     * @param {any} receivedData
     * @memberof DomustoRfxCom
     */
    onOutputSwitch(receivedData) {
        this.console.debug('Hardware switch event detected');
        this.console.prettyJson(receivedData);

        const deviceId = receivedData.unitCode ? receivedData.id + '/' + receivedData.unitCode : receivedData.id;
        const devices = DomustoDevicesManager.getDevicesByDeviceId(deviceId);

        for (let device of devices) {

            // Broadcast a signal as if it was send from the client
            this.broadcastSignal(device.plugin.deviceId, {
                state: receivedData.command ? receivedData.command.toLowerCase() : 'trigger'
            }, Domusto.SignalSender.client);

        }

    }

    /**
     * Sends an data update to DOMUSTO for temperature data
     *
     * @param {any} sensorData Data received from the RfxCom
     * @memberof DomustoRfxCom
     */
    onInputTemperature(sensorData) {

        this.console.prettyJson(sensorData);

        const devices = DomustoDevicesManager.getDevicesByDeviceId(sensorData.id);

        // If the sensorData is from a registered input device
        for (let device of devices) {

            const protocolId = device.plugin.deviceId.split('-')[0];
            const typeString = this.subTypeString(protocolId + '-' + sensorData.subtype);

            this.broadcastSignal(device.plugin.deviceId, {
                deviceTypeString: typeString,                 // Name of device type
                temperature: sensorData.temperature,          // Temperature
                humidity: sensorData.humidity,                // Humidity
                humidityStatus: sensorData.humidityStatus,    // Humidity status: 0: dry, 1: comfort, 2: normal, 3: wet etc.
                batteryLevel: sensorData.batteryLevel,        // Battery level
                rssi: sensorData.rssi                         // Radio Signal Strength Indication
            });

        }

    }

    /**
     * Triggered when the listenAll receives data
     *
     * @param {any} type Protocol type
     * @param {any} data Data send by the RfxCom
     * @memberof DomustoRfxCom
     */
    listenAllReceivedInput(type, data) {

        let pluginConfigData = `

  plugin: {
      id: ${this.pluginConfiguration.id},
      deviceId: ` + `${type}-${data.id}` + `,
  }`;

        this.console.log(`Received data for ${type}`);
        this.console.prettyJson(data);
        this.console.log(pluginConfigData);
    }


    /**
     * Listen to all possible protocols
     *
     * @memberof DomustoRfxCom
     */
    listenAll() {

        this.hardwareInstance.on('response', data => {
            this.listenAllReceivedInput('response', data);
        });

        this.hardwareInstance.on('lighting1', (data) => {
            this.listenAllReceivedInput('lighting1', data);
        });

        this.hardwareInstance.on('lighting2', data => {
            this.listenAllReceivedInput('lighting2', data);
        });

        this.hardwareInstance.on('lighting4', data => {
            this.listenAllReceivedInput('lighting4', data);
        });

        this.hardwareInstance.on('lighting5', data => {
            this.listenAllReceivedInput('lighting5', data);
        });

        this.hardwareInstance.on('lighting6', data => {
            this.listenAllReceivedInput('lighting6', data);
        });

        this.hardwareInstance.on('chime1', data => {
            this.listenAllReceivedInput('chime1', data);
        });

        this.hardwareInstance.on('blinds1', data => {
            this.listenAllReceivedInput('blinds1', data);
        });

        this.hardwareInstance.on('security1', data => {
            this.listenAllReceivedInput('security1', data);
        });

        this.hardwareInstance.on('camera1', data => {
            this.listenAllReceivedInput('camera1', data);
        });

        this.hardwareInstance.on('remote', data => {
            this.listenAllReceivedInput('remote', data);
        });

        this.hardwareInstance.on('thermostat1', data => {
            this.listenAllReceivedInput('thermostat1', data);
        });

        this.hardwareInstance.on('thermostat3', data => {
            this.listenAllReceivedInput('thermostat3', data);
        });

        this.hardwareInstance.on('bbq1', data => {
            this.listenAllReceivedInput('bbq1', data);
        });

        this.hardwareInstance.on('temperaturerain1', data => {
            this.listenAllReceivedInput('temperaturerain1', data);
        });

        this.hardwareInstance.on('temperature1', data => {
            this.listenAllReceivedInput('temperature1', data);
        });

        this.hardwareInstance.on('humidity1', data => {
            this.listenAllReceivedInput('humidity1', data);
        });

        this.hardwareInstance.on('temperaturehumidity1', data => {
            this.listenAllReceivedInput('temperaturehumidity1', data);
        });

        this.hardwareInstance.on('temphumbaro1', data => {
            this.listenAllReceivedInput('temphumbaro1', data);
        });

        this.hardwareInstance.on('rain1', data => {
            this.listenAllReceivedInput('rain1', data);
        });

        this.hardwareInstance.on('wind1', data => {
            this.listenAllReceivedInput('wind1', data);
        });

        this.hardwareInstance.on('uv1', data => {
            this.listenAllReceivedInput('uv1', data);
        });

        this.hardwareInstance.on('datetime', data => {
            this.listenAllReceivedInput('datetime', data);
        });

        this.hardwareInstance.on('elec1', data => {
            this.listenAllReceivedInput('elec1', data);
        });

        this.hardwareInstance.on('elec23', data => {
            this.listenAllReceivedInput('elec23', data);
        });

        this.hardwareInstance.on('elec4', data => {
            this.listenAllReceivedInput('elec4', data);
        });

        this.hardwareInstance.on('elec5', data => {
            this.listenAllReceivedInput('elec5', data);
        });

        this.hardwareInstance.on('weight1', data => {
            this.listenAllReceivedInput('weight1', data);
        });

        this.hardwareInstance.on('cartelectronic', data => {
            this.listenAllReceivedInput('cartelectronic', data);
        });

        this.hardwareInstance.on('rfxsensor', data => {
            this.listenAllReceivedInput('rfxsensor', data);
        });

        this.hardwareInstance.on('rfxmeter', data => {
            this.listenAllReceivedInput('rfxmeter', data);
        });


    }

    // Descriptions from https://github.com/openhab/openhab2-addons/tree/master/addons/binding/org.openhab.binding.rfxcom
    subTypeString(subType) {

        switch (subType) {

            // TEMPERATURE
            case 'temp1':
                return 'THR128/138, THC138';
            case 'temp2':
                return 'THC238/268,THN132,THWR288,THRN122,THN122,AW129/131';
            case 'temp3':
                return 'THWR800';
            case 'temp4':
                return 'RTHN318';
            case 'temp5':
                return 'La Crosse TX2, TX3, TX4, TX17';
            case 'temp6':
                return 'TS15C. UPM temp only';
            case 'temp7':
                return 'Viking 02811, Proove TSS330, 311346';
            case 'temp8':
                return 'La Crosse WS2300';
            case 'temp9':
                return 'Rubicson';
            case 'temp10':
                return ' TFA 30.3133';
            case 'temp11':
                return ' WT0122';

            // TEMPERATURE & HUMIDITY
            case 'temperaturehumidity1-1':
                return 'THGN122/123, THGN132, THGR122/228/238/268';
            case 'temperaturehumidity1-2':
                return 'THGR810, THGN800';
            case 'temperaturehumidity1-3':
                return 'RTGR328';
            case 'temperaturehumidity1-4':
                return 'THGR328';
            case 'temperaturehumidity1-5':
                return 'WTGR800';
            case 'temperaturehumidity1-6':
                return 'THGR918/928, THGRN228, THGN500';
            case 'temperaturehumidity1-7':
                return 'TFA TS34C, Cresta';
            case 'temperaturehumidity1-8':
                return 'WT260, WT260H, WT440H, WT450, WT450H';
            case 'temperaturehumidity1-9':
                return 'Viking 02035, 02038 (02035 has no humidity), Proove TSS320, 311501';
            case 'temperaturehumidity1-10':
                return 'Rubicson';
            case 'temperaturehumidity1-11':
                return 'EW109';
            case 'temperaturehumidity1-12':
                return 'Imagintronix/Opus XT300 Soil sensor';
            case 'temperaturehumidity1-13':
                return 'Alecto WS1700 and compatibles';

            // TEMPERATURE & HUMIDITY & BAROMETER
            case 'temperaturehumidity1-b1':
                return 'BTHR918, BTHGN129';
            case 'temperaturehumidity1-b2':
                return 'BTHR918N, BTHR968';

            default:
                return 'Unknown device';

        }

    }

}

export default DomustoRfxCom;