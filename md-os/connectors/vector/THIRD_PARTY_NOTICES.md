# Third-party notices

This connector is an independent MD-OS compatibility component. Vector and
Anki are referenced solely to identify compatible hardware and interfaces.
MD-OS is not affiliated with, endorsed by, or sponsored by Anki or Digital
Dream Labs. Product names and trademarks belong to their respective owners.

No robot firmware, vendor media assets, vendor credentials, proprietary cloud
service, or private device data is distributed in this directory. The Go
modules below are resolved from their upstream repositories during a local
build and are not vendored here.

## Open-source dependencies

- `github.com/digital-dream-labs/api` — MIT License; Copyright (c) 2021
  Digital Dream Labs.
- `github.com/digital-dream-labs/vector-bluetooth` — MIT License; Copyright
  (c) 2021 Digital Dream Labs.
- `github.com/fforchino/vector-go-sdk` — MIT License; Copyright (c) 2020
  Digital Dream Labs.
- The public Wire-Pod project was consulted as an open-source interoperability
  reference — MIT License; Copyright (c) 2022 Kerigan Creighton. Wire-Pod code
  is not bundled as a dependency in this connector.

The dependency versions and transitive module graph are pinned in the two
`go.mod` and `go.sum` pairs under `bridge/` and `provisioning/`.

## MIT License

Copyright (c) 2021 Digital Dream Labs

Copyright (c) 2020 Digital Dream Labs

Copyright (c) 2022 Kerigan Creighton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
