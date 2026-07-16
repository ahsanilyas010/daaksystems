export interface NotificationProvider {
  /** Human-readable name for logs, e.g. "console", "whatsapp-cloud-api". */
  name: string;
  send(to: string, message: string): Promise<void>;
}
