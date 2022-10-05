import {
  trace,
  TraceContext,
} from "@niwini/tracer";
import {
  getUrlParts,
  resolveUrlPort,
} from "@niwini/utils";
import dayjs from "dayjs";
import lodash from "lodash";
import {
  Db,
  MongoClient as MongoDriver,
  MongoClientOptions,
  ObjectId,
  OptionalId,
  Sort,
  SortDirection,
} from "mongodb";

//#####################################################
// Types
//#####################################################
interface IMongoClient {
  db: (name: string) => Partial<Db>;
  close: () => Promise<void>;
}

/**
 * @todo : Maybe a better name for this is IMongoConnector.
 */
interface IMongoDriver {
  connect: (url: string, opts?: MongoClientOptions) => Promise<IMongoClient>;
}

interface IMongoClientConfig {
  driver?: IMongoDriver;
}

export interface IMongoConnectArgs {
  dbName?: string;
  url: string;
}

export interface IMongoCursor<T> {
  limit: (value: number) => IMongoCursor<T>;
  sort: (
    opts: Sort,
    direction?: SortDirection,
  ) => IMongoCursor<T>;
  toArray: () => Promise<T[]>;
}

interface IStringMap {
  [key: string]: any;
}

type INewable<TTypeA, TTypeB> = new (d: TTypeA) => TTypeB;

//#####################################################
// Auxiliary functions
//#####################################################
/**
 * This is a base mock for find cursor.
 *
 * @param overrides - A set of cursor properties to be ovewritten.
 */
function createFindCursorMock<T>(
  overrides: Partial<IMongoCursor<T>>,
): IMongoCursor<T> {
  return {
    /**
     * This function returns a cursor after limit.
     *
     * @param _value - The limit value.
     */
    limit(_value: any) { // eslint-disable-line @typescript-eslint/no-unused-vars
      return this;
    },

    /**
     * This function returns a cursor after sort.
     *
     * @param _opts - The sort opts.
     */
    sort(_opts: any) { // eslint-disable-line @typescript-eslint/no-unused-vars
      return this;
    },

    /**
     * This function returns a mock toArray.
     */
    async toArray() {
      return Promise.resolve([]);
    },

    ...overrides,
  };
}

/**
 * This function parse dates and other data that comes from
 * mongo and that we wish to pass to thrift (which allow only
 * primitive data types).
 *
 * @param results - Data to be parsed.
 * @param DataClass - A class which should be applied to each
 * result.
 * @param mapFn - A function to process items.
 */
function parseMongoResultsForThrift<TTypeA extends IStringMap, TTypeB>(
  results: OptionalId<Omit<TTypeA, "_id">>[],
  DataClass: INewable<TTypeA, TTypeB>, // eslint-disable-line @typescript-eslint/naming-convention
  mapFn?: (item: TTypeA) => TTypeA,
) {
  const parsedResults: TTypeB[] = [];

  lodash.forEach(results, (result) => {
    let resultClone: TTypeA = {} as any;

    lodash.forEach(result, (value: any, key: string) => {
      if (lodash.isDate(value)) {
        lodash.set(resultClone, key, dayjs(value).toISOString());
      } else if (value instanceof ObjectId) {
        lodash.set(resultClone, key, lodash.toString(value));
      } else {
        lodash.set(resultClone, key, value);
      }
    });

    if (mapFn) {
      resultClone = mapFn(resultClone);
    }

    parsedResults.push(new DataClass(resultClone));
  });

  return parsedResults;
}

/**
 * This function convert a search query to a mongo
 * query so we can perform queries in mongo.
 *
 * @deprecated - Use new search module instead.
 *
 * @param searchParams - The search params to be parsed.
 * @param filterStrategyMap - An object mapping a strategy
 * key (like 'in', 'range', etc) to a list of searchParams
 * keys.
 * @param _ctx - A log context.
 */
function parseSearchQueryToMongoQuery(
  searchParams: {[key: string]: any},
  filterStrategyMap: {[key: string]: string[]} = {},
) {
  const mongoQuery: any = {};
  const keys = Object.keys(searchParams);

  for (const key of keys) {
    const value: any = (searchParams as any)[key]; // eslint-disable-line no-extra-parens

    if (value === null) {
      continue;
    }

    /**
     * Process "$in" strategy.
     */
    if (
      filterStrategyMap.$eq
      && filterStrategyMap.$eq.includes(key)
    ) {
      mongoQuery[key] = value;
    } else if (
      filterStrategyMap.$regex
      && filterStrategyMap.$regex.includes(key)
    ) {
      /**
       * Mongo db supports both syntaxes for regex match:
       * • key: { $regex: value }
       * • key: value (where value = /pattern/options).
       *
       * We going to use the second form here and therefore
       * we need to ensure value is in form /pattern/options.
       */
      mongoQuery[key] = value;
    } else if (
      filterStrategyMap.$in
      && filterStrategyMap.$in.includes(key)
    ) {
      mongoQuery[key] = { $in: value };
    } else if (
      filterStrategyMap.$range
      && filterStrategyMap.$range.includes(key)
    ) {
      const compKeys = Object.keys(value);
      const compQuery: any = {};

      for (const compKey of compKeys) {
        const compValue = value[compKey];

        if (compKey === null) {
          continue;
        }

        compQuery[`$${compKey}`] = compValue;
      }

      if (lodash.size(compQuery) > 0) {
        mongoQuery[key] = compQuery;
      }
    } else if (key === "includeDeleted" && value) {
      mongoQuery.deletedAt = {
        $type: "null",
      };
    }
  }

  return mongoQuery;
}

//#####################################################
// Main class
//#####################################################
/**
 * This class implements a basic wrapper around mongo driver.
 */
class MongoClient {
  /**
   * The shared instance of this mongo client.
   */
  private static _shared: MongoClient;

  /**
   * This function initializes a shared instance of
   * mongoClient.
   *
   * @param _$ctx - Trace context.
   */
  @trace()
  public static sharedInit(
    _$ctx?: TraceContext,
  ): MongoClient {
    if (!MongoClient._shared) {
      MongoClient._shared = new MongoClient();
    }

    return MongoClient._shared;
  }

  /**
   * This function gets the shared instance.
   */
  public static get shared() {
    if (!MongoClient._shared) {
      throw new Error("mongo shared client not initialized");
    }

    return MongoClient._shared;
  }

  /**
   * Check if shared instance exists.
   */
  public static sharedExists() {
    return Boolean(MongoClient._shared);
  }

  /**
   * This function generates a name id based on a specific name.
   *
   * @param args - The list of arguments.
   * @param args.nameValue - The base name.
   * @param args.nameKey - The document key where name is stored.
   * @param args.collection - A collection that should drive the find process.
   * @param args.collection.find - Find method to get items from collection.
   * @param args.extraQueryParams - An extra query params to drive the find process.
   * @param args.type - Name id type we should generate.
   * @param args.forceSuffix - Force adding a suffix.
   * @param $ctx - Trace context.
   */
  @trace()
  public static async generateNameId(
    args: {
      nameValue: string;
      nameKey: string;
      collection: {
        find?: (query: any, opts: any) => IMongoCursor<any>;
      };
      extraQueryParams?: object;
      type?: string;
      forceSuffix?: boolean;
    },
    $ctx?: TraceContext,
  ) {
    let records: any[];
    const typeParts = args.type ? args.type.split(":") : ["name"];
    const [type, ...typeOpts] = typeParts;

    let fullNameValue = lodash.kebabCase(args.nameValue);
    let nameValue = fullNameValue;

    if (type === "initials") {
      const size = typeOpts.length
        ? parseInt(typeOpts[0], 10)
        : 3;

      fullNameValue = args.nameValue.replace(" ", "").toUpperCase();
      nameValue = fullNameValue.substr(0, size);
    }

    const query = {
      ...args.extraQueryParams,
      [args.nameKey]: new RegExp(nameValue, "gi"),
    };

    try {
      records = await args.collection.find(
        query,
        { [args.nameKey]: 1 },
      ).toArray();
    } catch (error) {
      $ctx.logger.error("collection find error", error);
      throw error;
    }

    // Iterate over results to get available nameId.
    let count = 0;
    const unavailableNames = lodash.reduce(
      records,
      (map: any, record) => {
        map[record[args.nameKey]] = 1;
        return map;
      },
      {},
    );

    $ctx.logger.debug("unavailableNames", unavailableNames);

    const MAX_TRIES_COUNT = 10000000;

    while (count < MAX_TRIES_COUNT) {
      let inc = args.forceSuffix
        ? `-${count + 1}`
        : count > 0
          ? `-${count}`
          : "";

      if (type === "initials") {
        const incStr = fullNameValue.substr(
          nameValue.length,
          count,
        );

        inc = nameValue.length + count > fullNameValue.length
          ? `${incStr}${count - nameValue.length}`
          : incStr;
      }

      const tryNameValue = `${nameValue}${inc}`;

      $ctx.logger.debug(`check nameValue = ${tryNameValue}`);

      if (!unavailableNames[tryNameValue]) {
        $ctx.logger.debug(`nameValue "${tryNameValue}" is available`);
        return tryNameValue;
      }

      count++;
    }

    throw new Error("could not generate name");
  }

  /**
   * The main mongo driver.
   */
  private readonly _driver: IMongoDriver;

  /**
   * The internal mongo client.
   */
  private _internalClient: IMongoClient;

  /**
   * This represent a connection to a specific database.
   */
  private _db: Partial<Db>;

  /**
   * Public getter for dabatase connection representation.
   */
  public get db() {
    return this._db;
  }

  /**
   * This function creates a new instance.
   *
   * @param config - A set of config options.
   */
  constructor(config: IMongoClientConfig = {}) {
    this._driver = config.driver ?? MongoDriver;
  }

  /**
   * This function stabilish a connection with a remoto mongo instance.
   *
   * @param args - Connect arguments.
   * @param args.host - The mongo instance base host url.
   * @param args.dbName - Database name to connect to.
   * @param args.port - Database port to connect to.
   * @param $ctx - Trace context.
   */
  @trace()
  public async connect(
    args: IMongoConnectArgs,
    $ctx?: TraceContext,
  ) {
    // Prevent double connection.
    if (this._internalClient) {
      return this._db;
    }

    let urlParts = getUrlParts(args.url);

    if (urlParts.hostname && !urlParts.port) {
      try {
        urlParts = await resolveUrlPort(urlParts.hostname);
        $ctx.logger.debug("url resolved", urlParts);
      } catch (error) {
        $ctx.logger.error("could not resolve url", error);
      }
    }

    const fullUrl = `mongodb://${urlParts.hostname}:${urlParts.port}`;
    $ctx.logger.debug("fullUrl", fullUrl);

    try {
      this._internalClient = await this._driver.connect(fullUrl);

      // Select a default db after connect.
      if (args.dbName) {
        this._db = this.selectDb(args.dbName);
      }
    } catch (error) {
      $ctx.logger.error("mongo driver connect error", error);
      throw error;
    }

    return this._db;
  }

  /**
   * This function selects a database.
   *
   * @param dbName - Database name to be selected.
   */
  @trace()
  public selectDb(dbName: string) {
    if (!this._internalClient) {
      throw new Error("Client not connected");
    }

    return this._internalClient.db(dbName) as Db;
  }

  /**
   * This function disconnect from remote db.
   *
   * @param $ctx - Trace context.
   */
  @trace()
  public async disconnect(
    $ctx?: TraceContext,
  ) {
    if (this._internalClient) {
      try {
        await this._internalClient.close();
        this._internalClient = null;
      } catch (error) {
        $ctx.logger.error("mongo driver close error", error);
        throw error;
      }
    }
  }
}

//#####################################################
// Export
//#####################################################
export * from "mongodb"; // eslint-disable-line import/export

export {
  createFindCursorMock,
  MongoClient, // eslint-disable-line import/export
  parseMongoResultsForThrift,
  parseSearchQueryToMongoQuery,
};
