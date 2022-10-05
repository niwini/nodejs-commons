import {
  observableDiff,
  applyChange,
} from "deep-diff";
import lodash from "lodash";

//#####################################################
// Methods
//#####################################################
/**
 * This function convert an object like entity to plain object.
 *
 * @param objLike - A structure that could be parsed to plain object.
 */
function toPlainObject<T extends object>(objLike: T): {[key: string]: any} {
  return JSON.parse(JSON.stringify(objLike));
}

/**
 * This function remove all nulls presented in an object.
 *
 * @param objLike - A structure that could be parsed to plain object.
 */
function removeNulls<T extends object>(objLike: T): Partial<T> {
  const plainObj = toPlainObject<T>(objLike);

  Object.keys(plainObj).forEach((key: string) => ( // eslint-disable-line @typescript-eslint/no-extra-parens
    (plainObj[key] === null) && delete plainObj[key] // eslint-disable-line @typescript-eslint/no-dynamic-delete
  ));

  return plainObj as Partial<T>;
}

/**
 * This function reduce objects to the bare minimal of their differences.
 *
 * @param before - An object before change.
 * @param after - An object after change.
 */
function diffMin<T>(
  before: T,
  after: T,
): T[] {
  const objs: object[] = [{}, {}];

  // Convert before/after to plain objects.
  const befter = [
    JSON.parse(JSON.stringify(before)),
    JSON.parse(JSON.stringify(after)),
  ];

  for (let i = 0; i < 2; i++) {
    const nextIdx = (i + 1) % befter.length;
    const curr = befter[i];
    const next = befter[nextIdx];

    observableDiff(next, curr, (change) => {
      applyChange(objs[i], curr, change);
    });
  }

  /**
   * This function going to do a deep mapping of object values.
   *
   * @param obj - Object to map.
   * @param fn - Mapper function.
   */
  const mapValuesDeep = (obj: object, fn: any): any =>
    lodash.mapValues(obj, (val, key) =>
      lodash.isPlainObject(val)
        ? mapValuesDeep(val, fn)
        : fn(val, key, obj));

  return objs.map((obj) => mapValuesDeep(obj, (val: any) => {
    if (lodash.isArray(val)) {
      return lodash.filter(val, (item) =>
        !lodash.isUndefined(item));
    }

    return val;
  }));
}

//#####################################################
// Export
//#####################################################
export {
  removeNulls,
  toPlainObject,
  diffMin,
};
