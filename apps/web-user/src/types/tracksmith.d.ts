declare module '@lijiaming816/tracksmith' {
  type TrackerInitOptions = {
    appId: string;
    reportUrl: string;
    debug?: boolean;
    batchSize?: number;
  };

  type TrackPayload = Record<string, unknown>;

  interface TracksmithInstance {
    init(options: TrackerInitOptions): void;
    track(eventName: string, params?: TrackPayload): void;
    send(data: unknown): void;
  }

  const tracker: TracksmithInstance;
  export default tracker;
}
