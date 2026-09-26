export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

/**
 * Deliberately tiny: one structured line per event, no dependency. Enough to
 * satisfy the "lightweight instrumentation" stretch goal without pulling in
 * pino/winston for a demo app.
 */
export function createLogger(level: LogLevel): Logger {
  const min = ORDER[level];
  const emit = (lvl: Exclude<LogLevel, 'silent'>, msg: string, fields?: Record<string, unknown>): void => {
    if (ORDER[lvl] < min) return;
    const line = { t: new Date().toISOString(), level: lvl, msg, ...fields };
    const target = lvl === 'error' || lvl === 'warn' ? console.error : console.log;
    target(JSON.stringify(line));
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}
