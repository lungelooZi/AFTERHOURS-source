export type Email = { to: string; subject: string; text: string };

/**
 * Outgoing email. Development prints to the terminal; a real provider (SMTP or an
 * email API) will implement the same interface without touching the auth code.
 */
export interface Mailer {
  send(email: Email): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  private readonly log: (line: string) => void;

  constructor(log: (line: string) => void = console.log) {
    this.log = log;
  }

  async send(email: Email): Promise<void> {
    this.log(['', '──── email (development: not actually sent) ────', `To: ${email.to}`, `Subject: ${email.subject}`, '', email.text, '────────────────────────────────────────────────', ''].join('\n'));
  }
}

/** Captures emails for tests. */
export class MemoryMailer implements Mailer {
  readonly sent: Email[] = [];

  async send(email: Email): Promise<void> {
    this.sent.push(email);
  }
}
