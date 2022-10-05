import {
  initTracer,
  Tracer as JaegerTracer,
  Span as JaegerSpan,
} from "jaeger-client";
import { nanoid } from "nanoid";

import TraceContext from "../context";
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
interface IJaegerTraceDriverConfig {
  host?: string;
}

//#####################################################
// Constants
//#####################################################
// Tracer key id
const TRACE_ID = "uber-trace-id";

//#####################################################
// Auxiliary Classes
//#####################################################
/**
 * This class implements the ITraceDriverSpan interface
 * for a sentry span.
 */
class JaegerTraceDriverSpan implements ITraceDriverSpan {
  /**
   * The jaeger driver (or client).
   */
  private readonly _tracer: JaegerTracer;

  /**
   * The underlying jaeger span.
   */
  private readonly _span: JaegerSpan;

  /**
   * Creates a new span instance.
   *
   * @param tracer - The tracer instance.
   * @param span - Sentry span instance.
   */
  constructor(tracer: JaegerTracer, span: JaegerSpan) {
    this._tracer = tracer;
    this._span = span;
  }

  /**
   * Gets the span id.
   */
  get id() {
    return "cole";
  }

  /**
   * Gets the trace id.
   */
  get traceId() {
    return "cole";
  }

  /**
   * Getter for status.
   */
  get status() {
    return SpanStatus.OK;
  }

  /**
   * This function going to create a child span of this span.
   *
   * @param opName -
   *  The operation name associated with the span to be created.
   * @param _config -
   *  Set of config options to drive the span creation.
   */
  public childStart(
    opName: string,
    _config?: ITraceDriverSpanConfig,
  ) {
    return new JaegerTraceDriverSpan(
      this._tracer,
      this._tracer.startSpan(opName, {
        childOf: {
          id: this.id,
        },
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
    if (!this._span) {
      return nanoid();
    }

    const headers = {
      [TRACE_ID]: "",
    };

    this._tracer.inject(this._span, "http_headers", headers);

    return headers[TRACE_ID];
  }
}

//#####################################################
// Main class
//#####################################################
/**
 * This class implements a jaeger tracer.
 */
class JaegerTraceDriver implements ITraceDriver {
  /**
   * The jaeger driver (or client).
   */
  private _tracer: JaegerTracer;

  /**
   * Jaeger server host.
   */
  private readonly _host: string;

  /**
   * This function creates a new jaeger tracer instance.
   *
   * @param config - The config options.
   */
  constructor(config: IJaegerTraceDriverConfig) {
    this._host = config.host || "localhost";
  }

  /**
   * This function going to initialize the driver.
   */
  public init() {
    this._tracer = initTracer({
      reporter: {
        agentHost: this._host,
      },
      sampler: {
        host: this._host,
        param: 1,
        type: "const",
      },
      serviceName: TraceContext.serviceName,
    }, {
      logger: TraceContext.logger,
    });
  }

  /**
   * This function going to set the current authenticated user
   * and associate all trace requests to this user.
   *
   * @param _user - The user info.
   */
  public setUser(_user: ITraceContextUser) {
    // Do nothing
  }

  /**
   * This function starts a new span.
   *
   * @param opName - Name of the operation to be traced.
   * @param config - A set of config options.
   */
  public spanStart(
    opName: string,
    config?: ITraceDriverSpanConfig,
  ): ITraceDriverSpan {
    if (config.parentHash) {
      const span = this._tracer.extract("http_headers", {
        [TRACE_ID]: config.parentHash,
      }) as JaegerSpan;

      return new JaegerTraceDriverSpan(this._tracer, span);
    }

    return new JaegerTraceDriverSpan(
      this._tracer,
      this._tracer.startSpan(opName, config as object),
    );
  }

  /**
   * This function going to use the client to sent an error
   * notification to Sentry.
   *
   * @param _error - The error to notify.
   */
  public errorNotify(_error: Error) {
    // Do nothing.
  }
}

//#####################################################
// Export
//#####################################################
export {
  JaegerTraceDriver as default,
};
