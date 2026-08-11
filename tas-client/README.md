# tas-client

## Purpose

This package is intended to be used as an endpoint client to query, refetch, and cache data from the Experimentation service (or any given endpoint). The endpoint result must follow the required structure for experimentation data.

## Development

### Building

- `npm run compile` - Compile TypeScript to JavaScript
- `npm run bundle` - Bundle the package into a single file (output: `out/bundle/tas-client.js`)
- `npm run watch` - Watch mode for TypeScript compilation
- `npm test` - Run tests

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
