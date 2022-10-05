import * as Sentry from "@sentry/node";

import SentryTraceDriver from "./sentry";

//#####################################################
// Main Class
//#####################################################
/**
 * This is the main class.
 */
class SentryNodeJsTraceDriver extends SentryTraceDriver {
  /**
   * This function going to create a new sentry trace driver
   * instance using sentry browser client under the hood.
   *
   * @param config - Set of config options.
   */
  constructor(config: Sentry.NodeOptions) {
    super();

    this._config = config;
    this._client = Sentry;
  }
}

//#####################################################
// Exports
//#####################################################
export {
  SentryNodeJsTraceDriver as default,
};
