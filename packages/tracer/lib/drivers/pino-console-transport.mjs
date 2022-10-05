/* eslint-disable import/no-commonjs, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
import chalk from "chalk";
import dayjs from "dayjs";
import build from "pino-abstract-transport";

/**
 * Extracted from:
 * https://github.com/pinojs/pino-pretty/blob/master/lib/colors.js
 */
const levelColorsMap = {
  10: chalk.gray,
  20: chalk.blue,
  30: chalk.green,
  40: chalk.yellow,
  50: chalk.red,
  60: chalk.bgRed,
};

/**
 * Simple console log stream.
 */
const fn = () => build(async (source) => {
  source.on("data", (obj) => {
    let dataStr = "";
    let levelName;

    if (obj.level && obj.levelName) {
      const levelColor = levelColorsMap[obj.level] || chalk.gray;
      levelName = levelColor.bold(obj.levelName);
    }

    /**
     * Trace context id.
     */
    let tid;

    if (obj.$tid) {
      tid = chalk.gray.bold(`${obj.$tid}`);
    }


    /**
     * Function full name including class name.
     */
    let fnNameStr;

    if (obj.$fnName) {
      fnNameStr = chalk.cyan.bold(`${obj.$fnName}`);
    }

    /**
     * Call stack info.
     */
    const callStackNamesArr = [];
    let callStackNamesStr;

    if (obj.$parentTid) {
      callStackNamesArr.push(
        chalk.bold.gray(`[${obj.$parentTid}]`),
      );
    }

    if (obj.$call && obj.$call !== obj.$fnName) {
      callStackNamesArr.push(chalk.gray(obj.$call));
    }

    if (callStackNamesArr.length) {
      callStackNamesArr.unshift(chalk.gray("BY"));
      callStackNamesStr = callStackNamesArr.join(" ");
    }

    /**
     * Transform data to string so we can log it better.
     */
    if (obj.data) {
      try {
        dataStr = JSON.stringify(obj.data, null, 2);
      } catch (error) {
        dataStr = obj.data;
      }

      if (dataStr && dataStr.length) {
        dataStr = chalk.gray(dataStr);
      }
    }

    let prefix = dayjs(obj.time).format("YY-MM-DD HH:mm:ss.SSS");

    if (obj.name) {
      const textColor = obj.color || "#999999";
      const serviceNamePrefix = chalk.bold.hex(textColor)(
        ` [${obj.name}]`,
      );

      prefix = `${prefix}${serviceNamePrefix}`;
    }

    const parts = [
      prefix,
      tid,
      levelName,
      fnNameStr,
      obj.msg,
    ].filter(Boolean);

    const consoleArgs = [
      parts.join(" "),
    ];

    if (dataStr.length) {
      consoleArgs.push(dataStr);
    }

    if (callStackNamesStr) {
      consoleArgs.push(callStackNamesStr);
    }

    // eslint-disable-next-line no-console
    console.log(...consoleArgs);
  });
});

export default fn;
