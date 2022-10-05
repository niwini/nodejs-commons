/**
 * This file is intended to prevent circular dependency.
 */

//#####################################################
// Logger Types
//#####################################################
export const LOG_LEVELS = [
  "error",
  "warn",
  "info",
  "debug",
  "verbose",
] as const;

/**
 * Available log levels.
 *
 * Following the next article to make a type consisting of
 * the values contained in array:
 *
 * https://steveholgado.com/typescript-types-from-arrays/#getting-a-type-from-our-array
 */
export type TLogLevel = typeof LOG_LEVELS[number];

/**
 * Log driver meta object.
 */
export interface ILogDriverLogOpts {
  callerInfo?: {
    functionName: string;
    lineNumber: number;
  };
  traceCtx?: ITraceContext; // eslint-disable-line no-use-before-define
}

/**
 * Driver that going to perform the logging.
 */
export interface ILogDriver {
  init(serviceName: string): void;
  log(
    level: TLogLevel,
    message: string,
    data?: any,
    opts?: ILogDriverLogOpts, // eslint-disable-line no-use-before-define
  ): void;
}

/**
 * Log driver config options.
 */
export interface ILogDriverConfig {
  logFilePath?: string;
  logstashUrl?: string;
  logToConsole?: boolean;
}

/**
 * Constructor for the log driver.
 */
export interface ILogDriverStatic {
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  new <TConf extends ILogDriverConfig>(config: TConf): ILogDriver;
}

/**
 * Logger config options.
 */
export interface ILoggerConfig {
  driver?: ILogDriver;
  level?: TLogLevel;
  scope?: string;
  traceCtx?: ITraceContext; // eslint-disable-line no-use-before-define
}

/**
 * Logger log function interface
 */
export type TLoggerLogFn = (message: string, ...data: any[]) => any;

/**
 * Logger interface.
 */
export interface ILogger {
  debug: TLoggerLogFn;
  verbose: TLoggerLogFn;
  info: TLoggerLogFn;
  warn: TLoggerLogFn;
  error: TLoggerLogFn;
  critical: TLoggerLogFn;

  fork: (scope: string) => ILogger;
}

/**
 * Logger class interface
 */
export interface ILoggerStatic {
  level: TLogLevel;

  new (config?: ILoggerConfig): ILogger;
}

//#####################################################
// Tracer Types
//#####################################################
export enum SpanStatus {
  ABORTED = "aborted",
  ALREADY_EXISTS = "already_exists",
  CANCELLED = "cancelled",
  DATA_LOSS = "data_loss",
  DEADLINE_EXCEEDED = "deadline_exceeded",
  FAILED_PRECONDITION = "failed_precondition",
  INTERNAL_ERROR = "internal_error",
  INVALID_ARGUMENT = "invalid_argument",
  NOT_FOUND = "not_found",
  OK = "ok",
  OUT_OF_RANGE = "out_of_range",
  PERMISSION_DENIED = "permission_denied",
  RESOURCE_EXHAUSTED = "resource_exhausted",
  UNAUTHENTICATED = "unauthenticated",
  UNAVAILABLE = "unavailable",
  UNIMPLEMENTED = "unimplemented",
  UNKNOWN_ERROR = "unknown_error",
}

/**
 * The options to create spans.
 */
export interface ITraceDriverSpanConfig {
  data?: { [key: string]: any };
  description?: string;
  parentHash?: string;
  parent?: ITraceDriverSpan; // eslint-disable-line no-use-before-define
  status?: SpanStatus;
  tags?: { [key: string]: string | boolean | number };
}

/**
 * The unit of tracing.
 */
export interface ITraceDriverSpan {
  id: string;
  traceId: string;
  status: SpanStatus;
  childStart(
    opName: string,
    config?: ITraceDriverSpanConfig
  ): ITraceDriverSpan;
  finish(finishTime?: number): void;
  toHash(): string;
}

/**
 * Tracer driver instance interface.
 */
export interface ITraceDriver {
  init(): void;
  errorNotify(error: Error): void;
  setUser: (user: ITraceContextUser) => void; // eslint-disable-line no-use-before-define
  spanStart(
    opName: string,
    config?: ITraceDriverSpanConfig
  ): ITraceDriverSpan;
}

/**
 * Trace driver config options.
 */
export interface ITraceDriverConfig {
}

/**
 * Trace driver class interface.
 */
export interface ITraceDriverStatic {
  // eslint-disable-next-line @typescript-eslint/prefer-function-type, no-use-before-define
  new <TConf extends ITraceDriverConfig>(config: TConf): ITraceDriver;
}

//#####################################################
// Context Types
//#####################################################

export enum TraceContextInjectMode {

  /**
   * With this option we are going to inject context in
   * the first arg object the function receive. The key
   * we add is "$ctx" and this is useful in react or grpc
   * were all arguments are grouped together in a object
   * and passed it over to functions.
   */
  IN_FIRST_ARG_OBJECT = "in_first_arg_object",

  /**
   * With this option we are going to inject the context
   * as a regular argument of a called function. This is
   * the default.
   */
  AS_ARG = "as_last_arg"
}

/**
 * This is the interface for the config options sharedInit
 * function can receive.
 */
export interface ITraceContextSharedInitConfig {

  /**
   * Option to control the context injection mode.
   */
  injectMode?: TraceContextInjectMode;

  /**
   * Log driver to use when creating context loggers.
   */
  logDriver?: ILogDriver;

  /**
   * Force logs above a specific level only.
   */
  logLevel?: TLogLevel;

  /**
   * Flag to log start end of all traced functions.
   */
  shouldLogStartEnd?: boolean;

  /**
   * Color to be used when logging service name.
   */
  serviceColor?: string;

  /**
   * Name of the service under tracing.
   */
  serviceName?: string;

  /**
   * A trace driver to be used to trace function calls.
   */
  traceDriver?: ITraceDriver;

  /**
   * Flag to force record of tracing using the driver.
   */
  shouldRecordTracing?: boolean;
}

/**
 * Set of config options a trace context can receive.
 */
export interface ITraceContextConfig<TData = any> {

  /**
   * Id to be used.
   */
  id?: string;

  /**
   * Flag for enabling auto tracing which going to automatically
   * create a function level span which can then be used inside
   * the function to trace down other parts of the function and
   * to pass it over to other function automatically.
   */
  autoTracing?: boolean;

  /**
   * This is the call stack name we should use instead of trying
   * to go over the parents to build a stack name.
   */
  callStackNamesChain?: ICallStackNamesChainItem[];

  /**
   * The class name this context is associated with.
   */
  className?: string;

  /**
   * Data carried over by this context.
   */
  data?: TData;

  /**
   * File path which contains the function under tracing.
   */
  filePath?: string;

  /**
   * Function arguments.
   */
  fnArgs?: Object;

  /**
   * Lits of function args to log with args name in the logging
   * output.
   */
  fnArgsToLog?: string[];

  /**
   * List of function results to log.
   */
  fnResultsToLog?: string[] | boolean;

  /**
   * Function name under tracing.
   */
  fnName?: string;

  /**
   * The parent trace context on the call stack.
   */
  parent?: ITraceContext; // eslint-disable-line no-use-before-define

  /**
   * Service color associated with this context.
   */
  serviceColor?: string;

  /**
   * Service name associated with this context.
   */
  serviceName?: string;

  /**
   * The span hash to use when creating the root span associated with
   * this context.
   */
  spanHash?: string;
}

/**
 * Trace context user info.
 */
export interface ITraceContextUser {

  /**
   * Internal id used to identify the user.
   */
  id: string;

  /**
   * User name to use instead of user id (like an user alias).
   */
  username?: string;

  /**
   * User email.
   */
  email?: string;
}

export interface ICallStackNamesChainItem {
  fnName: string;
  className?: string;
  serviceName?: string;
}

/**
 * Trace context instance interface.
 */
export interface ITraceContext<TData = any> {

  /**
   * Flag for enabling auto tracing which going to automatically
   * create a function level span which can then be used inside
   * the function to trace down other parts of the function and
   * to pass it over to other function automatically.
   */
  autoTracing: boolean;

  /**
   * This function get the call stack names.
   */
  callStackName: string;

  /**
   * This function get the call stack names chain.
   */
  callStackNamesChain: ICallStackNamesChainItem[];

  /**
   * The class name this context is associated with.
   */
  className: string;

  /**
   * Data carried over by this context.
   */
  data: TData;

  /**
   * Function arguments.
   */
  fnArgs: Object;

  /**
   * Lits of function args to log with args name in the logging
   * output.
   */
  fnArgsToLog: string[];

  /**
   * Function full name including class name.
   */
  fnFullName: string;

  /**
   * List of function results to log.
   */
  fnResultsToLog: string[] | boolean;

  /**
   * Name of the function we are tracing.
   */
  fnName: string;

  /**
   * Path of the file where the function lives.
   */
  filePath: string;

  /**
   * Unique hash id identifying this context.
   */
  id: string;

  /**
   * Flag indicating if this trace context is the shared one.
   */
  isShared: boolean;

  /**
   * A logger instance so we can log stuff related to this
   * context.
   */
  logger: ILogger;

  /**
   * Context associated with a function that called the creation
   * of this context. This way we going to get a stack of contexts.
   */
  parent: ITraceContext;

  /**
   * Color of the service associated with this context.
   */
  serviceColor: string;

  /**
   * Name of the service associated with this context.
   */
  serviceName: string;

  /**
   * This is the trace span associated with this context.
   */
  span: ITraceDriverSpan;

  /**
   * This is the hash representing the span associated with this
   * context.
   */
  spanHash: string;

  /**
   * This function going to notify an error.
   */
  errorNotify: (error: Error) => void;

  /**
   * This function going to start tracing associated with this
   * context.
   */
  traceStart: () => void;

  /**
   * This function going to finish tracing associated with this
   * context.
   */
  traceFinish: (
    status?: SpanStatus,
    data?: any
  ) => void;

  /**
   * This function is used to call another function and auto
   * inject context.
   */
  call: <TArgs = any, TReturn = void>(
    fn: (args: TArgs) => TReturn,
    args: TArgs
  ) => TReturn;

  /**
   * This function going to encode this context into a hash
   * we going to use to trace down requests.
   */
  toHash: () => string;
}

/**
 * Trace context class interface.
 */
export interface ITraceContextClass {
  injectMode: TraceContextInjectMode;
  traceDriver: ITraceDriver;
  logDriver: ILogDriver;
  logger: ILogger;
  logLevel: TLogLevel;
  serviceColor: string;
  serviceName: string;
  shared: ITraceContext;
  user: ITraceContextUser;

  sharedInit: (config: ITraceContextSharedInitConfig) => ITraceContext;
  sharedExists: () => boolean;
  fromHash: (hash: string) => ITraceContext;

  new (config: ITraceContextConfig): ITraceContext;
}

/**
 * Interface for trace hash data we going to exchange
 * between different parties of the tracing.
 */
export interface ITraceHashData<TData = any> {

  /**
   * Id of the trace context.
   */
  id?: string;

  /**
   * Class name that contains the function.
   */
  className?: string;

  /**
   * Data carried over by this context.
   */
  data?: TData;

  /**
   * Name of the function that produced the hash data.
   */
  fnName?: string;

  /**
   * Class stack name.
   */
  callStackNamesChain?: ICallStackNamesChainItem[];

  /**
   * Nome of the service that produced the hash data.
   */
  serviceName?: string;

  /**
   * Span hash we going to use to rebuild the span in
   * upstream service.
   */
  spanHash?: string;
}
