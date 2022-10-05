import dayjs from "dayjs";
import pino from "pino";

import {
  ILogDriver,
  ILogDriverLogOpts,
  ITraceContext,
  TLogLevel,
} from "../types";

declare const window: any;

//#####################################################
// Constants
//#####################################################
const browserLevelColors = {
  critical: "red",
  debug: "blue",
  error: "red",
  info: "green",
  verbose: "gray",
  warn: "yellow",
} as {[key: string]: string};

//#####################################################
// Main Class
//#####################################################

/**
 * This class implements a log driver which uses pino
 * logger under the hood.
 */
class PinoLogDriver implements ILogDriver {
  /**
   * Service name.
   */
  private _serviceName: string;

  /**
   * Underlying logger to use.
   */
  private _logger: pino.Logger;

  /**
   * This function going to initialize the driver.
   *
   * @param serviceName -
   */
  public init(serviceName: string) {
    this._serviceName = serviceName;

    let transport: any;

    /**
     * If we are running in NodeJS then lets create the transport.
     */
    if (typeof window === "undefined") {
      transport = pino.transport({
        targets: [
          {
            level: "debug",
            options: {},
            target: "@niwini/tracer/lib/drivers/pino-console-transport.mjs",
          },
        ],
      });
    }

    this._logger = pino({
      browser: {
        asObject: true,
        serialize: true,
        write: (logObj: any) => {
          // eslint-disable-next-line
          const {
            data,
            levelName,
            msg,
            time,
          } = logObj;

          // eslint-disable-next-line prefer-destructuring
          const traceCtx: ITraceContext = logObj.traceCtx;

          const timeWithStyles = [
            `%c${dayjs(time).toISOString()}`,
            "color: original",
          ];

          let levelNameWithStyles: string[];

          if (levelName) {
            const levelColor = browserLevelColors[levelName] || "gray";
            levelNameWithStyles = [
              `%c${levelName}`,
              `color: ${levelColor}; font-weight: bold`,
            ];
          }

          /**
           * Function full name.
           */
          let fnFullNameWithStyles: string[];
          let callStackNameWithStyles: string[];

          if (traceCtx) {
            fnFullNameWithStyles = [
              `%c${traceCtx.fnFullName}`,
              "color: cyan; font-weigh: bold;",
            ];

            const { callStackName } = traceCtx;

            if (callStackName) {
              callStackNameWithStyles = [
                `%cby ${callStackName}`,
                "color: magenta; font-weigh: bold;",
              ];
            }
          }

          let msgWithStyles: string[];

          if (msg) {
            msgWithStyles = [
              `%c${msg}`,
              "color: original",
            ];
          }

          let dataWithStyles: string[];

          if (data) {
            try {
              const dataStr = JSON.stringify(data);

              if (dataStr && dataStr.length) {
                dataWithStyles = [
                  `%c${dataStr}`,
                  "color: gray",
                ];
              }
            } catch (error) {
              // Fail
            }
          }

          const parts = [
            timeWithStyles,
            levelNameWithStyles,
            fnFullNameWithStyles,
            msgWithStyles,
            dataWithStyles,
            callStackNameWithStyles,
          ].filter(Boolean).reduce((map, item) => {
            map.args.push(item[0]);
            map.styles.push(item[1]);
            return map;
          }, { args: [], styles: [] });

          const consoleArgs = [
            parts.args.join(" "),
            ...parts.styles,
          ].filter(Boolean);

          /* eslint-disable sort-keys, no-console */
          console.log(...consoleArgs);

          if (data) {
            console.log(data);
          }
          /* eslint-enable sort-keys, no-console */
        },
      },
      customLevels: {
        verbose: 10,
      },
      formatters: {
        bindings: () => ({}),
        log: (payload: {
          data: any;
          levelName: string;
          msg: string;
          traceCtx: ITraceContext;
        }) => {
          /**
           * Call stack info.
           */
          let $tid: string;
          let $parentTid: string;
          let $call: string;
          let $fnName: string;

          if (payload.traceCtx) {
            $tid = payload.traceCtx.id;
            $call = payload.traceCtx.callStackName;
            $fnName = payload.traceCtx.fnFullName;

            if (payload.traceCtx.parent) {
              $parentTid = payload.traceCtx.parent.id;
            }
          }

          return {
            $call,
            $fnName,
            $parentTid,
            $tid,
            color: payload.traceCtx.serviceColor,
            data: payload.data,
            levelName: payload.levelName,
            msg: payload.msg,
            name: payload.traceCtx.serviceName,
          };
        },
      },
      level: "debug",
      name: this._serviceName,
    }, transport);
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
    level: TLogLevel,
    message: string,
    data?: any,
    opts?: ILogDriverLogOpts, // eslint-disable-line no-use-before-define
  ) {
    const obj = {
      data,
      levelName: level,
      msg: message,
      ...opts,
    };

    switch (level) {
      case "debug": return this._logger.debug(obj);
      case "info": return this._logger.info(obj);
      case "warn": return this._logger.warn(obj);
      case "error": return this._logger.error(obj);
      default: return this._logger.debug(obj);
    }
  }
}

//#####################################################
// Exports
//#####################################################
export {
  PinoLogDriver as default,
};
