# tas-client

## Purpose

This package is intended to be used as an endpoint client to query, refetch, and cache data from the Experimentation service (or any given endpoint). The endpoint result must follow the required structure for experimentation data.

## Installation

```bash
npm install tas-client
```

## Module Formats

This package is distributed in both ESM and CommonJS formats:

- **ESM (ES Modules)**: Import using `import` syntax
- **CommonJS**: Require using `require()` syntax

The package automatically provides the correct format based on your environment.

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

## Building

To build the package:

```bash
npm run build
```

This will:
1. Compile TypeScript to JavaScript (`npm run compile`)
2. Bundle the code into both ESM and CommonJS formats (`npm run bundle`)



