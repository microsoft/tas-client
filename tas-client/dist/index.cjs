"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// out/src/index.js
var index_exports = {};
__export(index_exports, {
  ExperimentationService: () => ExperimentationService
});
module.exports = __toCommonJS(index_exports);

// out/src/tas-client/FeatureProvider/BaseFeatureProvider.js
var BaseFeatureProvider = class {
  telemetry;
  fetchPromise;
  isFetching = false;
  /**
   * @param telemetry The telemetry implementation.
   */
  constructor(telemetry) {
    this.telemetry = telemetry;
  }
  /**
   * Method that wraps the fetch method in order to re-use the fetch promise if needed.
   * @param headers The headers to be used on the fetch method.
   */
  async getFeatures() {
    if (this.isFetching && this.fetchPromise) {
      return this.fetchPromise;
    }
    this.fetchPromise = this.fetch();
    let features = await this.fetchPromise;
    this.isFetching = false;
    this.fetchPromise = void 0;
    return features;
  }
};

// out/src/tas-client/FeatureProvider/FilteredFeatureProvider.js
var FilteredFeatureProvider = class extends BaseFeatureProvider {
  telemetry;
  filterProviders;
  constructor(telemetry, filterProviders) {
    super(telemetry);
    this.telemetry = telemetry;
    this.filterProviders = filterProviders;
  }
  cachedTelemetryEvents = [];
  getFilters() {
    let filters = /* @__PURE__ */ new Map();
    for (let filter of this.filterProviders) {
      let filterHeaders = filter.getFilters();
      for (let key of filterHeaders.keys()) {
        let filterValue = filterHeaders.get(key);
        filters.set(key, filterValue);
      }
    }
    return filters;
  }
  PostEventToTelemetry(headers) {
    if (this.cachedTelemetryEvents.includes(headers)) {
      return;
    }
    const jsonHeaders = JSON.stringify(headers);
    this.telemetry.postEvent("report-headers", /* @__PURE__ */ new Map([["ABExp.headers", jsonHeaders]]));
    this.cachedTelemetryEvents.push(headers);
  }
};

// out/src/tas-client/FeatureProvider/TasApiFeatureProvider.js
var TASAPI_FETCHERROR_EVENTNAME = "call-tas-error";
var ERROR_TYPE = "ErrorType";
var TasApiFeatureProvider = class extends FilteredFeatureProvider {
  httpClient;
  telemetry;
  filterProviders;
  constructor(httpClient, telemetry, filterProviders) {
    super(telemetry, filterProviders);
    this.httpClient = httpClient;
    this.telemetry = telemetry;
    this.filterProviders = filterProviders;
  }
  /**
   * Method that handles fetching of latest data (in this case, flights) from the provider.
   */
  async fetch() {
    let filters = this.getFilters();
    let headers = {};
    for (let key of filters.keys()) {
      const filterValue = filters.get(key);
      headers[key] = filterValue;
    }
    let response;
    try {
      response = await this.httpClient.get({ headers });
    } catch (error) {
      const fetchError = error;
      const properties = /* @__PURE__ */ new Map();
      if (fetchError.responseReceived && !fetchError.responseOk) {
        properties.set(ERROR_TYPE, "ServerError");
      } else if (fetchError.responseReceived === false) {
        properties.set(ERROR_TYPE, "NoResponse");
      } else {
        properties.set(ERROR_TYPE, "GenericError");
      }
      this.telemetry.postEvent(TASAPI_FETCHERROR_EVENTNAME, properties);
    }
    if (!response) {
      throw Error(TASAPI_FETCHERROR_EVENTNAME);
    }
    if (filters.keys.length > 0) {
      this.PostEventToTelemetry(headers);
    }
    const responseData = response.data;
    let configs = responseData.Configs;
    let features = [];
    for (let c of configs) {
      if (!c.Parameters) {
        continue;
      }
      for (let key of Object.keys(c.Parameters)) {
        const featureName = key + (c.Parameters[key] ? "" : "cf");
        if (!features.includes(featureName)) {
          features.push(featureName);
        }
      }
    }
    return {
      features,
      assignmentContext: responseData.AssignmentContext,
      configs
    };
  }
};

// out/src/tas-client/Util/HttpClient.js
var FetchError = class extends Error {
  responseReceived;
  responseOk;
  constructor(message, responseReceived, responseOk) {
    super(message);
    this.responseReceived = responseReceived;
    this.responseOk = responseOk;
  }
};
var HttpClient = class {
  endpoint;
  useNodeModules;
  constructor(endpoint, useNodeModules = typeof process !== "undefined" && !!process.versions.node) {
    this.endpoint = endpoint;
    this.useNodeModules = useNodeModules;
  }
  async get(config) {
    if (this.useNodeModules) {
      return this.nodeGet(config);
    } else {
      return this.webGet(config);
    }
  }
  async nodeGet(config) {
    const http = await import("http");
    const https = await import("https");
    return new Promise((resolve, reject) => {
      const req = (this.endpoint.startsWith("http:") ? http : https).get(this.endpoint, config || {}, (res) => {
        if (res.statusCode < 200 || res.statusCode > 299) {
          reject(new FetchError("Response not ok", true, false));
        } else {
          res.on("error", reject);
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString());
              if (!data) {
                reject(new FetchError("No data received", false));
              } else {
                resolve({ data });
              }
            } catch (err) {
              reject(err);
            }
          });
        }
      });
      req.on("error", reject);
      req.end();
    });
  }
  async webGet(config) {
    const response = await fetch(this.endpoint, {
      method: "GET",
      headers: config?.headers
    });
    if (!response) {
      throw new FetchError("No response received", false);
    }
    if (!response.ok) {
      throw new FetchError("Response not ok", true, false);
    }
    const data = await response.json();
    if (!data) {
      throw new FetchError("No data received", false);
    }
    return { data };
  }
};

// out/src/tas-client/Util/MemoryKeyValueStorage.js
var MemoryKeyValueStorage = class {
  storage = /* @__PURE__ */ new Map();
  async getValue(key, defaultValue) {
    if (this.storage.has(key)) {
      return await Promise.resolve(this.storage.get(key));
    }
    return await Promise.resolve(defaultValue || void 0);
  }
  setValue(key, value) {
    this.storage.set(key, value);
  }
};

// out/src/tas-client/ExperimentationServiceBase.js
var ExperimentationServiceBase = class {
  telemetry;
  assignmentContextTelemetryPropertyName;
  telemetryEventName;
  storageKey;
  storage;
  featureProviders;
  fetchPromise;
  featuresConsumed = false;
  loadCachePromise;
  initializePromise;
  resolveInitialFetchPromise;
  initialFetch;
  cachedTelemetryEvents = [];
  _features = {
    features: [],
    assignmentContext: "",
    configs: []
  };
  get features() {
    return this._features;
  }
  set features(value) {
    this._features = value;
    if (this.telemetry) {
      this.telemetry.setSharedProperty(this.assignmentContextTelemetryPropertyName, this.features.assignmentContext);
    }
  }
  constructor(telemetry, assignmentContextTelemetryPropertyName, telemetryEventName, storageKey, storage) {
    this.telemetry = telemetry;
    this.assignmentContextTelemetryPropertyName = assignmentContextTelemetryPropertyName;
    this.telemetryEventName = telemetryEventName;
    this.storageKey = storageKey;
    this.storage = storage;
    if (!this.storageKey) {
      this.storageKey = "ABExp.Features";
    }
    if (!this.storage) {
      storage = new MemoryKeyValueStorage();
    }
    this.loadCachePromise = this.loadCachedFeatureData();
    this.initializePromise = this.loadCachePromise;
    this.initialFetch = new Promise((resolve, reject) => {
      this.resolveInitialFetchPromise = resolve;
    });
  }
  /**
   * Gets all the features from the provider sources (not cache).
   * It returns these features and will also update the providers to have the latest features cached.
   */
  async getFeaturesAsync(overrideInMemoryFeatures = false) {
    if (this.fetchPromise != null) {
      try {
        await this.fetchPromise;
      } catch {
      }
      return this.features;
    }
    if (!this.featureProviders || this.featureProviders.length === 0) {
      return Promise.resolve({
        features: [],
        assignmentContext: "",
        configs: []
      });
    }
    try {
      this.fetchPromise = Promise.all(this.featureProviders.map(async (provider) => {
        return await provider.getFeatures();
      }));
      const featureResults = await this.fetchPromise;
      this.updateFeatures(featureResults, overrideInMemoryFeatures);
    } catch {
    }
    this.fetchPromise = void 0;
    if (this.resolveInitialFetchPromise) {
      this.resolveInitialFetchPromise();
      this.resolveInitialFetchPromise = void 0;
    }
    return this.features;
  }
  /**
   *
   * @param featureResults The feature results obtained from all the feature providers.
   */
  updateFeatures(featureResults, overrideInMemoryFeatures = false) {
    let features = {
      features: [],
      assignmentContext: "",
      configs: []
    };
    for (let result of featureResults) {
      for (let feature of result.features) {
        if (!features.features.includes(feature)) {
          features.features.push(feature);
        }
      }
      for (let config of result.configs) {
        const existingConfig = features.configs.find((c) => c.Id === config.Id);
        if (existingConfig) {
          existingConfig.Parameters = {
            ...existingConfig.Parameters,
            ...config.Parameters
          };
        } else {
          features.configs.push(config);
        }
      }
      features.assignmentContext += result.assignmentContext;
    }
    if (overrideInMemoryFeatures || !this.featuresConsumed) {
      this.features = features;
    }
    if (this.storage) {
      this.storage.setValue(this.storageKey, features);
    }
  }
  async loadCachedFeatureData() {
    let cachedFeatureData;
    if (this.storage) {
      cachedFeatureData = await this.storage.getValue(this.storageKey);
      if (cachedFeatureData !== void 0 && cachedFeatureData.configs === void 0) {
        cachedFeatureData.configs = [];
      }
    }
    if (this.features.features.length === 0) {
      this.features = cachedFeatureData || {
        features: [],
        assignmentContext: "",
        configs: []
      };
    }
  }
  /**
   * Returns a value indicating whether the given flight is enabled.
   * It uses the in-memory cache.
   * @param flight The flight to check.
   */
  isFlightEnabled(flight) {
    this.featuresConsumed = true;
    this.PostEventToTelemetry(flight);
    return this.features.features.includes(flight);
  }
  /**
   * Returns a value indicating whether the given flight is enabled.
   * It uses the values currently on cache.
   * @param flight The flight to check.
   */
  async isCachedFlightEnabled(flight) {
    await this.loadCachePromise;
    this.featuresConsumed = true;
    this.PostEventToTelemetry(flight);
    return this.features.features.includes(flight);
  }
  /**
   * Returns a value indicating whether the given flight is enabled.
   * It re-fetches values from the server.
   * @param flight the flight to check.
   */
  async isFlightEnabledAsync(flight) {
    const features = await this.getFeaturesAsync(true);
    this.featuresConsumed = true;
    this.PostEventToTelemetry(flight);
    return features.features.includes(flight);
  }
  /**
   * Returns the value of the treatment variable, or undefined if not found.
   * It uses the values currently in memory, so the experimentation service
   * must be initialized before calling.
   * @param config name of the config to check.
   * @param name name of the treatment variable.
   */
  getTreatmentVariable(configId, name) {
    this.featuresConsumed = true;
    this.PostEventToTelemetry(`${configId}.${name}`);
    const config = this.features.configs.find((c) => c.Id === configId);
    return config?.Parameters[name];
  }
  /**
   * Returns the value of the treatment variable, or undefined if not found.
   * It re-fetches values from the server. If checkCache is set to true and the value exists
   * in the cache, the Treatment Assignment Service is not called.
   * @param config name of the config to check.
   * @param name name of the treatment variable.
   * @param checkCache check the cache for the variable before calling the TAS.
   */
  async getTreatmentVariableAsync(configId, name, checkCache) {
    if (checkCache) {
      const _featuresConsumed = this.featuresConsumed;
      const cachedValue = this.getTreatmentVariable(configId, name);
      if (cachedValue === void 0) {
        this.featuresConsumed = _featuresConsumed;
      } else {
        return cachedValue;
      }
    }
    await this.getFeaturesAsync(true);
    return this.getTreatmentVariable(configId, name);
  }
  PostEventToTelemetry(flight) {
    if (this.cachedTelemetryEvents.includes(flight)) {
      return;
    }
    this.telemetry.postEvent(this.telemetryEventName, /* @__PURE__ */ new Map([["ABExp.queriedFeature", flight]]));
    this.cachedTelemetryEvents.push(flight);
  }
  invokeInit() {
    this.init();
  }
  addFeatureProvider(...providers) {
    if (providers == null || this.featureProviders == null) {
      return;
    }
    for (let provider of providers) {
      this.featureProviders.push(provider);
    }
  }
};

// out/src/tas-client/Util/PollingService.js
var PollingService = class {
  fetchInterval;
  intervalHandle;
  onTick;
  constructor(fetchInterval) {
    this.fetchInterval = fetchInterval;
  }
  StopPolling() {
    clearInterval(this.intervalHandle);
    this.intervalHandle = void 0;
  }
  OnPollTick(callback) {
    this.onTick = callback;
  }
  StartPolling(pollImmediately = false) {
    if (this.intervalHandle) {
      this.StopPolling();
    }
    if (this.onTick == null) {
      return;
    }
    if (pollImmediately) {
      this.onTick().then(() => {
        return;
      }).catch(() => {
        return;
      });
    }
    this.intervalHandle = setInterval(async () => {
      await this.onTick();
    }, this.fetchInterval);
    if (this.intervalHandle.unref) {
      this.intervalHandle.unref();
    }
  }
};

// out/src/tas-client/ExperimentationServiceAutoPolling.js
var ExperimentationServiceAutoPolling = class extends ExperimentationServiceBase {
  telemetry;
  filterProviders;
  refreshRateMs;
  assignmentContextTelemetryPropertyName;
  telemetryEventName;
  storageKey;
  storage;
  pollingService;
  constructor(telemetry, filterProviders, refreshRateMs, assignmentContextTelemetryPropertyName, telemetryEventName, storageKey, storage) {
    super(telemetry, assignmentContextTelemetryPropertyName, telemetryEventName, storageKey, storage);
    this.telemetry = telemetry;
    this.filterProviders = filterProviders;
    this.refreshRateMs = refreshRateMs;
    this.assignmentContextTelemetryPropertyName = assignmentContextTelemetryPropertyName;
    this.telemetryEventName = telemetryEventName;
    this.storageKey = storageKey;
    this.storage = storage;
    if (refreshRateMs < 1e3 && refreshRateMs !== 0) {
      throw new Error("The minimum refresh rate for polling is 1000 ms (1 second). If you wish to deactivate this auto-polling use value of 0.");
    }
    if (refreshRateMs > 0) {
      this.pollingService = new PollingService(refreshRateMs);
      this.pollingService.OnPollTick(async () => {
        await super.getFeaturesAsync();
      });
    }
  }
  init() {
    if (this.pollingService) {
      this.pollingService.StartPolling(true);
    } else {
      super.getFeaturesAsync();
    }
  }
  /**
   * Wrapper that will reset the polling intervals whenever the feature data is fetched manually.
   */
  async getFeaturesAsync(overrideInMemoryFeatures = false) {
    if (!this.pollingService) {
      return await super.getFeaturesAsync(overrideInMemoryFeatures);
    } else {
      this.pollingService.StopPolling();
      let result = await super.getFeaturesAsync(overrideInMemoryFeatures);
      this.pollingService.StartPolling();
      return result;
    }
  }
};

// out/src/tas-client/ExperimentationService.js
var ExperimentationService = class extends ExperimentationServiceAutoPolling {
  options;
  static REFRESH_RATE_IN_MINUTES = 30;
  constructor(options) {
    super(
      options.telemetry,
      options.filterProviders || [],
      // Defaulted to empty array.
      options.refetchInterval != null ? options.refetchInterval : (
        // If no fetch interval is provided, refetch functionality is turned off.
        0
      ),
      options.assignmentContextTelemetryPropertyName,
      options.telemetryEventName,
      options.storageKey,
      options.keyValueStorage
    );
    this.options = options;
    this.invokeInit();
  }
  init() {
    this.featureProviders = [];
    this.addFeatureProvider(new TasApiFeatureProvider(new HttpClient(this.options.endpoint), this.telemetry, this.filterProviders));
    super.init();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ExperimentationService
});
//# sourceMappingURL=index.cjs.map
