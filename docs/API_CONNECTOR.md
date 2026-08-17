# API Connector

The API connector is a bounded HTTP device adapter for MD-OS (Artificial Prefrontal Cortex) v5.0.

It is intentionally small:

- only `GET` and `POST`
- only explicit allowlisted hosts
- fixed request profiles
- timeout and response byte limits
- raw artifact output
- normalized connector snapshots

It does not accept arbitrary URLs from a model or user prompt.

## Files

```text
md-os/os/api_connector.js                    connector implementation
md-os/ops/connectors/api_connector.json      request allowlist
md-os/ops/sources/connectors/                generated snapshots
md-os/ops/artifacts/api/                     raw API artifacts
md-os/ops/journal.ndjson                     connector run events
```

## List Requests

```bash
node md-os/os/api_connector.js list
npm run connector:api:list
cortex connector api list
```

## Run A Request

```bash
node md-os/os/api_connector.js run <project_id> <request_id>
cortex connector api run <project_id> <request_id>
```

The connector writes a snapshot like:

```text
md-os/ops/sources/connectors/<project_id>__api__<request_id>.json
```

## Profile Shape

```json
{
  "schema_version": 1,
  "connector_id": "api_adapter",
  "allowed_hosts": ["api.github.com"],
  "default_timeout_ms": 15000,
  "max_response_bytes": 200000,
  "redact_patterns": ["token=", "api_key=", "secret=", "authorization:"],
  "requests": [
    {
      "request_id": "github_rate_limit",
      "method": "GET",
      "url": "https://api.github.com/rate_limit",
      "summary": "Capture GitHub API rate limit metadata.",
      "priority": "low",
      "tags": ["api", "github"],
      "entities": ["github_api"]
    }
  ]
}
```

## Safety Expectations

- Keep `allowed_hosts` narrow.
- Use fixed request profiles.
- Do not put secrets in static headers.
- Prefer read-only `GET` requests unless mutation is explicitly bounded.
- Treat `POST` request bodies as part of the reviewed connector profile.
- Rebuild project state after a connector emits a snapshot.
