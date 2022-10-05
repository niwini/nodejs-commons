import _ from "lodash";

import {
  ILogger,
  ILoggerConfig,
  ILogDriver,
  ITraceContext,
  TLogLevel,
} from "./types";

//#####################################################
// Constants
//#####################################################
/**
 * Available log levels.
 */
const LOG_LEVELS = [
  "error",
  "warn",
  "info",
  "debug",
  "verbose",
];

//#####################################################
// Main class
//#####################################################
/**
 * This class implements a logger which going to use an
 * underlying logger driver to log statements to console,
 * file or logstash/elasticsearch.
 */
export default class Logger implements ILogger {
  /**
   * Global log level for all loggers.
   */
  public static level: TLogLevel = "info";

  /**
   * The trace context which owns this logger and from
   * which we going to grab some information about the
   * function/service we are focusing in.
   */
  private readonly _traceCtx: ITraceContext;

  /**
   * This is the log driver we use to actually do logging.
   */
  private readonly _driver: ILogDriver;

  /**
   * Instance log level.
   */
  private readonly _level: TLogLevel;

  /**
   * Scope of logging to be printed together with message.
   */
  private readonly _scope: string;

  /**
   * Creates a new instance of logger.
   *
   * @param config - Set of config options.
   * @param config.traceCtx - The trace context which owne this logger.
   */
  constructor(config: ILoggerConfig = {}) {
    this._traceCtx = config.traceCtx;
    this._level = config.level ?? Logger.level;
    this._scope = config.scope;
    this._driver = config.driver;
  }

  /**
   * This function implements a generic log function which is
   * the base to all other methods.
   *
   * @param level - The log level (info, error, etc).
   * @param message - The message to be logged.
   * @param data - Data to be logged.
   * @param meta - A set of metadata.
   */
  private _log(
    level: TLogLevel,
    message: string,
    ...data: any[]
  ) {
    if (!this._driver) {
      throw new Error("no log driver provided");
    }

    // Prevent logging when in silent mode.
    if (process.env.LOG_SILENT === "true") {
      return;
    }

    // Check if we going to log.
    const currentLevelIdx = LOG_LEVELS.indexOf(this._level);
    const levelIdx = LOG_LEVELS.indexOf(level);

    if (levelIdx < 0 || levelIdx > currentLevelIdx) {
      return;
    }

    // Get caller filepath.
    let filePath = this._traceCtx && this._traceCtx.filePath;

    // Prepend service name to filepath.
    if (filePath) {
      filePath = `${filePath.replace(/^\//, "")}`;
    }

    // Parse message
    const scopedMessage = this._scope
      ? `${this._scope} : ${message}`
      : message;

    // Try to convert data to plain object.
    let plainData;

    /**
     * Since we inject $ctx by hand in the first object arg
     * if the user tries to log received data we going to end
     * up trying to log $ctx which going to fail when we try to
     * stringify.
     */
    if (data.length > 0) {
      const dataToStringify: any[] = [];

      for (const item of data) {
        let cleanItem: any;

        if (_.isPlainObject(item) && item.$ctx) {
          const { $ctx, ...rest } = item; // eslint-disable-line
          cleanItem = rest;
        } else {
          cleanItem = item;
        }

        dataToStringify.push(cleanItem);
      }

      try {
        plainData = JSON.parse(JSON.stringify(
          data.length === 1 ? data[0] : data,
        ));
      } catch (error) {
        // Could not convert data to plain object.
      }
    }

    this._driver.log(
      level,
      scopedMessage,
      plainData,
      {
        traceCtx: this._traceCtx,
      },
    );
  }

  /**
   * This function creates a debug log.
   *
   * @param message - The message to be logged.
   * @param data - Data to be logged.
   * @param meta - A set of config options.
   */
  public debug(message: string, ...data: any[]) {
    this._log("debug", message, ...data);
  }

  /**
   * This function creates a verbose log.
   *
   * @param message - The message to be logged.
   * @param data - Data to be logged.
   * @param meta - A set of config options.
   */
  public verbose(message: string, ...data: any[]) {
    this._log("verbose", message, ...data);
  }

  /**
   * This function creates an info log.
   *
   * @param message - The message to be logged.
   * @param data - Data to be logged.
   * @param meta - A set of config options.
   */
  public info(message: string, ...data: any[]) {
    this._log("info", message, ...data);
  }

  /**
   * This function creates a warning log.
   *
   * @param message - The message to be logged.
   * @param data - Data to be logged.
   * @param meta - A set of config options.
   */
  public warn(message: string, ...data: any[]) {
    this._log("warn", message, ...data);
  }

  /**
   * This function creates an error log.
   *
   * @param message - The message to be logged.
   * @param data - Data to be logged.
   * @param meta - A set of config options.
   */
  public error(message: string, ...data: any[]) {
    this._log("error", message, ...data);
  }

  /**
   * This function emits a critical error log.
   *
   * @param message - The message to be logged.
   * @param data - Data to be logged.
   */
  public critical(message: string, ...data: any[]) {
    this._log("error", message, ...data);

    this._traceCtx.errorNotify(new Error(message));
  }

  /**
   * This function creates a new logger based on this logger.
   *
   * @param scope - The new scope.
   */
  public fork(scope: string) {
    return new Logger({
      driver: this._driver,
      scope: [this._scope, scope].filter(Boolean).join("."),
      traceCtx: this._traceCtx,
    });
  }
}
