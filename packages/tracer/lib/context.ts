import dayjs from "dayjs";
import _ from "lodash";
import { customAlphabet } from "nanoid";

import ConsoleLogDriver from "./drivers/console";
import Logger from "./logger";
import {
  ICallStackNamesChainItem,
  ILogDriver,
  ILogger,
  ITraceContext,
  ITraceContextConfig,
  ITraceContextUser,
  ITraceContextSharedInitConfig,
  ITraceHashData,
  ITraceDriver,
  ITraceDriverSpan,
  SpanStatus,
  TLogLevel,
  TraceContextInjectMode,
} from "./types";
import {
  hashDecode,
  hashEncode,
} from "./utils";

//#####################################################
// Constants
//#####################################################
/**
 * ~357 days needed, in order to have a 1% probability
 * of at least one collision.
 *
 * https://zelark.github.io/nano-id-cc/
 */
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  10, // eslint-disable-line @typescript-eslint/no-magic-numbers
);

/**
 * Regex for identifying trace function arg name for
 * trace context.
 */
const CTX_ARG_NAME_REGEX = /^_?\$ctx$/;

/**
 * Function signature regexes.
 */
const FN_SIGN = /(?:function)? ?[^ (]*?\(((?:.|\n)*?)(?=\) ?(?:=>|{))/;

/**
 * Set of regexes we going to use to parse function signature
 * to get argument names.
 */
const FN_ARG_REGEXES = [
  // Simple argument (no param)
  /^([\w\d-_$]+),/,

  // Argument with param followed by simple arg.
  /^([^ =]+)=((?:[^=]|=>)+?)(?=,[\w\d-_$]+,)/,

  // Argument with param followed by argument with param
  /^([^ =]+)=(.+?)(?=,[\w\d-_$]+=)/,

  // Argument with param at the end (if none of the prev matched)
  /^([^ =]+)=(.+),$/,
];

//#####################################################
// Types
//#####################################################
/**
 * The `traceFn` is a function that going to wrap a function that
 * clients going to call and it going to provide tracing functionalities
 * for the wrapped function. In order to allow injecting trace context
 * we enforce the called function to receive all it's arguments as a
 * single object instead of using positional parameters. This have two
 * main advantages:
 *
 *   - Positional arguments can be difficult to read when looking at code.
 *     Think of a function call like `doSomething(true)` and
 *     `doSomething({ shouldCallApi: true })`. Since the second call is
 *     more verbose it make easy to understand what is the meaning of the
 *     passed arguments looking only at the code which calls the function.
 *
 *   - Positional arguments can be tricky because we can have optional
 *     arguments and different call signatures for a function. This way we
 *     can end up injecting trace context in the position of an optional
 *     argument that was not provided by the caller. In the past we used a
 *     argIdx prop in the traceFn config object that let user to manually
 *     inform at which position we want to inject the trace context but this
 *     is not elegant :)
 */
export type TTracedFnArgs<TArgs extends Object = {}> = TArgs & {
  $ctx?: TraceContext; // eslint-disable-line no-use-before-define
  $traceHash?: string;
};

/**
 * Configs we can pass to traceFn.
 */
export interface ITraceFnConfig extends ITraceContextConfig {

  /**
   * Function argument names.
   */
  fnArgNames?: string[];

  /**
   * Option to control the context injection mode.
   */
  injectMode?: TraceContextInjectMode;

  /**
   * Log passed in arguments automatically.
   */
  logArgs?: boolean | string[];

  /**
   * Flag to log start end of all traced functions.
   */
  shouldLogStartEnd?: boolean;

  /**
   * This is the original function we should use as source of
   * truth to collect function arg names.
   */
  originalFn?: Function;

  /**
   * Color associated with the context which will be created.
   */
  serviceColor?: string;

  /**
   * Flag to force record of tracing using the driver.
   */
  shouldRecordTracing?: boolean;

  /**
   * Argument path (in lodash get format) to get the trace hash.
   */
  traceHashArgPath?: string;
}

export type TTracedFn<TReturn = any> = (
  ...args: any[]
) => TReturn | Promise<TReturn>;

interface IFunctionWithArgNames extends Function {
  $__argNames?: string[];
}

//#####################################################
// Context Namespace
//#####################################################

/**
 * The trace namespace map.
 */
export interface ITraceNSMap {
  [key: string]: Function;
}

//#####################################################
// Auxiliary Functions
//#####################################################
/**
 * This function going to extract the argument names of
 * a function as provided in the function signature.
 *
 * @param fn - Target function.
 */
function getFnArgNames(fn: IFunctionWithArgNames) {
  if (fn.$__argNames) {
    return fn.$__argNames;
  }

  const fnStr = fn.toString().replace(/\n| /g, "");

  const MAX_TRIES = 150;
  const argNames: string[] = [];
  const argsSignMatch = FN_SIGN.exec(fnStr);

  if (argsSignMatch) {
    let [, argsStr] = argsSignMatch;

    // Remove first parenthesis.
    argsStr = argsStr.replace(/\(/, "");

    // Remove line breaks.
    argsStr = argsStr.replace(/\n/g, "");

    // Remove white spaces.
    argsStr = argsStr.replace(/ +/g, "");

    // Remove inline comments.
    argsStr = argsStr.replace(/\/\*.*?\*\//g, "");

    // Add auxiliary comma at the end.
    if (argsStr.length && !argsStr.endsWith(",")) {
      argsStr = `${argsStr},`;
    }

    let tryCount = 0;

    // Start getting arg names in order.
    while (argsStr.length && tryCount < MAX_TRIES) {
      tryCount++;

      for (const rgx of FN_ARG_REGEXES) {
        const match = rgx.exec(argsStr);

        if (match) {
          argNames.push(match[1]);
          argsStr = argsStr.replace(match[0], "");

          /* eslint-disable max-depth */
          if (argsStr.startsWith(",")) {
            argsStr = argsStr.replace(",", "");
          }
          /* eslint-enable max-depth */

          break;
        }
      }
    }

    if (argsStr.length && tryCount === MAX_TRIES) {
      throw new Error("Failed to get function arg names");
    }

    fn.$__argNames = argNames;
  }

  return argNames;
}

//#####################################################
// Main Class
//#####################################################
/**
 * This class implements a context for all tracing
 * functionality.
 */
class TraceContext<TData = any> implements ITraceContext<TData> {
  /**
   * Name of the service under tracing.
   */
  private static _serviceName: string;

  /**
   * Color to be used when logging the service name
   * associated with this stuff.
   */
  private static _serviceColor: string;

  /**
   * Trace driver to be used.
   */
  private static _logLevel: TLogLevel = "info";

  /**
   * Trace driver to be used.
   */
  private static _shouldLogStartEnd = true;

  /**
   * Trace driver to be used.
   */
  private static _traceDriver: ITraceDriver;

  /**
   * Flag to force record of tracing using the driver.
   */
  private static _shouldRecordTracing = true;

  /**
   * Log driver to be used when creating loggers.
   */
  private static _logDriver: ILogDriver;

  /**
   * Shared trace context.
   */
  private static _shared: TraceContext;

  /**
   * Current user.
   */
  private static _user: ITraceContextUser;

  /**
   * Inject mode to drive how we inject context into
   * traced function.
   */
  private static _injectMode: TraceContextInjectMode;

  /**
   * Getter for shared trace context.
   */
  static get shared() {
    return TraceContext._shared;
  }

  /**
   * Getter for trace driver.
   */
  static get traceDriver() {
    return TraceContext._traceDriver;
  }

  /**
   * Getter for traceDriverRecord.
   */
  static get shouldRecordTracing() {
    return TraceContext._shouldRecordTracing;
  }

  /**
   * Getter for logStartEnd.
   */
  static get shouldLogStartEnd() {
    return TraceContext._shouldLogStartEnd;
  }

  /**
   * Getter for log driver.
   */
  static get logDriver() {
    return TraceContext._logDriver;
  }

  /**
   * Getter for the log level of all contexts.
   */
  static get logLevel() {
    return TraceContext._logLevel;
  }

  /**
   * Getter for global logger
   */
  static get logger() {
    return TraceContext.shared
      ? TraceContext.shared.logger
      : new Logger({
        level: TraceContext.logLevel,
      });
  }

  /**
   * Getter for global service color.
   */
  static get serviceColor() {
    return TraceContext._serviceColor;
  }

  /**
   * Getter for global service name.
   */
  static get serviceName() {
    return TraceContext._serviceName;
  }

  /**
   * Setter for global service color.
   */
  static set user(user: ITraceContextUser) {
    TraceContext._user = user;

    if (TraceContext.traceDriver) {
      TraceContext.traceDriver.setUser(user);
    }
  }

  /**
   * Setter for global service color.
   */
  static get user() {
    return TraceContext._user;
  }

  /**
   * Getter for inject mode.
   */
  static get injectMode() {
    return TraceContext._injectMode;
  }

  /**
   * This function going to initialized a shared trace
   * context.
   *
   * @param config - A set of config options.
   */
  public static sharedInit(
    config: ITraceContextSharedInitConfig = {},
  ) {
    if (!TraceContext._shared) {
      TraceContext._serviceName = config.serviceName;
      TraceContext._serviceColor = config.serviceColor;
      TraceContext._traceDriver = config.traceDriver;
      TraceContext._logDriver = config.logDriver ?? new ConsoleLogDriver();
      TraceContext._logLevel = config.logLevel;
      TraceContext._shared = new TraceContext({ fnName: "main" });
      TraceContext._injectMode
        = config.injectMode ?? TraceContextInjectMode.AS_ARG;
      TraceContext._shouldLogStartEnd
        = _.defaultTo(config.shouldLogStartEnd, true);
      TraceContext._shouldRecordTracing
        = _.defaultTo(config.shouldRecordTracing, true);

      // Setup global logger level.
      Logger.level = config.logLevel;

      /**
       * Initialize trace driver now. This way driver can use the
       * created shared trace context.
       */
      if (TraceContext._traceDriver) {
        TraceContext._traceDriver.init();
      }

      /**
       * Initialize log driver now. This way driver can use the
       * created shared trace context.
       */
      if (TraceContext._logDriver) {
        TraceContext._logDriver.init(TraceContext.serviceName);
      }
    }

    return TraceContext._shared;
  }

  /**
   * This function checks if shared instance already exists
   * and therefore if global context was initialized.
   */
  public static sharedExists() {
    return Boolean(TraceContext.shared);
  }

  /**
   * This functions only return data if we are in environments other
   * than production.
   *
   * @param data - The secret data to log if we are allowed to (dev like envs).
   */
  public static secret<TData = any>(data: TData): TData { // eslint-disable-line consistent-return
    if (process.env.LOG_SECRETS) {
      return data;
    }
  }

  /**
   * This function going to create a trace context from a trace
   * hash.
   *
   * @param hash - The hash representing the parent context.
   */
  public static fromHash(hash: string) {
    const hashData = hashDecode(hash);

    return new TraceContext(hashData);
  }

  /**
   * Trace context going to hold information about the function
   * we are tracing like fileName, fnName, etc.
   */

  /**
   * The class name this context is associated with.
   */
  private readonly _callStackNamesChain: ICallStackNamesChainItem[];

  /**
   * The class name this context is associated with.
   */
  private readonly _className: string;

  /**
   * Unique hash id identifying this context.
   */
  private readonly _id: string;

  /**
   * Flag for enabling auto tracing which going to automatically
   * create a function level span which can then be used inside
   * the function to trace down other parts of the function and
   * to pass it over to other function automatically.
   */
  private readonly _autoTracing: boolean;

  /**
   * Function arguments.
   */
  private readonly _fnArgs: Object;

  /**
   * Lits of function args to log with args name in the logging
   * output.
   */
  private readonly _fnArgsToLog: string[];

  /**
   * List of function results to log.
   */
  private readonly _fnResultsToLog: string[] | boolean;

  /**
   * Name of the function we are tracing.
   */
  private readonly _fnName: string;

  /**
   * Path of the file where the function lives.
   */
  private readonly _filePath: string;

  /**
   * A logger instance so we can log stuff related to this
   * context.
   */
  private readonly _logger: ILogger;

  /**
   * Context associated with a function that called the creation
   * of this context. This way we going to get a stack of contexts.
   */
  private readonly _parent: ITraceContext;

  /**
   * Color to be used for all logs produced by this context logger.
   */
  private readonly _serviceColor: string;

  /**
   * Name of the service associated with this context.
   */
  private readonly _serviceName: string;

  /**
   * Hash of the span representing the span.
   */
  private readonly _spanHash: string;

  /**
   * Trace span associated with this context.
   */
  public span: ITraceDriverSpan;

  /**
   * Public data carried over by this context.
   */
  public data: TData;

  /**
   * Id getter.
   */
  get id() {
    return this._id;
  }

  /**
   * Getter for auto tracing flag.
   */
  get autoTracing() {
    return this._autoTracing;
  }

  /**
   * This function get the name/ids of all context stack
   * iterating of content ancestors.
   */
  get callStackName() {
    const chain = this._evalCallStackNamesChain();

    let currServiceName: string = TraceContext.serviceName;
    let currClassName: string;

    const names: string[] = [];
    let currNames: string[] = [];

    for (const item of chain) {
      const itemNames = [item.fnName];

      if (
        item.className !== currClassName
        || item.serviceName !== currServiceName
      ) {
        if (currNames.length) {
          names.push(currNames.join("."));
        }

        if (item.className) {
          itemNames.unshift(item.className);
        }

        if (
          item.serviceName
          && item.serviceName !== currServiceName
          && item.serviceName !== TraceContext.serviceName
        ) {
          itemNames[0] = `[${item.serviceName}]${itemNames[0]}`;
        }

        currNames = [];
        currClassName = item.className;
        currServiceName = item.serviceName;
      }

      currNames.push(itemNames.join(":"));
    }

    if (currNames.length) {
      names.push(currNames.join("."));
    }

    return names.join("->");
  }

  /**
   * This getter is going to retrieve _callStackNamesChain.
   */
  get callStackNamesChain() {
    return this._callStackNamesChain;
  }

  /**
   * Getter for className.
   */
  get className() {
    return this._className;
  }

  /**
   * Function args getter.
   */
  get fnArgs() {
    return this._fnArgs;
  }

  /**
   * Function args to log getter.
   */
  get fnArgsToLog() {
    return this._fnArgsToLog;
  }

  /**
   * Function args to log getter.
   */
  get fnName() {
    return this._fnName;
  }

  /**
   * Function full name including class name if present.
   */
  get fnFullName() {
    return [
      this.className,
      this.fnName,
    ].filter(Boolean).join(":");
  }

  /**
   * Function args to log getter.
   */
  get fnResultsToLog() {
    return this._fnResultsToLog;
  }

  /**
   * File path getter.
   */
  get filePath() {
    return this._filePath;
  }

  /**
   * Flag indicating if this context is the shared one.
   */
  get isShared(): boolean {
    return this === TraceContext.shared;
  }

  /**
   * Logger getter.
   */
  get logger() {
    return this._logger;
  }

  /**
   * Parent getter.
   */
  get parent() {
    return this._parent;
  }

  /**
   * Getter for service color.
   */
  get serviceColor() {
    return this._serviceColor;
  }

  /**
   * Getter for service name.
   */
  get serviceName() {
    return this._serviceName;
  }

  /**
   * Getter for span hash.
   */
  get spanHash() {
    return this._spanHash;
  }

  /**
   * Creates a new instance of trace context.
   *
   * @param config - Set of config options.
   */
  constructor(config: ITraceContextConfig = {}) {
    this._id = config.id ?? nanoid();

    this._autoTracing = _.defaultTo(config.autoTracing, true);
    this._serviceName = config.serviceName ?? TraceContext.serviceName;
    this._serviceColor = config.serviceColor ?? TraceContext.serviceColor;
    this._callStackNamesChain = config.callStackNamesChain;
    this._className = config.className;
    this._filePath = config.filePath;
    this._fnArgs = config.fnArgs;
    this._fnArgsToLog = config.fnArgsToLog;
    this._fnResultsToLog = config.fnResultsToLog;
    this._fnName = config.fnName;
    this._parent = config.parent;
    this._spanHash = config.spanHash;
    this.data = config.data;

    this._logger = new Logger({
      driver: TraceContext._logDriver,
      level: TraceContext.logLevel,
      traceCtx: this,
    });

    // Automatically pass parent data down.
    if (this._parent && this._parent.data) {
      this.data = _.merge({}, this.data, this._parent.data);
    }
  }

  /**
   * This function get the name/ids of all context stack
   * iterating of content ancestors.
   */
  private _evalCallStackNamesChain() {
    if (this.isShared) {
      return [];
    }

    if (this._callStackNamesChain) {
      return this._callStackNamesChain;
    }

    const names: {
      fnName: string;
      className?: string;
      serviceName?: string;
    }[] = [
      {
        className: this.className,
        fnName: this.fnName || this._id,
        serviceName: this.serviceName,
      },
    ];

    let nextParent = this.parent;

    while (nextParent) {
      if (nextParent.callStackNamesChain) {
        names.unshift(
          ...nextParent.callStackNamesChain,
        );

        break;
      }

      names.unshift(
        {
          className: nextParent.className,
          fnName: nextParent.fnName || nextParent.id,
          serviceName: nextParent.serviceName,
        },
      );

      nextParent = nextParent.parent;
    }

    return names;
  }

  /**
   * This function going to call another function and inject
   * the context to it's args.
   *
   * @param fn - Function to be called.
   * @param args - The function arguments.
   */
  public call<TArgs = any, TReturn = void>(
    fn: (args: TArgs) => TReturn,
    args: TArgs,
  ) {
    return fn({ ...args, $ctx: this });
  }

  /**
   * This function going to bind context into a set of arguments.
   *
   * @param args - The function arguments.
   */
  public bind<TArgs extends Object = any>(
    args: TArgs,
  ): TTracedFnArgs<TArgs> {
    return {
      ...args,
      $ctx: this,
      $traceHash: this.toHash(),
    };
  }

  /**
   * This function going to use the client to sent an error
   * notification to Sentry.
   *
   * @param error - The error to notify.
   */
  public errorNotify(error: Error) {
    if (TraceContext.traceDriver) {
      TraceContext.traceDriver.errorNotify(error);
    }
  }

  /**
   * This function going to encode this context into a hash
   * we going to use to trace down requests.
   */
  public toHash() {
    const hashData: ITraceHashData = {
      callStackNamesChain: this._evalCallStackNamesChain(),
      className: this.className,
      data: this.data,
      fnName: this.fnName,
      id: this.id,
      serviceName: TraceContext.serviceName,
    };

    if (this.span) {
      hashData.spanHash = this.span.toHash();
    }

    return hashEncode(hashData);
  }

  /**
   * This function going to start tracing associated with this
   * context.
   */
  public traceStart() {
    /**
     * Start a new context span.
     */
    if (
      TraceContext.traceDriver
      && this.autoTracing
      && this.fnName
    ) {
      this.span = TraceContext.traceDriver.spanStart(this.fnName, {
        parent: this.parent && this.parent.span,
        parentHash: this.parent && this.parent.spanHash,
        tags: {
          serviceName: TraceContext.serviceName,
        },
      });
    }
  }

  /**
   * This function going to finish tracing associated with this
   * context.
   *
   * @param status - Finish status.
   * @param _data - Any data we want to associate with span.
   */
  public traceFinish(
    status: SpanStatus = SpanStatus.OK,
    _data?: any,
  ) {
    if (this.span) {
      this.span.status = status;
      this.span.finish();
    }
  }
}

//#####################################################
// Function Trace
//#####################################################
function traceFn<TFn extends Function>(
  fnToTrace: TFn,
): TFn;

function traceFn<TFn extends Function>(
  fnNameOrConfig: string | ITraceFnConfig,
  fnToTrace: TFn,
): TFn;

function traceFn<TFn extends Function>(
  fnName: string,
  config: ITraceFnConfig,
  fnToTrace: TFn,
): TFn;

/**
 * This is the main trace function that going to trace
 * the start/end of execution of a function, log the args
 * and inject a custom logger the function can use.
 *
 * @param fnNameOrConfigOrFn -
 *  A name to be assigned to the function we are about to trace or
 *  a config object containing fnName as a field or the function itself.
 * @param fnToTraceOrConfig -
 *  The function to trace or a config object.
 * @param fnToTrace -
 *  The function to trace if not already provided in the other args.
 */
function traceFn<TReturn = void>(
  fnNameOrConfigOrFn: string | TTracedFn<TReturn> | ITraceFnConfig, // eslint-disable-line max-len
  fnToTraceOrConfig?: TTracedFn<TReturn> | ITraceFnConfig,
  fnToTrace?: TTracedFn<TReturn>,
): TTracedFn<TReturn> {
  let config: ITraceContextConfig = {};
  let fnToCall: TTracedFn<TReturn> = fnToTrace;
  let fnToGetInfoFrom: IFunctionWithArgNames = fnToTrace;
  let traceFnConfig: ITraceFnConfig = {};

  if (_.isString(fnNameOrConfigOrFn)) {
    config.fnName = fnNameOrConfigOrFn;
  } else if (_.isPlainObject(fnNameOrConfigOrFn)) {
    traceFnConfig = fnNameOrConfigOrFn as ITraceFnConfig;
  } else if (_.isFunction(fnNameOrConfigOrFn)) {
    fnToCall = fnNameOrConfigOrFn;
    fnToGetInfoFrom = fnToCall;
  }

  if (_.isFunction(fnToTraceOrConfig)) {
    fnToCall = fnToTraceOrConfig;
    fnToGetInfoFrom = fnToCall;
  } else if (_.isPlainObject(fnToTraceOrConfig)) {
    traceFnConfig = fnToTraceOrConfig;
  }

  // Extract options from config.
  fnToGetInfoFrom = traceFnConfig.originalFn ?? fnToGetInfoFrom;

  config = {
    ...config,
    ...traceFnConfig,
  };

  if (!fnToCall) {
    return null;
  }

  config.fnName = config.fnName ?? fnToGetInfoFrom.name;

  /**
   * @todo : The following uses function toString to get the argument
   * names in function signature. This might not be a good idea because
   * of performance. Maybe we should drop this solution and just assume
   * that we going to inject context as the last argument in the function
   * (using function length to know how many arguments it can receive).
   */

  /**
   * To improve the efficiency a little bit we going to make sure we
   * get arg names just once for the function.
   */
  const argNames = traceFnConfig.fnArgNames
    ?? getFnArgNames(fnToGetInfoFrom);

  /* eslint-disable complexity */
  /**
   * This is a wrapped version of the function we want to
   * trace.
   *
   * @param args - List of arguments.
   */
  return (...args: any[]) => {
    const injectMode = traceFnConfig.injectMode ?? TraceContext.injectMode;
    const shouldLogStartEnd = _.defaultTo(
      traceFnConfig.shouldLogStartEnd,
      TraceContext.shouldLogStartEnd,
    );
    const shouldRecordTracing = traceFnConfig.shouldRecordTracing
      ?? TraceContext.shouldRecordTracing;

    let $parentCtx: ITraceContext;
    let $parentTraceHash: string;

    /**
     * Try to find parent context among the received args.
     */
    if (config.parent) {
      $parentCtx = config.parent;
    } else {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (_.isPlainObject(arg)) {
          $parentCtx = arg.$ctx;
          $parentTraceHash = arg.$traceHash;
        } else if (arg instanceof TraceContext) {
          $parentCtx = arg;
        } else if (_.isString(arg) && arg.startsWith("$TRACE_HASH_")) {
          $parentTraceHash = arg;
        }

        if ($parentCtx || $parentTraceHash) {
          break;
        }
      }
    }

    // Use traceHashArgPath to get traceHash.
    if (traceFnConfig.traceHashArgPath) {
      const traceHashArg = _.get(args, traceFnConfig.traceHashArgPath);

      if (_.isFunction(traceHashArg)) {
        $parentTraceHash = traceHashArg();
      } else if (_.isString(traceHashArg)) {
        $parentTraceHash = traceHashArg;
      }
    }

    if (!$parentCtx && $parentTraceHash) {
      $parentCtx = TraceContext.fromHash($parentTraceHash);
    }

    const $ctx = new TraceContext({
      ...config,
      fnArgs: [],
      parent: $parentCtx,
    });

    /**
     * Start a new context span.
     */
    if (shouldRecordTracing) {
      $ctx.traceStart();
    }

    /**
     * Record start time so we can evaluate elapsed time.
     */
    const startTime = dayjs();

    /**
     * Log start with arguments if provided.
     */
    let startArgs: {[key: string]: any};

    if (traceFnConfig.logArgs) {
      startArgs = {};

      if (_.isArray(traceFnConfig.logArgs)) {
        traceFnConfig.logArgs.forEach((key) => {
          const keyParts = key.split(".");
          const argName = keyParts.shift();
          const valPath = keyParts.length > 0
            ? keyParts.join(".")
            : null;
          const argIdx = argNames.findIndex((name) => argName === name);

          if (argIdx >= 0) {
            const argVal = args[argIdx];
            const valToLog = valPath
              ? _.get(argVal, valPath)
              : argVal;

            _.set(startArgs, key, valToLog);
          }
        });
      } else {
        for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          const argName = argNames[i];

          _.set(startArgs, argName, arg);
        }
      }
    }

    if (shouldLogStartEnd) {
      $ctx.logger.verbose("start", startArgs);
    }

    /**
     * Encapsulate the finish process into a function to handle
     * the case when the function to trace returns a promise.
     *
     * @param result - Traced function result.
     * @param error - Traced function thrown error.
     */
    const finish = (result?: TReturn, error?: Error) => {
      const endTime = dayjs();

      if (shouldLogStartEnd) {
        $ctx.logger.verbose(
          `end [ELAPSED=${endTime.diff(startTime, "milliseconds")}]`,
        );
      }

      /**
       * If we started a trace context span let's finish it
       * now to mark the end of function execution.
       */
      if (shouldRecordTracing) {
        $ctx.traceFinish(
          error ? SpanStatus.INTERNAL_ERROR : SpanStatus.OK,
        );
      }

      return result;
    };

    /**
     * Call function injecting new context both to first arg
     * if it's a plain object and at the end of the function.
     * The injection going to done like the following:
     *
     * 1) If the first argument is a plain object then we going
     *    to inject the $ctx in that object. This is useful
     *    for React components where we receive everything packaged
     *    in a props object.
     * 2) Otherwise if we have an argument named $ctx in the fnToCall
     *    signature then we going to inject $ctx as an argument in that
     *    exact position (filling other positional arguments with
     *    undefined).
     */
    const newArgs = new Array(argNames.length).fill(undefined); // eslint-disable-line no-undefined

    /**
     * Since fnToCall.length does not consider arguments with
     * default values we need to use argNames as the source of
     * truth for the amount of arguments a function can receive.
     */

    for (let i = 0; i < argNames.length; i++) {
      if (i < args.length) {
        newArgs[i] = CTX_ARG_NAME_REGEX.test(argNames[i])
          ? $ctx
          : args[i];
      } else if (CTX_ARG_NAME_REGEX.test(argNames[i])) {
        newArgs[i] = $ctx;
      }
    }

    if (
      injectMode === TraceContextInjectMode.IN_FIRST_ARG_OBJECT
    ) {
      if (!newArgs.length) {
        newArgs.push({});
      }

      if (_.isPlainObject(newArgs[0])) {
        newArgs[0] = {
          ...newArgs[0],
          $ctx,
        };
      }
    }

    let result = fnToCall(...newArgs);

    /**
     * Finish up.
     */
    if (result instanceof Promise) {
      result = result
        .then(finish)
        .catch((error) => {
          $ctx.logger.error(
            "fail",
            {
              fileName: error.fileName,
              message: error.message,
            },
          );

          finish(null, error);

          throw error;
        });
    } else {
      try {
        finish();
      } catch (error) {
        $ctx.logger.error(
          "fail",
          {
            fileName: error.fileName,
            message: error.message,
          },
        );

        finish(null, error);
      }
    }

    return result;
  };
  /* eslint-enable complexity */
}

//#####################################################
// Namespace Trace
//#####################################################
/**
 * This function going to create a trace namespace so we
 * can trace standalone functions (i.e., not class methods).
 *
 * @param nsMapOrId -
 *  Namespace identifier string or the map of functions to
 *  trace.
 * @param nsMap -
 *   A map of the functions to trace.
 */
const traceNs = <TMap extends ITraceNSMap>(
  nsMapOrId: string | TMap,
  nsMap?: TMap,
) => {
  let id: string;
  let map: TMap;

  if (_.isString(nsMapOrId)) {
    id = nsMapOrId;
    map = nsMap;
  } else {
    map = nsMapOrId;
  }

  map = map ?? {} as any;

  return Object.keys(map).reduce((ns, fnName) => {
    const fn = map[fnName];

    return {
      ...ns,
      [fnName]: traceFn({ className: id, fnName }, fn),
    };
  }, {} as TMap);
};

//#####################################################
// Class Method Trace
//#####################################################
/**
 * This function going to trace class methods.
 *
 * @param config - Trace context config options.
 */
function trace(config: ITraceFnConfig = {}) {
  return function traceDecorator(...decArgs: any[]) {
    if (decArgs.length !== 3 || typeof decArgs[2] === "number") {
      throw new Error("Method does not allow decoration");
    }

    /* eslint-disable prefer-destructuring */
    const target: {
      name: string;
      constructor: {
        name: string;
      };
    } = decArgs[0];

    const descriptor: PropertyDescriptor = decArgs[2];
    /* eslint-enable prefer-destructuring */

    const originalMethod = descriptor.value;
    const methodName = originalMethod.name;
    const fnArgNames = getFnArgNames(originalMethod);

    descriptor.value = function value(...args: any[]) {
      /**
       * When decorated method is a static one target.name going
       * to be the class name. Otherwise, if decorated method is
       * an instance method then target.name is undefined and we
       * get the class name from constructor name.
       */
      const className = target.name || target.constructor.name;

      return traceFn({
        ...config,
        className,
        fnArgNames,
        fnArgs: args[0],
        fnName: config.fnName ?? methodName,
        originalFn: originalMethod,
      }, originalMethod.bind(this)).apply(this, args);
    };
  };
}

//#####################################################
// Exports
//#####################################################
export {
  trace,
  TraceContext as default,
  traceFn,
  traceNs,
};
