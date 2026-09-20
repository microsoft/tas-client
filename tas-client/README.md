# tas-client

## Purpose

This package is intended to be used as an endpoint client to query, refetch, and cache data from the Experimentation service (or any given endpoint). The endpoint result must follow the required structure for experimentation data.

## Development

### Building

- `npm run compile` - Compile TypeScript to JavaScript
- `npm run bundle` - Bundle the package into a single file (output: `out/bundle/tas-client.js`)
- `npm run watch` - Watch mode for TypeScript compilation
- `npm test` - Run tests

For a local consumer linked with a `file:` dependency, run `npm run compile` and
`npm run bundle` after client changes; consumers load the generated `dist` package.
Before shipping, publish the client and replace local `file:` dependencies with that
published version and regenerated lockfiles.

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

## Deferred assignment context

Assignments are included in shared telemetry immediately by default. To measure exposure rather
than targeting for selected experiments, declare their **feature flags** when
constructing the client, before either cached or fetched assignments can be published:

```typescript
const client = new ExperimentationService({
    // ...existing options...
    deferredAssignmentContexts: [{ configId: 'vscode', name: 'blueButton' }],
});

const treatment = await client.getTreatmentVariableWithExposureAsync<boolean>(
    'vscode', 'blueButton', true,
);

// At the same eligibility point in BOTH arms, including control:
if (buttonWouldBeRendered) {
    treatment.release();
    renderButton(treatment.value === true ? 'blue' : 'default');
}
```

Each arm must supply both ordinary treatment variables:

| Variable | Treatment example | Control example |
| --- | --- | --- |
| `blueButton` | `true` | `false` |
| `blueButton.contextId` | `"blue-button-treatment"` | `"blue-button-control"` |

The companion contains only the **exact variant name**, not the generated `:allocationId`.
If TAS returns `blue-button-treatment:12345`, the client matches the name exactly and captures
that complete entry. The host does not read the companion or parse assignment strings.
This is a treatment-variable naming convention, not a backend API change.

- Boolean, string, and number values are supported, including `false`, `""`, and `0`.
  An absent feature returns `value: undefined` and a release that returns `false`.
- Existing value-only methods are unchanged. Neither those reads nor exposure-aware reads
  release context. For synchronous reads, await `initializePromise` before calling
  `getTreatmentVariableWithExposure`.
- `release()` is synchronous and idempotent, so the very next application telemetry event can
  include the assignment. It is bound to the exact assignment captured when the response was
  read, not whatever treatment happens to be current when release is called.
- A captured response cannot release a new allocation or a different arm after refresh.
  Retired assignments return `false`; releasing after disposal throws.
- A present feature without a valid, matching string companion throws on exposure-aware read.
  Its provider's context is conservatively withheld because the client cannot identify the
  intended assignment safely. Supply the companion in **every arm before enabling deferral**.
- Release persists exact `variant:allocation` entries under
  `<storageKey>.ReleasedAssignmentContexts` using the supplied `IKeyValueStorage`. Reloading a
  client restores those releases before publishing context. A new arm or allocation requires
  another release; no context is synthesized for missing or stopped assignments.
- Both endpoints and cached assignments obey the gate. Provider provenance is retained, keeping
  a feature value paired with its own provider's companion and allocation even after merging.
  A shadowed assignment is not released, including when two providers use the same variant name.
- The response's optional `contextId` is diagnostic metadata without an allocation suffix. It is
  not needed to release; it also allows hosts to migrate previously recorded variant-only exposure.
- A cache written before these variables were configured is discarded once because it cannot
  reliably identify assignments hidden by provider merging. Async treatment reads fetch fresh
  data; subsequent starts can use the annotated cache, including offline.
- Removing the opt-in restores ordinary eager publication. Raw contexts on TAS diagnostic
  events (`tas-call` and `assignments-validation`) remain diagnostic response data; this option
  governs the **shared assignment-context property** attached to application telemetry.


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
