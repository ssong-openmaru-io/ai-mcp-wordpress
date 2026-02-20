type LogLevel = "info" | "warn" | "error" | "debug";

const PREFIX = "[wordpress-mcp]";

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(msg: string, ...args: unknown[]) {
    log("info", msg, ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    log("warn", msg, ...args);
  },
  error(msg: string, ...args: unknown[]) {
    log("error", msg, ...args);
  },
  debug(msg: string, ...args: unknown[]) {
    log("debug", msg, ...args);
  },
};

function log(level: LogLevel, msg: string, ...args: unknown[]) {
  const line = `${timestamp()} ${PREFIX} [${level.toUpperCase()}] ${msg}`;
  // STDIO 모드에서 stdout을 오염시키지 않도록 stderr로 출력
  if (level === "error") {
    console.error(line, ...args);
  } else {
    console.error(line, ...args);
  }
}
