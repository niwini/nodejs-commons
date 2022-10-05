import * as Tracing from "@sentry/tracing";

import {
  ITraceContextUser,
  ITraceDriver,
  ITraceDriverSpan,
  ITraceDriverSpanConfig,
  SpanStatus,
} from "../types";

//#####################################################
// Types
//#####################################################
interface ISentrySpanContext {
  data?: { [key: string]: any };
  op?: string;
  status?: Tracing.SpanStatusType;
  tags?: { [key: string]: string | boolean | number };
}

export interface ISentryTransactionContext extends ISentrySpanContext {
  name: string;
}

interface ISentrySpan {
  spanId: string;
  traceId: string;
  status?: string;
  startChild: (ctx: ISentrySpanContext) => ISentrySpan;
  toTraceparent: () => string;
  finish: () => void;
}

interface ISentryTransaction extends ISentrySpan {
}

interface ISentryUser {
  id?: string;
  username?: string;
  email?: string;
  ip_address?: string;
}

interface ISentryClient {
  captureException: (error: Error) => void;
  init: (config: any) => void;
  setUser: <TUser extends ISentryUser>(user: TUser) => void;
  startTransaction: (
    ctx: ISentryTransactionContext,
    samplingCtx?: any
  ) => ISentryTransaction;
}

//#####################################################
// Auxiliary Classes
//#####################################################
/**
 * This class implements the ITraceDriverSpan interface
 * for a sentry span.
 */
class SentryTraceDriverSpan implements ITraceDriverSpan {
  private readonly _span: ISentrySpan;

  /**
   * This function going to convert our span status to
   * their span status.
   *
   * @param status - Our span status.
   */
  public static ourSpanStatusToTheir(
    status?: SpanStatus,
  ): Tracing.SpanStatusType {
    if (!status) {
      return null;
    }

    switch (status) {
      case SpanStatus.ABORTED:
        return "aborted";
      case SpanStatus.ALREADY_EXISTS:
        return "already_exists";
      case SpanStatus.CANCELLED:
        return "cancelled";
      case SpanStatus.DATA_LOSS:
        return "data_loss";
      case SpanStatus.DEADLINE_EXCEEDED:
        return "deadline_exceeded";
      case SpanStatus.FAILED_PRECONDITION:
        return "failed_precondition";
      case SpanStatus.INTERNAL_ERROR:
        return "internal_error";
      case SpanStatus.INVALID_ARGUMENT:
        return "invalid_argument";
      case SpanStatus.NOT_FOUND:
        return "not_found";
      case SpanStatus.OK:
        return "ok";
      case SpanStatus.OUT_OF_RANGE:
        return "out_of_range";
      case SpanStatus.PERMISSION_DENIED:
        return "permission_denied";
      case SpanStatus.RESOURCE_EXHAUSTED:
        return "resource_exhausted";
      case SpanStatus.UNAUTHENTICATED:
        return "unauthenticated";
      case SpanStatus.UNAVAILABLE:
        return "unavailable";
      case SpanStatus.UNIMPLEMENTED:
        return "unimplemented";
      case SpanStatus.UNKNOWN_ERROR:
        return "unknown_error";
      default:
        return null;
    }
  }

  /**
   * This function going to convert our span status to
   * their span status.
   *
   * @param status - Our span status.
   */
  public static theirSpanStatusToOur(
    status?: Tracing.SpanStatusType,
  ): SpanStatus {
    if (!status) {
      return null;
    }

    switch (status) {
      case "aborted":
        return SpanStatus.ABORTED;
      case "already_exists":
        return SpanStatus.ALREADY_EXISTS;
      case "cancelled":
        return SpanStatus.CANCELLED;
      case "data_loss":
        return SpanStatus.DATA_LOSS;
      case "deadline_exceeded":
        return SpanStatus.DEADLINE_EXCEEDED;
      case "failed_precondition":
        return SpanStatus.FAILED_PRECONDITION;
      case "internal_error":
        return SpanStatus.INTERNAL_ERROR;
      case "invalid_argument":
        return SpanStatus.INVALID_ARGUMENT;
      case "not_found":
        return SpanStatus.NOT_FOUND;
      case "ok":
        return SpanStatus.OK;
      case "out_of_range":
        return SpanStatus.OUT_OF_RANGE;
      case "permission_denied":
        return SpanStatus.PERMISSION_DENIED;
      case "resource_exhausted":
        return SpanStatus.RESOURCE_EXHAUSTED;
      case "unauthenticated":
        return SpanStatus.UNAUTHENTICATED;
      case "unavailable":
        return SpanStatus.UNAVAILABLE;
      case "unimplemented":
        return SpanStatus.UNIMPLEMENTED;
      case "unknown_error":
        return SpanStatus.UNKNOWN_ERROR;
      default:
        return null;
    }
  }

  /**
   * Creates a new span instance.
   *
   * @param span - Sentry span instance.
   */
  constructor(span: ISentrySpan) {
    this._span = span;
  }

  /**
   * Gets the span id.
   */
  get id() {
    return this._span.spanId;
  }

  /**
   * Gets the trace id.
   */
  get traceId() {
    return this._span.traceId;
  }

  /**
   * Getter for span status.
   */
  get status() {
    return SentryTraceDriverSpan.theirSpanStatusToOur(
      this._span.status as any,
    );
  }

  /**
   * Setter for span status.
   */
  set status(
    status: SpanStatus,
  ) {
    this._span.status = SentryTraceDriverSpan.ourSpanStatusToTheir(status);
  }

  /**
   * This function going to create a child span of this span.
   *
   * @param opName -
   *  The operation name associated with the span to be created.
   * @param config -
   *  Set of config options to drive the span creation.
   */
  public childStart(
    opName: string,
    config?: ITraceDriverSpanConfig,
  ) {
    return new SentryTraceDriverSpan(
      this._span.startChild({
        data: config.data,
        op: opName,
        status: SentryTraceDriverSpan.ourSpanStatusToTheir(config.status),
        tags: config.tags,
      }),
    );
  }

  /**
   * This function going to finish the underlying span.
   */
  public finish() {
    this._span.finish();
  }

  /**
   * This function going to encode this span in a hash string.
   */
  public toHash() {
    /**
     * Function toTraceparent is defined here in the following
     * source file. Sentry encodes the span in a string form and
     * send it over from frontend to backend in the sentry-trace
     * request header.
     *
     * https://github.com/getsentry/sentry-javascript/blob/a6f8dc26a4c7ae2146ae64995a2018c8578896a6/packages/tracing/src/span.ts#L241
     */
    return this._span.toTraceparent();
  }
}

//#####################################################
// Main Class
//#####################################################
/**
 * This class implements an abstract blueprint for
 * sentry trace driver. Any sentry trace driver needs to
 * inherit from this.
 */
abstract class SentryTraceDriver implements ITraceDriver {
  /**
   * The main sentry client to use.
   */
  protected _client: ISentryClient;

  /**
   * The config options we should use to initialize sentry
   * client.
   */
  protected _config: any;

  /**
   * This function going to initialize this driver.
   */
  public async init() {
    if (!this._client) {
      throw new Error("sentry client not set");
    }

    this._client.init(this._config);
  }

  /**
   * This function going to set the current authenticated user
   * and associate all trace requests to this user.
   *
   * @param user - The user info.
   */
  public setUser(user: ITraceContextUser) {
    this._client.setUser(user);
  }

  /**
   * This function going to start a new span.
   *
   * @param opName -
   *  The operation name associated with the span to be created.
   * @param config -
   *  Set of config options to drive the span creation.
   */
  public spanStart(
    opName: string,
    config: ITraceDriverSpanConfig = {},
  ): ITraceDriverSpan {
    if (!config.parent) {
      let parentData: any = {};

      if (config.parentHash) {
        /**
         * The function `extractTraceparentData` is defined in the
         * following source file:
         *
         * https://github.com/getsentry/sentry-javascript/blob/dcdb1130586e3a4d42b3611b41952f329a8da94e/packages/tracing/src/utils.ts#L35
         *
         * and it's used in the following source file to start a new
         * sentry transaction with traceparent id request header:
         *
         * https://github.com/getsentry/sentry-javascript/blob/dcdb1130586e3a4d42b3611b41952f329a8da94e/packages/node/src/handlers.ts#L46
         */
        parentData = Tracing.extractTraceparentData(config.parentHash);
      }

      // Start a root span as a transaction.
      return new SentryTraceDriverSpan(
        this._client.startTransaction({
          data: config.data,
          name: opName,
          op: opName,
          status: SentryTraceDriverSpan.ourSpanStatusToTheir(config.status),
          tags: config.tags,
          ...parentData,
        }),
      );
    }

    return config.parent.childStart(opName, config);
  }

  /**
   * This function going to use the client to sent an error
   * notification to Sentry.
   *
   * @param error - The error to notify.
   */
  public errorNotify(error: Error) {
    this._client.captureException(error);
  }
}

//#####################################################
// Exports
//#####################################################
export {
  SentryTraceDriver as default,
};
