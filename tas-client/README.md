# tas-client

## Purpose

This package is intended to be used as an endpoint client to query, refetch, and cache data from the Experimentation service (or any given endpoint). The endpoint result must follow the required structure for experimentation data.

## Development

### Building

- `npm run compile` - Compile TypeScript to JavaScript
- `npm run bundle` - Bundle the package into a single file (output: `out/bundle/tas-client.js`)
- `npm run watch` - Watch mode for TypeScript compilation
- `npm test` - Run tests

### Testing

Run `npm test` from `tas-client` after `npm ci`. `npm run compile` also type-checks
the tests.

Tests cover cache initialization and session consistency, concurrent refreshes, provider
merging and failures, both endpoint protocols, telemetry, and polling/disposal. They use
fake timers and explicitly resolved promises instead of wall-clock sleeps. Unexpected
network requests fail the suite, even if a provider catches the transport error. HTTP
integration tests allow only an ephemeral loopback server and close all connections
afterward; no tests contact TAS.

Reusable, typed doubles live in [test/mocks](test/mocks):

- `Deferred` controls when storage or transport operations complete.
- Feature-provider, fetch, and HTTP doubles support queued responses and failures.
- Storage and telemetry doubles record calls and snapshot telemetry properties.
- `NodeHttpMock` models request/response events, including chunked bodies and stream errors.

Each test creates its own state and restores mocks, timers, and globals. To check order
independence with a reproducible seed, run
`npm test -- --sequence.shuffle --sequence.seed=17`.

## Usage

First, your client should implement an `IExperimentationFilterProvider`, `IExperimentationTelemetry`, and `IKeyValueStorage`.


Next, they can be used in the `TASClient` constructor:

```javascript
const tasClient = new TASClient({
			filterProviders: [filterProvider],
			telemetry: telemetry,
			storageKey: storageKey,
			keyValueStorage: keyValueStorage,
			assignmentContextTelemetryPropertyName: '<assignmentContextTelemetryPropertyName>',
			telemetryEventName: '<telemetryEventName>',
			endpoint: '<tas-endpoint>',
			refetchInterval: refetchInterval,
		});
```

The client provides a variety of functions, but the most basic is `getTreatmentVariable(configId: string, name: string)`.
Once you have an instance of `IExperimentationService` you can call `getTreatmentVariable` to get the value of a treatment variable.

> NOTE: If you haven't awaited the `IExperimentationService`'s `initializePromise`, you need to use `getTreatmentVariableAsync`.

### Cache and refresh behavior

- `initializePromise` waits for storage to load; `initialFetch` waits for the first
  endpoint fetch to finish, even if that fetch fails.
- A synchronous lookup pins the current assignments for the session. Background
  refreshes still update storage for the next session, without changing assignments
  already in use.
- `getTreatmentVariableAsync(configId, name)` explicitly refreshes in-memory assignments.
  If a background request is already running, it shares that request and uses its new
  result rather than returning the old session value.
- Passing `true` as the third argument checks the cache after initialization and avoids
  a request on a cache hit, including `false`, `0`, and empty-string values. Cache misses
  fetch before reporting the query's assignment context to telemetry.
- If all providers fail, the last good assignments remain available. A successful empty
  response, unlike a failure, clears assignments that are no longer active.
- Without `keyValueStorage`, the client uses per-instance memory storage. Supply persistent
  storage to reuse assignments across sessions.
- Call `dispose()` when finished. It stops polling, including when an in-flight manual
  refresh finishes after disposal.

### 0.4.3


## Custom transport (`fetch`)

By default the client issues requests with its built-in HTTP client. To route requests through your own networking stack (for example to add proxy support, retries, or a custom user-agent), provide a `fetch` function in the config. It is used for both the legacy `endpoint` (GET) and the optional `assignmentsEndpoint` (POST):

```javascript
const tasClient = new TASClient({
    // ...existing options...
    endpoint: '<tas-endpoint>',
    assignmentsEndpoint: '<assignments-endpoint>', // optional
    extensionName: '<caller-name>',                // optional; attached to `tas-call` telemetry
    fetch: async (url, init) => {
        // init.method is 'GET' (legacy) or 'POST' (assignments); init.body is set for POST.
        const res = await myHttp(url, { method: init.method, headers: init.headers, body: init.body });
        return { status: res.status, json: () => res.json() };
    },
});
```

A per-endpoint `assignmentsFetch` still overrides `fetch` for the assignments request. The deprecated `AssignmentsFetchFn` / `IAssignmentsFetchResponse` types remain as aliases of `FetchFn` / `IFetchResponse`.

## Telemetry: `tas-call`

Each TAS call emits a uniform `tas-call` event so callers can confirm calls are being made and are succeeding:

| Property | Description |
| --- | --- |
| `callType` | `legacy` or `assignments` |
| `outcome` | `Success`, `ServerError`, `NoResponse`, or `GenericError` |
| `extensionName` | The caller name provided via config |
| `assignmentContext` | The assignment context returned by that call |
