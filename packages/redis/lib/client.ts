import {
  trace,
  TraceContext,
} from "@niwini/tracer";
import { resolveUrlPort, getUrlParts } from "@niwini/utils";
import Redis, { RedisOptions } from "ioredis";

//#####################################################
// Types
//#####################################################
type KeyType = string | Buffer;

/**
 * Interface for redis driver which going to be used
 * under the hood to communicate with redis.
 */
interface IRedisDriver {
  get(
    key: KeyType,
    callback: (error: Error, res: string | null) => void,
  ): void;
  expire(
    key: KeyType,
    seconds: number,
    callback: (error: Error, res: number) => void,
  ): void;
  set(
    key: KeyType,
    value: any,
    callback: (error: Error, res: string) => void,
  ): void;
  set(
    key: KeyType,
    value: any,
    expiryMode: string,
    time: number | string,
    callback: (error: Error, res: string) => void,
  ): void;
  quit(
    callback: (error: Error, res: string) => void,
  ): void;
}

/**
 * Config we can pass to our own redis client.
 */
interface IClientConfig {
  _redisDriver?: IRedisDriver;
  url?: string;
  host?: string;
  port?: number;
  index?: number;
  namespace?: string;
}

//#####################################################
// Main class
//#####################################################
/**
 * This class implements a basic wrapper around mongo driver.
 */
class RedisClient {
  /**
   * Shared instance.
   */
  private static _shared: RedisClient;

  /**
   * Store created redis clients statically so we can reuse them.
   */
  private static readonly _drivers: {
    [key: string]: IRedisDriver;
  } = {};

  /**
   * This function either retrieves a redis client, if it's already created, or initializes one (uses the Singleton pattern).
   *
   * @param config - Options passed down to the redis client, used to create it with a particular configuration.
   */
  public static sharedInit(
    config: IClientConfig,
  ): RedisClient {
    if (!RedisClient._shared) {
      RedisClient._shared = new RedisClient(config);
    }

    return RedisClient._shared;
  }

  /**
   * Get shared driver.
   */
  public static get shared() {
    if (!RedisClient._shared) {
      throw new Error("redis shared client not initialized");
    }

    return RedisClient._shared;
  }

  /**
   * Check if shared instance exists.
   */
  public static sharedExists() {
    return Boolean(RedisClient._shared);
  }

  /**
   * Private driver.
   */
  private _driver: IRedisDriver;

  /**
   * This function returns the instance of the client.
   */
  get driver() {
    return this._driver;
  }

  /**
   * The feature which this client is related with.
   */
  private _namespace: string;

  /**
   * Value that tells whether or not this class finished its initialization.
   */
  private readonly _initialized: Promise<void>;

  /**
   * This function returns the initialized attribute.
   */
  get initialized() {
    return this._initialized;
  }

  /**
   *
   * @param config - A set of config options to be passed down to redis client.
   */
  constructor(config: IClientConfig) {
    this._namespace = config.namespace ?? "";
    this._initialized = this.init(config);
  }

  /**
   * This method puts the namespace prefix before the key and returns it.
   *
   * @param key - The key to be inserted.
   */
  private _getNamespacedKey(key: string) {
    return this._namespace
      ? `${this._namespace}_${key}`
      : key;
  }

  /**
   *
   * @param config - A set of config options.
   */
  @trace()
  public async init(config: IClientConfig) {
    this._driver = config._redisDriver
      ? config._redisDriver
      : await this.createDriver(config);

    this._namespace = config.namespace
      ? config.namespace
      : null;
  }

  /**
   *
   * @param config - A set of config options.
   * @param $ctx - Trace context.
   */
  @trace()
  public async createDriver(
    config: IClientConfig,
    $ctx?: TraceContext,
  ): Promise<IRedisDriver> {
    const url = config.url ?? `${config.host}:${config.port}`;
    const driverConfig: RedisOptions = {
      db: config.index ?? 0,
      family: 4,
    };

    // Resolve URL
    let urlParts;

    try {
      urlParts = await resolveUrlPort(url);
    } catch (error) {
      $ctx.logger.error("could not resolve url parts", error);
      urlParts = getUrlParts("url");
    }

    driverConfig.host = urlParts.hostname;
    driverConfig.port = urlParts.port;

    // Check if we already got a client for that host:port.
    const hostId = `${config.host}:${config.port}`;

    if (RedisClient._drivers[hostId]) {
      return RedisClient._drivers[hostId];
    }

    // Create new redis client.
    const driver = new Redis(driverConfig);

    // Set to available clients for reuse.
    RedisClient._drivers[hostId] = driver;

    // Return driver to caller.
    return driver;
  }

  /**
   *
   * @param key - Key to be inserted into redis.
   * @param value - Value to be inserted with the key into redis.
   * @param expTimeInSec - Expiration time to be set.
   * @param $ctx - Trace context.
   */
  @trace()
  public async set(
    key: string,
    value: any,
    expTimeInSec = 0,
    $ctx?: TraceContext,
  ): Promise<string> {
    // All values to be inserted will be stringified first.
    const valueStr: string = JSON.stringify(value);
    const keyWithNamespace = this._getNamespacedKey(key);

    return new Promise((resolve, reject) => {
      if (expTimeInSec > 0) {
        this._driver.set(
          keyWithNamespace,
          valueStr,
          "EX",
          expTimeInSec,
          (error: Error, reply: string) => {
            if (error) {
              $ctx.logger.error("Error inserting data into redis ", error);
              return reject(error);
            }
            return resolve(reply);
          },
        );
      } else {
        this._driver.set(
          keyWithNamespace,
          valueStr,
          (error: Error, reply: string) => {
            if (error) {
              $ctx.logger.error("Error inserting data into redis ", error);
              return reject(error);
            }
            return resolve(reply);
          },
        );
      }
    });
  }

  /**
   *
   * @param key - Key to get the value from.
   * @param $ctx - Trace context.
   */
  @trace()
  public async get(
    key: string,
    $ctx?: TraceContext,
  ): Promise<any> {
    const keyWithNamespace = this._getNamespacedKey(key);

    return new Promise((resolve, reject) => {
      this._driver.get(keyWithNamespace, (error, reply) => {
        if (error) {
          $ctx.logger.error("Error getting data from redis ", error);
          return reject(error);
        } else if (!reply) {
          return resolve(null);
        }

        /**
         * Let's try to parse the value stored in redis, but if we couldn't
         * parse it let's just return what we got from redis.
         */
        let parsed = reply;

        try {
          parsed = JSON.parse(reply);
        } catch (parseError) {
          $ctx.logger.error("could not parse value");
        }

        return resolve(parsed);
      });
    });
  }

  /**
   *
   * @param key - Key to get the value from.
   * @param expTimeInSec - Expiration time to be set.
   * @param $ctx - Trace context.
   */
  @trace()
  public async expire(
    key: string,
    expTimeInSec: number,
    $ctx?: TraceContext,
  ): Promise<number> {
    const keyWithNamespace = this._getNamespacedKey(key);

    return new Promise((resolve, reject) => {
      this._driver.expire(
        keyWithNamespace,
        expTimeInSec,
        (error, reply) => {
          if (error) {
            $ctx.logger.error("Error setting expire time to key ", error);
            return reject(error);
          }

          if (!reply) {
            return reject(new Error(
              "Expiration time was not set.",
            ));
          }

          return resolve(reply);
        },
      );
    });
  }

  /**
   * This function going to disconnect this client.
   *
   * @param $ctx - Log context.
   */
  @trace()
  public async disconnect(
    $ctx?: TraceContext,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this._driver.quit((error, reply) => {
        if (error) {
          $ctx.logger.error("Error trying to disconnect from redis ", error);
          return reject(error);
        }
        return resolve(reply);
      });
    });
  }
}

//#####################################################
// Export
//#####################################################
export {
  RedisClient,
  IRedisDriver,
  IClientConfig,
};
