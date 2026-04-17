/**
 * Simple structured logger utility
 * 
 * Provides consistent logging with timestamps and levels.
 * Can be extended to support different transports (files, external services, etc.)
 */

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}

class Logger {
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatLog(entry: LogEntry): string {
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${dataStr}`;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      timestamp: this.formatTimestamp(),
      message,
      data,
    };

    const formattedLog = this.formatLog(entry);

    if (level === 'error') {
      console.error(formattedLog);
    } else if (level === 'warn') {
      console.warn(formattedLog);
    } else {
      console.log(formattedLog);
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }
}

// Export singleton instance
export const logger = new Logger();
