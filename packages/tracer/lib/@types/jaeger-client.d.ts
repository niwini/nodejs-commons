/* eslint-disable @typescript-eslint/interface-name-prefix */

declare module "jaeger-client" {
  interface Span {
    finish(finishTime?: number): any;
  }

  interface Logger {
    info(message: string, data?: any): any;
  }

  interface Reporter {
    report?(span: Span): any;
    name?(): string;
    close?(callback?: () => void): any;
  }

  interface ReporterConfig {
    logSpans?: boolean;
    agentHost?: string;
    agentPort?: number;
  }

  interface SamplerConfig {
    host?: string;
    port?: number;
    type?: string;
    param: number;
  }

  interface Config {
    serviceName: string;
    disable?: boolean;
    reporter?: ReporterConfig;
    sampler?: SamplerConfig;
  }

  interface Opts {
    metrics?: string;
    reporter?: Reporter;
    logger?: Logger;
  }

  interface SpanContext {
    id?: string;
  }

  interface StartSpanOptions {
    operationName?: string;
    childOf?: SpanContext;
    references?: string[];
    tags?: object;
    startTime?: number;
  }

  /**
   * This class implements a tracer.
   */
  class Tracer {
    public startSpan(operationName: string, options?: StartSpanOptions): Span;

    public inject(span: Span, format: string, headers: object): object;

    public extract(format: string, headers: object): object;
  }

  function initTracer(config: Config, options?: Opts): Tracer;

  export {
    Config,
    initTracer,
    Logger,
    Opts,
    Reporter,
    ReporterConfig,
    SamplerConfig,
    Span,
    SpanContext,
    StartSpanOptions,
    Tracer,
  };
}
