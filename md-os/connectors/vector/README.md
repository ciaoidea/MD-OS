# Vector connector — beta

Everything required to build and configure the connector is contained in this directory. Private robot data is never stored in the repository.

## Compatibility and non-affiliation

Vector and Anki are referenced solely to identify compatible hardware and
interfaces. MD-OS is an independent project and is not affiliated with,
endorsed by, or sponsored by Anki or Digital Dream Labs. All product names and
trademarks belong to their respective owners.

The repository does not distribute robot firmware, vendor media assets,
vendor credentials, proprietary cloud services, or private device data. It
contains connector source code plus dependency declarations for separately
downloaded open-source packages. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for the applicable attributions and license notices.

## Hardware and host

This beta is compatible with the legacy BLE provisioning and gRPC interfaces
used by Vector robots. The available private profile does not establish the
tested hardware generation; compatibility with Vector 2.0 has not been
independently verified.

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
