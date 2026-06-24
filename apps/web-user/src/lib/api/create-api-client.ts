import {
  createRequest,
  getApiBaseURL,
  type ApiClientOptions,
} from "./http";
import { createAuthApi, type AuthApi } from "./modules/auth.api";
import { createMeApi, type MeApi } from "./modules/me.api";
import {
  createNotificationsApi,
  type NotificationsApi,
} from "./modules/notifications.api";
import { createPlansApi, type PlansApi } from "./modules/plans.api";
import { createTemplatesApi, type TemplatesApi } from "./modules/templates.api";

export type ApiClient = AuthApi &
  MeApi &
  NotificationsApi &
  PlansApi &
  TemplatesApi;

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseURL = options.baseURL ?? getApiBaseURL();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const request = createRequest({ baseURL, fetchImpl });

  return {
    ...createAuthApi(request),
    ...createMeApi(request),
    ...createNotificationsApi(request),
    ...createPlansApi(request, { baseURL, fetchImpl }),
    ...createTemplatesApi(request),
  };
}
