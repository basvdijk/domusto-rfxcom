# RFXcom

```
plugin:    RfxCom transceiver
author:    Bas van Dijk
category:  radio
version:   0.0.1
website:   http://domusto.com
```

## Features
- [x] Listen/transmit device events
- [x] listen to sensor events

## Hardware needed
- [RFXtrx433E tranceiver](http://www.rfxcom.com/) - € 109.95

## Tested with
 - KaKu / CoCo APA2-2300R (AC protocol)
 - Kaku / CoCo ASUN-650 (AC protocol)
 - Thermometer / Humidity (OREGON protocol)
 - Doorbell (BYRONSX protocol, subtype SELECT_PLUS)

## Installation
```sh
$ ./domusto.js plugin install basvdijk/domusto-rfxcom
```

## Configuration

1. Connect the RFXcom device to an usb port
2. Add the section below to your `config.ts`
3. Set the correct com port where your have connected your RFXcom device
4. Set the protocols you wish to receive data for
5. Restart DOMUSTO

```js
    enabled: true,
    debug: false,
    type: 'RFXCOM',
    settings: {
        port: '/dev/ttyUSB-RFX433',
        listenOnly: false,
        enabledProtocols: [
            'AC',       // KaKu
            'BYRONSX',  // Doorbell
            'RUBICSON'  // Temp + Humid
        ]
    }
```

## ListenOnly
When you enable `listenOnly` the plugin listens to all possible events for the enabled protocols. When new data is received, this data is shown in the terminal.

## Procols supported (not tested):
- AC
- ARC
- ATI
- BLINDST14
- BLYSS
- BYRONSX
- FINEOFFSET
- FS20
- HIDEKI
- HOMEEASY
- LACROSSE
- LIGHTING4
- LIGHTWAVERF
- MEIANTECH
- MERTIK
- OREGON
- PROGUARD
- RFU6
- ROLLERTROL
- RSL
- RUBICSON
- VISONIC
- X10

## Example devices

```js

// Temperature / humidity sensor
{
    id: 'TEMP1',
    enabled: true,
    role: 'input',
    name: 'Living room',
    type: 'temperature',
    subType: 'temperature-humidity',
    plugin: {
        id: 'RFXCOM',
        deviceId: 'temperaturehumidity1/TH13-0x2303',
    }
}

// Blinds
{
    id: 'KAKU8',
    screens: ['test'],
    enabled: false,
    role: 'output',
    name: 'blinds',
    type: 'switch',
    subType: 'up/down',
    plugin: {
        id: 'RFXCOM',
        deviceId: 'lighting2/AC-0x01034500/1'
    }
}

// Chime with triggers to SHELL and PUSHBULLET plugin
{
    id: 'CHIME1',
    screens: ['test'],
    enabled: true,
    role: 'output',
    name: 'doorbell',
    type: 'switch',
    subType: 'momentary',
    plugin: {
        id: 'RFXCOM',
        deviceId: 'chime1/SELECT_PLUS-0x00123EF',
    },
    triggers: [
        {
            listenToEvents: ['trigger'],
            pluginId: 'SHELL',
            deviceId: 'shell',
            data: {
                shellCommand: 'aplay build/assets/audio/doorbell.wav'
            }
        },
        {
            listenToEvents: ['trigger'],
            pluginId: 'PUSHBULLET',
            deviceId: 'note',
            data: {
                title: 'Doorbell',
                message: 'Ding Dong!'
            }
        },
    ],
},
```