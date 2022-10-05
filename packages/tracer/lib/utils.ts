import LZString from "lz-string";

import {
  ITraceHashData,
} from "./types";

//#####################################################
// Constants
//#####################################################
const TRACE_HASH_PREFIX = "$TRACE_HASH_";

//#####################################################
// Utilitary Functions
//#####################################################
/**
 * This function going to encode trace context data into
 * a hash.
 *
 * @param hashData - The context data to be encoded to hash.
 */
function hashEncode(
  hashData: ITraceHashData,
) {
  const base64Hash = LZString.compressToBase64(JSON.stringify(hashData));

  return `${TRACE_HASH_PREFIX}${base64Hash}`;
}

/**
 * This function going to decode a hash into it's data.
 *
 * @param hash - The hash to be decoded.
 */
function hashDecode(
  hash: string,
) {
  const base64Hash = hash.replace(TRACE_HASH_PREFIX, "");

  const hashDataStr = LZString.decompressFromBase64(base64Hash);

  const hashData: ITraceHashData = JSON.parse(hashDataStr);

  return hashData;
}

//#####################################################
// Exports
//#####################################################
export {
  TRACE_HASH_PREFIX,
  hashDecode,
  hashEncode,
};
