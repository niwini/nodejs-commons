import { getUrlParts } from "@niwini/utils/lib/url";
import chalk from "chalk";
import dayjs from "dayjs";
import _ from "lodash";
import * as winston from "winston";
import { LogstashTransport } from "winston-logstash-transport";

import TraceContext from "../context";
import {
  ILogDriver,
  ILogDriverConfig,
  ILogDriverLogOpts,
} from "../types";

//#####################################################
// Types
//#####################################################

/**
 * Winston driver config options.
 */
interface IWinstonLogDriverConfig extends ILogDriverConfig {
}

//#####################################################
// Main Class
//#####################################################

/**
 * This class implements a log driver which uses winston
 * logger under the hood.
 */
class WinstonLogDriver implements ILogDriver {
  /**
   * Underlying logger to use.
   */
  private _logger: winston.Logger;

  /**
   * The log file path if we want to log to file.
   */
  private readonly _logFilePath: string;

  /**
   * Url to a logstash server.
   */
  private readonly _logstashUrl: string;

  /**
   * Boolean indicating if we shoudl log to console.
   */
  private readonly _logToConsole: boolean;

  /**
   * This function going to create a new instance of
   * this driver.
   *
   * @param config - Set of config options.
   */
  constructor(config: IWinstonLogDriverConfig = {}) {
    this._logFilePath = config.logFilePath;
    this._logstashUrl = config.logstashUrl;
    this._logToConsole = _.defaultTo(config.logToConsole, true);
  }

  /**
   * This function going to initialize the driver.
   */
  public init() {
    // Create the winston logger.
    this._logger = winston.createLogger({
      format: winston.format.json(),

      /**
       * We going to handle level in our logger instead of in
       * winston so that we can have a winston singleton driver.
       */
      level: "silly",
    });

    // Setup the driver.
    const {
      combine,
      timestamp,
      printf,
      colorize,
    } = winston.format;

    const ignorePrivate = winston.format((info) => {
      if (info.private) {
        return false;
      }

      return info;
    });

    if (this._logToConsole) {
      this._logger.add(new winston.transports.Console({
        format: combine(
          colorize(),
          ignorePrivate(),
          timestamp(),
          printf((info) => {
            const traceCtx = info.traceCtx as TraceContext;
            let dataStr = "";

            /**
             * Transform data to string so we can log it better.
             */
            if (info.data) {
              try {
                dataStr = JSON.stringify(info.data);
              } catch (error) {
                dataStr = info.data;
              }

              if (dataStr && dataStr.length) {
                dataStr = chalk.gray(dataStr);
              }
            }

            /**
             * As prefix we going to show the timestamp followed
             * by the service name (if provided) followed by the
             * caller name.
             */
            let prefix = dayjs(info.timestamp).toISOString();

            if (TraceContext.serviceName) {
              const textColor = TraceContext.serviceColor || "#999999";
              const serviceNamePrefix = chalk.bold.hex(textColor)(
                ` [${TraceContext.serviceName}]`,
              );

              prefix = `${prefix}${serviceNamePrefix}`;
            }

            /**
             * Call stack info.
             */
            let callStackNamesStr;

            if (traceCtx) {
              callStackNamesStr = traceCtx.callStackName;

              if (callStackNamesStr.length) {
                callStackNamesStr = chalk.bold.cyan(`by ${callStackNamesStr}`);
              }
            }

            const parts = [
              prefix,
              info.level,
              info.message,
              dataStr,
              callStackNamesStr,
            ].filter(Boolean);

            return parts.join(" ");
          }),
        ),
      }));
    }

    if (this._logFilePath) {
      this._logger.add(
        new winston.transports.File({
          filename: this._logFilePath,
        }),
      );
    }

    if (this._logstashUrl) {
      const urlParts = getUrlParts(this._logstashUrl);
      const logstashOpts: any = {
        host: urlParts.hostname,
        node_name: "logstash",
        port: urlParts.port,
      };

      this._logger.add(
        new LogstashTransport(logstashOpts),
      );
    }
  }

  /**
   * This function implements the main logging function.
   *
   * @param level - The log level.
   * @param message - A main message to be logged.
   * @param data - Extra data to be logged with the message.
   * @param opts - Extra options to be used.
   */
  public log(
    level: string,
    message: string,
    data?: any,
    opts?: ILogDriverLogOpts, // eslint-disable-line no-use-before-define
  ) {
    this._logger.log(level, message, { data, ...opts });
  }
}

//#####################################################
// Export
//#####################################################
export {
  WinstonLogDriver as default,
};
