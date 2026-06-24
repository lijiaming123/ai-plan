import type { RequestFn } from "../http";
import type {
  InAppNotificationItem,
  NotificationPreferences,
} from "../types/notifications.types";

export type NotificationsApi = {
  listNotifications(input: {
    token: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: InAppNotificationItem[]; nextCursor: string | null }>;
  getNotificationsUnreadCount(input: {
    token: string;
  }): Promise<{ unreadCount: number }>;
  patchNotificationRead(input: { token: string; id: string }): Promise<{ ok: true }>;
  postNotificationsReadAll(input: { token: string }): Promise<{ ok: true }>;
  getNotificationPreferences(input: {
    token: string;
  }): Promise<NotificationPreferences>;
  patchNotificationPreferences(input: {
    token: string;
    remindAt?: string;
    timeZone?: string;
  }): Promise<NotificationPreferences>;
};

export function createNotificationsApi(request: RequestFn): NotificationsApi {
  return {
    listNotifications(input) {
      const p = new URLSearchParams();
      if (input.limit != null) p.set("limit", String(input.limit));
      if (input.cursor) p.set("cursor", input.cursor);
      const q = p.toString();
      return request<{
        items: InAppNotificationItem[];
        nextCursor: string | null;
      }>(`/notifications${q ? `?${q}` : ""}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getNotificationsUnreadCount(input) {
      return request<{ unreadCount: number }>("/notifications/unread-count", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchNotificationRead(input) {
      return request<{ ok: true }>(
        `/notifications/${encodeURIComponent(input.id)}/read`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        },
      );
    },
    postNotificationsReadAll(input) {
      return request<{ ok: true }>("/notifications/read-all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getNotificationPreferences(input) {
      return request<NotificationPreferences>("/me/notification-preferences", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchNotificationPreferences(input) {
      return request<NotificationPreferences>("/me/notification-preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          remindAt: input.remindAt,
          timeZone: input.timeZone,
        }),
      });
    },
  };
}
