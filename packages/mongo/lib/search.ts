import {
  TraceContext,
} from "@niwini/tracer";
import dayjs from "dayjs";
import lodash from "lodash";
import { ObjectId } from "mongodb";

//#####################################################
// Types
//#####################################################
/**
 * This is the interface for normalized search queries
 * (all databases). We can call this Nosebit search
 * query.
 */
export interface ISearchQuery {
  field?: string;
  transform?: string;

  // Equalities
  _eqStr?: string;
  _eqInt?: number;
  _eqFloat?: number;
  _eqBool?: boolean;
  _eqStrList?: string[];
  _eqIntList?: number[];
  _eqFloatList?: number[];
  _eqBoolList?: boolean[];

  // Inequality
  _neStr?: string;
  _neInt?: number;
  _neFloat?: number;
  _neBool?: boolean;

  // In
  _inStr?: string[];
  _inInt?: number[];
  _inFloat?: number[];
  _inBool?: boolean[];

  // Equalities map.
  _mapEqStr?: Map<string, string>;
  _mapEqInt?: Map<string, number>;
  _mapEqFloat?: Map<string, number>;

  // String regex
  _regex?: string;

  // Range
  _gtStr?: string;
  _gteStr?: string;
  _ltStr?: string;
  _lteStr?: string;

  _gtInt?: number;
  _gteInt?: number;
  _ltInt?: number;
  _lteInt?: number;

  _gtFloat?: number;
  _gteFloat?: number;
  _ltFloat?: number;
  _lteFloat?: number;

  // Nested queries
  _and?: ISearchQuery[];
  _or?: ISearchQuery[];
  _not?: ISearchQuery;
  _elemMatch?: ISearchQuery;
}

/**
 * This is the common interface for params all search methods
 * going to receive (all databases).
 */
export interface ISearchParams {
  query?: ISearchQuery;
  sort?: string[];
  limit?: number;
  includeDeleted?: boolean;
}

/**
 * This is the search params for mongo.
 */
export interface IMongoSearchParams {
  query: {[key: string]: any};
  sort?: {[key: string]: number};
  limit?: number;
}

/**
 * This function parse a primitive type to a more complex type
 * based on type user informed.
 *
 * @param value - The primitive value.
 * @param transform - The type we wish to convert the primitive value to.
 */
function parseValue(
  value: any,
  transform: string,
) {
  switch (transform) {
    case "id": {
      return new ObjectId(value);
    }

    case "idList": {
      return value.map((aValue: any) => new ObjectId(aValue));
    }

    case "date": {
      return dayjs(value).toDate();
    }

    case "null": {
      return { $type: "null" };
    }

    default: {
      break;
    }
  }

  return value === "null" ? null : value;
}

/**
 * This function convert a nosebit search query to a mongo
 * query so we can perform queries in mongo.
 *
 * @param query - The nosebit search query.
 * @param $ctx - Trace context.
 */
function parseSearchQuery(
  query: ISearchQuery,
  $ctx?: TraceContext,
) {
  const searchField = query.field;
  const { transform } = query;
  const mongoQuery: {[key: string]: any} = {};

  if (query._and) {
    mongoQuery.$and = query._and.map((nestedQuery) =>
      parseSearchQuery(nestedQuery, $ctx));
  } else if (query._or) {
    mongoQuery.$or = query._or.map((nestedQuery) =>
      parseSearchQuery(nestedQuery, $ctx));
  } else if (query._not) {
    mongoQuery.$not = parseSearchQuery(query._not, $ctx);
  } else if (query._elemMatch) {
    mongoQuery[searchField] = {
      $elemMatch: parseSearchQuery(query._elemMatch, $ctx),
    };
  } else {
    const keys = Object.keys(query);

    for (const key of keys) {
      const value: any = lodash.get(query, key);

      if (key.startsWith("_map")) {
        value.forEach((mapVal: any, mapKey: string) => {
          mongoQuery[mapKey] = parseValue(mapVal, transform);
        });
      } else if (key.startsWith("_eq")) {
        mongoQuery[searchField] = parseValue(value, transform);
      } else if ((/^_gt|_lt/).test(key)) {
        const opId = key.replace(/_|Str|Int|Float/g, "");

        lodash.set(
          mongoQuery,
          `${searchField}.$${opId}`,
          parseValue(value, transform),
        );
      } else if ((/^_regex$/).test(key)) {
        const match = value.match(/\/([^/]+)\/([^/]+)/);

        if (match) {
          mongoQuery[searchField] = {
            $options: lodash.get(match, "2"),
            $regex: match[1],
          };
        }
      } else if (key.startsWith("_in")) {
        mongoQuery[searchField] = {
          $in: parseValue(value, transform),
        };
      } else if (key.startsWith("_all")) {
        mongoQuery[searchField] = {
          $all: parseValue(value, transform),
        };
      } else if (key.startsWith("_ne")) {
        mongoQuery[searchField] = {
          $ne: parseValue(value, transform),
        };
      } else if (key !== "field") {
        mongoQuery[searchField] = parseValue(value, transform);
      }
    }
  }

  return mongoQuery;
}

/**
 * This function convert a search params to a mongo
 * query so we can perform queries in mongo.
 *
 * @param params - The search params to be parsed.
 * @param $ctx - Trace context.
 */
function parseSearchParams(
  params: ISearchParams,
  $ctx?: TraceContext,
): IMongoSearchParams {
  const { query, sort } = params;

  const result: IMongoSearchParams = {
    query: parseSearchQuery(query),
  };

  if (!params.includeDeleted) {
    result.query = {
      ...result.query,
      deletedAt: { $type: "null" },
    };
  }

  if (sort) {
    result.sort = sort.reduce<{
      [key: string]: number;
    }>((accum, item) => {
      const parts = item.split(":");
      let order = 1;

      if (parts.length > 1) {
        try {
          order = parseInt(parts[1], 10);
        } catch (error) {
          $ctx.logger.error("could not parse order to int", error);
        }
      }

      accum[parts[0]] = order;
      return accum;
    }, {});
  }

  return result;
}

//#####################################################
// Exports
//#####################################################
export {
  parseSearchQuery,
  parseSearchParams,
};
