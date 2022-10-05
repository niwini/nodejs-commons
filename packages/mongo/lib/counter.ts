/* eslint-disable import/prefer-default-export */

//#####################################################
// Imports
//#####################################################
import {
  trace,
  TraceContext,
} from "@niwini/tracer";
import {
  Filter,
  UpdateFilter,
  FindOneAndUpdateOptions,
  ReturnDocument,
} from "mongodb";

import { MongoClient, Db } from "./client";

//#####################################################
// Types
//#####################################################
/**
 * Counter data that is stored in db.
 */
interface ICounter {
  _id: string;
  count: number;
}

/**
 * Interface for the insert result.
 */
interface IDbInsertResult {
  insertedId: string | {
    toString: () => string;
  };
}

/**
 * Interface for the insert result.
 */
interface IDbFindOneAndUpdateResult {
  value?: ICounter;
}

/**
 * Interface for mongodb collection driver.
 */
interface ICounterCollection {
  insertOne: (counter: ICounter) => Promise<IDbInsertResult>;
  findOneAndUpdate: (
    filter: Filter<ICounter>,
    update: UpdateFilter<ICounter>,
    option: FindOneAndUpdateOptions,
  ) => Promise<IDbFindOneAndUpdateResult>;
}

/**
 * Interface for counter config options.
 */
interface ICounterConfig {
  mode?: string;
  collection?: ICounterCollection;
  name?: string;
}

//#####################################################
// Main class
//#####################################################
/**
 * This class handles the counters collection.
 */
class Counter {
  /**
   * Shared instance.
   */
  private static _shared: Counter;

  /**
   * This function initializes a shared mongo client.
   *
   * @param config - A set of config options.
   */
  public static async sharedInit(config: ICounterConfig) {
    if (!Counter._shared) {
      Counter._shared = new Counter();

      // Select counter right away.
      if (config.name) {
        await Counter._shared.select(config.name);
      }
    }

    return Counter._shared;
  }

  /**
   * This function gets the shared instance.
   */
  public static get shared() {
    if (!Counter._shared) {
      throw new Error("shared counter not initialized");
    }

    return Counter._shared;
  }

  /**
   * Check if shared instance exists.
   */
  public static sharedExists() {
    return Boolean(Counter._shared);
  }

  /**
   * This function setup the counter collection.
   *
   * @param db - The database connector instance.
   * @param $ctx - Trace context.
   */
  @trace()
  public static async setupCollection(
    db?: Partial<Db>,
    $ctx?: TraceContext,
  ) {
    const dbInstance = db || MongoClient.shared.db;

    // Try to create the collection
    try {
      await dbInstance.createCollection("counters", {
        readPreference: "secondaryPreferred",
      });

      $ctx.logger.debug("collection create success");
    } catch (error) {
      $ctx.logger.error("collection create error", error);
    }
  }

  /**
   * The selected name for this counter.
   */
  private _name: string;

  /**
   * The collection.
   */
  private readonly _collection: ICounterCollection;

  /**
   * This function creates a new instance.
   *
   * @param config - A set of config options.
   */
  constructor(config: ICounterConfig = {}) {
    this._collection = config.collection
      || MongoClient.shared.db.collection("counters");
  }

  /**
   * This function selects an entry in counters collection.
   *
   * @param name - The name of collection to be selected.
   * @param $ctx - Trace context.
   */
  @trace()
  public async select(
    name: string,
    $ctx?: TraceContext,
  ) {
    try {
      const result = await this._collection.insertOne({
        _id: name,
        count: 0,
      });

      $ctx.logger.debug("collection insertOne success", {
        id: result.insertedId,
      });
    } catch (error) {
      $ctx.logger.error("collection insertOne error", error);
    }

    // Set name as selected.
    this._name = name;
  }

  /**
   * This function generate next count for a specific name.
   *
   * @param name - The name of collection that we should get next count.
   * @param $ctx - Trace context.
   */
  @trace()
  public async getNextCount(
    name?: string,
    $ctx?: TraceContext,
  ) {
    if (!name && !this._name) {
      throw new Error("no counter selected");
    }

    const result = await this._collection.findOneAndUpdate(
      {
        _id: name || this._name,
      },
      {
        $inc: { count: 1 },
      },
      {
        returnDocument: ReturnDocument.AFTER,
        upsert: true,
      },
    );

    $ctx.logger.debug("collection findOneAndUpdate success", result);

    return result.value.count;
  }
}

//#####################################################
// Export
//#####################################################
export {
  Counter,
};
