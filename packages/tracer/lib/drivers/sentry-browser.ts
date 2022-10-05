import * as Sentry from "@sentry/browser";

import SentryTraceDriver from "./sentry";

//#####################################################
// Main Class
//#####################################################
/**
 * This is the main class.
 */
class SentryBrowserTraceDriver extends SentryTraceDriver {
  /**
   * This function going to create a new sentry trace driver
   * instance using sentry browser client under the hood.
   *
   * @param config - Set of config options.
   */
  constructor(config: Sentry.BrowserOptions) {
    super();

    this._config = config;
    this._client = Sentry;
  }
}

//#####################################################
// Exports
//#####################################################
export {
  SentryBrowserTraceDriver as default,
};
