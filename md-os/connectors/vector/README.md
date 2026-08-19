# Vector connector — beta

Everything required to build and configure the connector is contained in this directory. Private robot data is never stored in the repository.

## Hardware and host

This beta implements the Anki/Digital Dream Labs Vector BLE provisioning and Vector gRPC protocols. The available private profile does not prove whether the tested unit is Vector 1.0 or 2.0; Vector 2.0 compatibility has not yet been independently verified.

The current installer targets Linux with systemd. It requires Node.js/npm, Go 1.22 or newer, Python 3 with `venv`, OpenSSL, `sudo`, Bluetooth, Wi-Fi, and the host `libsodium` runtime library.

## New installation

Put Vector in pairing mode, then run:

```bash
npm run connector:vector:setup -- "Wi-Fi name"
```

The command builds the connector, installs and starts the local service, then privately asks for Vector's six-digit PIN and the Wi-Fi password.

## Update an already configured installation

```bash
npm run connector:vector:install
```

## Verify

```bash
npm run connector:vector:status
```

Expected result: `ok`, `bridge_available`, and `robot_reachable` are `true`.

## What stays private

PINs, Wi-Fi passwords, robot profiles and tokens, generated certificates, audio, camera images, models, caches, and compiled binaries stay under the user's private local directories. They are not committed or published.

## Internal layout

- `bridge/`: Wi-Fi/gRPC, voice, camera, sensors, expressions, and movement;
- `provisioning/`: BLE pairing and Wi-Fi configuration;
- `install.sh`: build and installation;
- `setup.sh`: complete first-time setup.

These are implementation details. Users need only the three commands above.

## Repository boundary

Only connector-specific source, tests, manifests, dependency declarations, and installation logic are stored here. Go packages, Python wheels, the Whisper model, firmware, system packages, compiled binaries, caches, and private runtime data are downloaded or created locally and are never committed to MD-OS.
