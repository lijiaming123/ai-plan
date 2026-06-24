export type InAppNotificationItem = {
  id: string;
  userId: string;
  type: string;
  planId: string;
  slotKey: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferences = {
  timeZone: string;
  remindAt: string;
  pendingRemindAt: string | null;
  switchAt: string | null;
};
