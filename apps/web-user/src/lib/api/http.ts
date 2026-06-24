import {
  formatApiErrorForUser,
  formatHttpApiUserMessage,
} from "../api-error-message";

export type ApiClientOptions = {
  baseURL?: string;
  fetchImpl?: typeof fetch;
};

/** 非 2xx 时携带 HTTP 状态与原始 JSON body（如打卡 422 的 review） */
export class HttpApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HttpApiError";
    this.status = status;
    this.body = body;
  }
}

export function joinUrl(baseURL: string, path: string) {
  const normalizedBase = baseURL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function readHttpErrorPayload(response: Response): Promise<{
  message: string;
  body: unknown;
}> {
  try {
    const payload = await response.json();
    const message =
      payload && typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as { message?: unknown }).message ?? "")
        : typeof payload === "string"
          ? payload
          : JSON.stringify(payload);
    return { message, body: payload };
  } catch {
    try {
      const text = (await response.text()) || "";
      return { message: text, body: undefined };
    } catch {
      return { message: "", body: undefined };
    }
  }
}

/** 与 createApiClient 默认行为一致（去掉末尾 `/`），供流式 fetch 等与 JSON API 共用同一基址 */
export function getApiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  return raw.replace(/\/$/, "");
}

export type RequestFn = <T>(path: string, init: RequestInit) => Promise<T>;

export type CreateRequestOptions = {
  baseURL: string;
  fetchImpl: typeof fetch;
};

export function createRequest(options: CreateRequestOptions): RequestFn {
  const { baseURL, fetchImpl } = options;

  return async function request<T>(path: string, init: RequestInit) {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    let response: Response;
    try {
      response = await fetchImpl(joinUrl(baseURL, path), {
        headers,
        ...init,
      });
    } catch (e) {
      throw new Error(formatApiErrorForUser(e));
    }

    if (!response.ok) {
      const { message, body } = await readHttpErrorPayload(response);
      throw new HttpApiError(
        formatHttpApiUserMessage(response.status, message),
        response.status,
        body,
      );
    }

    return (await response.json()) as T;
  };
}
