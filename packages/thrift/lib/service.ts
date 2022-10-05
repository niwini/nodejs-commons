//#####################################################
// Imports
//#####################################################
import {
  trace,
  TraceContext,
} from "@niwini/tracer";
import {
  getUrlParts,
  IUrlParts,
  resolveUrl,
} from "@niwini/utils";
import _ from "lodash";
import thrift, { ConnectOptions } from "thrift";

//#####################################################
// Types
//#####################################################
type TClientConstructor<TClient> = thrift.TClientConstructor<TClient>;

//#####################################################
// Main class
//#####################################################
/**
 * This class create a base interface for all services.
 */
class ThriftService<TClient> {
  /**
   * Service name for logging and reference.
   */
  private readonly _name: string;

  /**
   * The client used to communicate with service instance.
   */
  private _client: TClient;

  /**
   * The service constructor.
   */
  private readonly _ClientConstructor: TClientConstructor<TClient>; // eslint-disable-line @typescript-eslint/naming-convention

  /**
   * The service connection.
   */
  private _connection: thrift.Connection;

  /**
   * Flag indicating we are disconnected.
   */
  private _isDisconnected = false;

  /**
   * Client getter.
   */
  public get client(): TClient {
    return this._client;
  }

  /**
   * This function creates a new instance of this class.
   *
   * @param name - Service name for logging and reference.
   * @param ClientConstructor - A class to construct an instance of client.
   */
  constructor(name: string, ClientConstructor?: TClientConstructor<TClient>) { // eslint-disable-line @typescript-eslint/naming-convention
    this._name = name;
    this._ClientConstructor = ClientConstructor;
  }

  /**
   * This function connects this service to a remote service instance.
   *
   * @param url - Service url.
   * @param opts - Config options.
   * @param opts.debug - Flag to enable debug logs on thrift connection.
   * @param opts.retryMaxAttemps - Maximum number of retry attemps before giving up.
   * @param opts.retryMaxDelay - Delay in milliseconds between consecutive retry attemps.
   * @param $ctx - Trace context.
   */
  @trace()
  public async connect(
    url: string,
    opts: {
      debug?: boolean;
      retryMaxAttemps?: number;
      retryMaxDelay?: number;
    } = {},
    $ctx?: TraceContext,
  ): Promise<void> {
    const name = this._name;

    /* eslint-disable @typescript-eslint/no-magic-numbers */
    const thriftOpts: ConnectOptions = {
      connect_timeout: _.defaultTo(opts.retryMaxAttemps, 1000),
      debug: _.defaultTo(opts.debug, true),
      max_attempts: _.defaultTo(opts.retryMaxAttemps, 1000),
      retry_max_delay: _.defaultTo(opts.retryMaxDelay, 5000),
    };
    /* eslint-enable @typescript-eslint/no-magic-numbers */

    return new Promise((resolve) => {
      /**
       * This function create a new connection.
       *
       * @param urlParts - The url object of target service.
       */
      const createConnection = (urlParts: IUrlParts): void => {
        this._connection = thrift.createConnection(
          urlParts.hostname,
          urlParts.port,
          thriftOpts,
        );

        const parts = urlParts.hostname.split(".");
        const serviceName = name || (parts.length > 0 ? parts[0] : null);

        this._client = thrift.createClient(
          this._ClientConstructor,
          this._connection,
        );

        /**
         * BUG : Right now thrift checks for "close" event when
         * a net.connection is down but the event that gets called
         * is "end".
         */
        this._connection.connection.on("end", () => {
          if (!this._isDisconnected) {
            $ctx.logger.warn(`service "${serviceName}" got disconnected`);

            /**
             * Thrift way to do retry logic is not working properly
             * via the function `this._connection.connection_gone()`
             * so we are going to implement our own logic which is
             * basically recreate the connection after some time.
             */
            setTimeout(
              () => createConnection(urlParts),
              thriftOpts.retry_max_delay,
            );
          }
        });

        this._connection.on("connect", () => {
          if (serviceName) {
            $ctx.logger.debug(`service "${serviceName}" connected`);
          }

          resolve();
        });

        // On error, log it.
        this._connection.on("error", (error) => {
          /**
           * Server is down.
           */
          if (error.code === "ECONNREFUSED") {
            $ctx.logger.warn(`service "${serviceName}" is not available yet`);

            this._connection.end();

            setTimeout(
              () => createConnection(urlParts),
              thriftOpts.retry_max_delay,
            );

            return;
          }

          $ctx.logger.error(`service "${serviceName}" connection error`, error);
        });
      };

      const originalUrlParts = getUrlParts(url);

      // If no port was provided, then let's try to get it.
      if (originalUrlParts.port) {
        createConnection(originalUrlParts);
      } else {
        resolveUrl(originalUrlParts.hostname).then((newUrlParts) => {
          $ctx.logger.debug(
            `service address resolved : ${url}`,
            newUrlParts.port,
          );
          createConnection(newUrlParts);
        }).catch((error) => {
          $ctx.logger.error("could not resolve url", error);
        });
      }
    });
  }

  /**
   * This function disconnects this service from a remote
   * service instance.
   */
  @trace()
  public disconnect(): void {
    if (this._connection) {
      this._isDisconnected = true;
      this._connection.end();
    }
  }
}

//#####################################################
// Export
//#####################################################
export {
  ThriftService as default,
};
