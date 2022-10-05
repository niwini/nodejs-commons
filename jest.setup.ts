import { TraceContext } from "./packages/tracer";

jest.setTimeout(40000); // eslint-disable-line @typescript-eslint/no-magic-numbers

beforeAll(() => {
  TraceContext.sharedInit({
    logLevel: "debug",
    serviceName: "nodejs-commons",
  });
});
