# vscode-tas-client
vscode-tas-client is a package for querying and storing experiment information from the Treatment Assignment Service (TAS).

## Usage
### Initialization
Get an `IExperimentationService` instance by calling `getExperimentationService(extensionName: string, extensionVersion: string, targetPopulation: TargetPopulation, telemetry: IExperimentationTelemetry, memento: vscode.Memento)`. 

> `extensionName`, `extensionVersion`, and `targetPopulation` are used to set traffic filter values.

> It's recommended that you get `extensionName` and `extensionVersion` from your extension's `package.json`.

`targetPopulation` is the ring the user belongs to - `Team`, `Internal`, `Insiders`, or `Public`. Most extensions determine what group a user belongs to based on a VS Code setting or a settings file. 

`telemetry` is used to send telemetry for [counterfactual logging](https://dev.azure.com/experimentation/Analysis%20and%20Experimentation/_wiki/wikis/AnE.wiki/4228/Demystifying-Counterfactual-Logging) purposes and to attach common properties to all telemetry events, which enables the computation of an experiment scorecard. The extension sends an event `query-expfeature` the first time a given flight or treatment variable is requested and attaches the common properties `vscode.abexp.features` and `abexp.assignmentcontext` to all events.
> note: all the telemetry events sent by the extension and common properties have already been GDPR classified.

`memento` is the VS Code memento storage for your extension, which can be accessed via `context.globalState`, where `context` is the `vscode.ExtensionContext` that VS Code passes your extension on activation. It's used to cache info from the TAS. 

There's also a `getExperimentationServiceAsync` function that behaves identically to `getExperimentationService` except it `await`s the returned `IExperimentationService`'s `initializePromise` before returning. This ensures that cached info from the TAS is loaded. Since this simply involves reading VS Code memento storage, it usually takes <10ms. 

### Use
Once you have an instance of `IExperimentationService` you can call `getTreatmentVariable(configId: string, name: string)` to get the value of a treatment variable. `configId` is always `vscode` and `name` is the name of the treatment variable that you defined in control tower when you set up your experiment.

> note: if you haven't awaited the `IExperimentationService`'s `initializePromise`, or, equivallently, used `getExperimentationServiceAsync` to get the `IExperimentationService` instance, you need to use `getTreatmentVariableAsync`. 

## Details
### Telemetry
vscode-tas-client will handle sending all needed telemetry to analyze your experiment. Specifically, it sends an event `query-expfeature` the first time a given flight or treatment variable is requested (for counterfactual logging purposes) and attaches the common properties `vscode.abexp.features` - a list of treatment variables - and `abexp.assignmentcontext` - a list of flight names - to all telemetry events your extension sends. 

### Background refresh of treatment variables
The vscode-tas-client package makes an HTTP request to the TAS when you first call `getExperimentationService`, and then every 30 minutes after that. The new information from the `TAS` is cached in VS Code memento storage.

### When treatment variables are updated
To avoid changing the user experience mid-session, after requesting the value of a treatment variable, future calls to `getTreatmentVariable` will use the same data that was used to service the first call, unless a call to `getTreatmentVariableAsync` is used, which sends a new request to the TAS and waits on the response.

A few examples to clarify:
- *Your extension calls `getExperimentationServiceAsync` and then immediately after calls `getTreatmentVariable`. Later in the session, you call `getTreatmentVariable` again*. vscode-tas-client will make a request to the TAS as soon as you call `getExperimentationServiceAsync`. However, this request usually takes 1-5s to complete, so the call to `getTreatmentVariable` is made before it does. This means that the `getTreatmentVariable` request will be serviced using cached data from the last request to the TAS. Because this data was used to service the first request, it will also be used to service the second request, even though the HTTP request to the TAS has returned by this time. However, the new data from the TAS isn't thrown away, it's used to update the cache so that the next VS Code session will use the updated data, even with the same sequence of events.
- *Your extension calls `getExperimentationServiceAsync` and then immediately after calls `getTreatmentVariable`. Later in the session, you call `getTreatmentVariableAsync`*. vscode-tas-client will make a request to the TAS as soon as you call `getExperimentationServiceAsync`. However, this request usually takes 1-5s to complete, so the call to `getTreatmentVariable` is made before it does. This means that the `getTreatmentVariable` request will be serviced using cached data from the last request to the TAS. The second request, `getTreatmentVariableAsync` will result in waiting on an HTTP request to the TAS. The updated data will be used to service the request and the cache will be updated. Note this means the user could change flights, or become part of a new flight, mid-session. 
- *Your extension calls `getExperimentationServiceAsync` and then ~1 minute later calls `getTreatmentVariable`*. vscode-tas-client will make a request to the TAS as soon as you call `getExperimentationServiceAsync`. Because this request completes before the call to `getExperimentationService`, the freshly fetched data is used.