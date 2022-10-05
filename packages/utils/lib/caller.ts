//#####################################################
// Types
//#####################################################
/**
 * Options to retrieve caller info.
 */
interface ICallerInfoOpts {
  depth: number;
}

/**
 * Caller info.
 */
interface ICallerInfo {
  file: string;
  name: string;
  line: string;
  column: string;
  id: string;
}

//#####################################################
// Functions
//#####################################################
/**
 * This function gets caller info like caller file name,
 * function name and others.
 *
 * @param stack - The error stack.
 * @param opts - The options.
 * @param opts.depth - Depth in stack trace to get caller info.
 */
function getCallerInfo(
  stack: string,
  { depth = 1 }: ICallerInfoOpts, // eslint-disable-line no-magic-numbers
): ICallerInfo {
  let stackList = stack.replace(/(  +)|(at )/g, "").split("\n");

  // Remove error and direct caller
  stackList = stackList.slice(1 + depth); // eslint-disable-line no-magic-numbers

  const callerInfo = stackList.shift().split(/ ?\(/);

  // Caller
  const name = callerInfo.length > 1 // eslint-disable-line no-magic-numbers
    ? callerInfo[0]
    : null;

  // File
  const fileInfo = (callerInfo.length > 1 // eslint-disable-line no-magic-numbers
    ? callerInfo[1]
    : callerInfo[0]).replace(")", "").split(":");

  const file = fileInfo[0].replace(process.cwd(), "").replace(/^\//, "");
  const [, line, column] = fileInfo;

  return {
    column,
    file,
    id: `${file} - ${name}`,
    line,
    name,
  };
}

/**
 * This function gets only the filepath of the caller.
 *
 * @param stack - The call stack.
 * @param opts - The options.
 * @param opts.depth - Depth in stack trace to get caller info.
 */
function getCallerFilepath(
  stack: string,
  { depth = 1 }: ICallerInfoOpts, // eslint-disable-line no-magic-numbers
): string {
  let stackList = stack.replace(/(  +)|(at )/g, "").split("\n");

  // Remove error and direct caller
  stackList = stackList.slice(1 + depth); // eslint-disable-line no-magic-numbers

  const callerInfo = stackList.shift().split(/ ?\(/);

  // File
  const fileInfo = (callerInfo.length > 1 // eslint-disable-line no-magic-numbers
    ? callerInfo[1]
    : callerInfo[0]).replace(")", "").split(":");
  const file = fileInfo[0].replace(process.cwd(), "").replace(/^\//, "");
  const [, line, column] = fileInfo;

  return `${file}:${line}:${column}`;
}

/**
 * This function retrieves the current call stack.
 */
function getCallStack(): ICallerInfo[] {
  const { stack } = new Error();
  let stackList = stack.replace(/(  +)|(at )/g, "").split("\n");
  stackList = stackList.slice(1); // eslint-disable-line no-magic-numbers

  const callStack = [];

  for (let idx = 0; idx < stackList.length; idx++) { // eslint-disable-line no-magic-numbers
    const stackItem = stackList[idx];
    const callerInfo = stackItem.split(/ ?\(/);

    // Caller
    const name = callerInfo.length > 1 // eslint-disable-line no-magic-numbers
      ? callerInfo[0]
      : null;

    // File
    const fileInfo = (callerInfo.length > 1 // eslint-disable-line no-magic-numbers
      ? callerInfo[1]
      : callerInfo[0]).replace(")", "").split(":");
    const file = fileInfo[0].replace(process.cwd(), "").replace(/^\//, "");
    const [, line, column] = fileInfo;

    callStack.push({
      column,
      file,
      id: `${file} - ${name}`,
      line,
      name,
    });
  }

  return callStack;
}

//#####################################################
// Export
//#####################################################
export {
  ICallerInfoOpts,
  ICallerInfo,
  getCallerInfo,
  getCallerFilepath,
  getCallStack,
};
