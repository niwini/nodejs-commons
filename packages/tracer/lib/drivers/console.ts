import {
  ILogDriver,
  ILogDriverLogOpts,
  TLogLevel,
} from "../types";

/**
 * This class implements a basic logger using just console.log.
 */
class ConsoleLogDriver implements ILogDriver {
  private _serviceName: string;

  /**
   * This function going to initialize the driver.
   *
   * @param serviceName -
   */
  public init(serviceName: string) {
    this._serviceName = serviceName;
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

    /* eslint-disable no-console */
    switch (level) {
      case "debug": return console.debug(obj);
      case "info": return console.info(obj);
      case "warn": return console.warn(obj);
      case "error": return console.error(obj);
      default: return console.debug(obj);
    }
    /* eslint-enable no-console */
  }
}

export default ConsoleLogDriver;
