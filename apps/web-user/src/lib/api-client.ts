export type * from "./api/types";
export {
  HttpApiError,
  getApiBaseURL,
  type ApiClientOptions,
} from "./api/http";
export { createApiClient, type ApiClient } from "./api/create-api-client";

import { createApiClient, type ApiClient } from "./api/create-api-client";

let currentApiClient = createApiClient();

export function setApiClient(client: ApiClient) {
  currentApiClient = client;
}

export function getApiClient() {
  return currentApiClient;
}
