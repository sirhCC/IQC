import winston from 'winston';
import path from 'path';

const logLevel = process.env.IQL_LOG_LEVEL || 'info';
const logFile = process.env.IQL_LOG_FILE;

const formats: winston.Logform.Format[] = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
];

// Console format with colors
const consoleFormat = winston.format.combine(
  ...formats,
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (stack) {
      msg += `\n${stack}`;
    }
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// File format (JSON)
const fileFormat = winston.format.combine(
  ...formats,
  winston.format.json()
);

// Transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: consoleFormat,
    level: logLevel,
  }),
];

// Add file transport if log file is specified
if (logFile) {
  transports.push(
    new winston.transports.File({
      filename: path.resolve(logFile),
      format: fileFormat,
      level: logLevel,
    })
  );
}

export const logger = winston.createLogger({
  level: logLevel,
  transports,
  exitOnError: false,
});

// Helper functions for common logging patterns
export const logQuery = (query: string, plugin?: string) => {
  logger.debug('Executing query', { query, plugin });
};

export const logQueryResult = (query: string, rowCount: number, duration: number) => {
  logger.info('Query completed', { query, rowCount, duration: `${duration}ms` });
};

export const logPluginAction = (plugin: string, action: string, details?: Record<string, unknown>) => {
  logger.debug(`Plugin ${action}`, { plugin, ...details });
};

export const logError = (error: Error, context?: Record<string, unknown>) => {
  logger.error(error.message, { error: error.stack, ...context });
};

export const logWarning = (message: string, context?: Record<string, unknown>) => {
  logger.warn(message, context);
};
