import { TraceContext } from "@niwini/tracer";
import jwt from "jsonwebtoken";

import TokenManager, {
  IJWTClient,
  IRedisClient,
  ITokenManagerConfig,
} from "./token";

//#####################################################
// Constants
//#####################################################
const tokenMock = "tokenMock";
const dataMock = { test: "hello" };

//#####################################################
// Local variables
//#####################################################
let config: ITokenManagerConfig;
let jwtClientMock: IJWTClient;
let redisClientMock: IRedisClient;
let manager: TokenManager;

//#####################################################
// Utilitary methods
//#####################################################
/**
 * This function generates both a fakeRedisClient and a token manager.
 *
 * @param args - A set of args.
 * @param args.redisClientMock - A mock client for redis.
 * @param args.jwtClientMock - Mock for jwt client.
 * @param args.config - A set of config options.
 */
function createManager(args: {
  redisClientMock?: Partial<IRedisClient>;
  jwtClientMock?: Partial<IJWTClient>;
  config?: Partial<ITokenManagerConfig>;
} = {}) {
  jwtClientMock = {
    sign: jest.fn((
      _payload: object,
      _secretOrPvtKey: string,
      _options: any,
      callback: (error: any, token: string) => void,
    ) => callback(null, tokenMock)),
    verify: jest.fn((
      _token: string,
      _secret: string,
      callback: (error: any, decoded: object) => void,
    ) => callback(null, dataMock)),
    ...(args.jwtClientMock || {}), // eslint-disable-line @typescript-eslint/no-extra-parens
  };

  redisClientMock = {
    expire: jest.fn(),
    get: jest.fn(
      (_key: string) => Promise.resolve(),
    ),
    initialized: Promise.resolve(),
    set: jest.fn(
      (_key: string, _val: string, _expTimeInSec: number) =>
        Promise.resolve(""),
    ),
    ...(args.redisClientMock || {}), // eslint-disable-line @typescript-eslint/no-extra-parens
  };

  const SEC_PER_MIN = 60;
  const MIN_PER_HOUR = 60;
  const HOUR_PER_DAY = 24;

  config = {
    expiration: HOUR_PER_DAY * MIN_PER_HOUR * SEC_PER_MIN,
    jwtClient: jwtClientMock,
    redisClient: redisClientMock,
    redisIdx: 1,
    secret: "shhhhhhhhhhhhhh",
    type: "token",
    ...(args.config || {}), // eslint-disable-line @typescript-eslint/no-extra-parens
  };

  manager = new TokenManager(config);
}

//#####################################################
// Test definitions
//#####################################################
describe("token manager", () => {
  beforeEach(() => {
    createManager();
  });

  describe("create method", () => {
    it("should call jwt.sign with correct arguments", async () => {
      const token = await manager.create(dataMock);

      expect(jwtClientMock.sign).toHaveBeenCalledWith(dataMock, config.secret, {
        expiresIn: config.expiration,
      }, expect.any(Function));
      expect(token).toBe(tokenMock);
    });
  });

  describe("decode method", () => {
    it("should call jwt and redis methods with correct arguments", async () => {
      const keyMock = `${config.type}_${tokenMock}`;
      const decoded = await manager.decode(tokenMock);

      expect(jwtClientMock.verify).toHaveBeenCalledWith(
        tokenMock,
        config.secret,
        expect.any(Function),
      );
      expect(redisClientMock.get).toHaveBeenCalledWith(
        keyMock,
        expect.any(TraceContext),
      );
      expect(decoded).toBe(dataMock);
    });

    it("should fails when jwt.verify fails", async () => {
      const errorMsg = "some error";
      let decoded: object;
      let error: jwt.VerifyErrors;

      /**
       * This function mocks the jwt verify method simulating
       * a failure.
       *
       * @param _token - The token to be verified.
       * @param _secret - The public secret.
       * @param callback - The callback.
       */
      const jwtVerifyMock = (
        _token: string,
        _secret: string,
        callback: (error2: any, decoded2: object) => void,
      ) => callback(new Error(errorMsg), null);

      // Create the manager with mock
      createManager({
        jwtClientMock: {
          verify: jest.fn(jwtVerifyMock),
        },
      });

      try {
        decoded = await manager.decode(tokenMock);
      } catch (catchedError) {
        error = catchedError;
      }

      expect(jwtClientMock.verify).toHaveBeenCalledWith(
        tokenMock,
        config.secret,
        expect.any(Function),
      );
      expect(redisClientMock.get).not.toHaveBeenCalled();
      expect(decoded).toBeUndefined();
      expect(error).toBeDefined();
      expect(error.message).toBe(errorMsg);
    });

    it("should fails when redisClient.get fails", async () => {
      const keyMock = `${config.type}_${tokenMock}`;
      const errorMsg = "some error";

      /**
       * This function is a mock for redis get function that
       * going to simulate a fail.
       *
       * @param _key - The key to be stored.
       * @param callback - The callback function.
       */
      const redisGetMock = async (
        _key: string,
      ) => Promise.reject(new Error(errorMsg));

      // Create the manager with mock
      createManager({
        redisClientMock: {
          get: jest.fn(redisGetMock),
        },
      });

      let decoded: object;
      let error: jwt.VerifyErrors;

      try {
        decoded = await manager.decode(tokenMock);
      } catch (catchedError) {
        error = catchedError;
      }

      expect(jwtClientMock.verify).toHaveBeenCalledWith(
        tokenMock,
        config.secret,
        expect.any(Function),
      );
      expect(redisClientMock.get).toHaveBeenCalledWith(
        keyMock,
        expect.any(TraceContext),
      );
      expect(decoded).toBeUndefined();
      expect(error).toBeDefined();
      expect(error.message).toBe(errorMsg);
    });
  });

  describe("expire method", () => {
    it("should call jwt and redis methods with correct arguments", async () => {
      const keyMock = `${config.type}_${tokenMock}`;

      await manager.expire(tokenMock);

      expect(jwtClientMock.verify).toHaveBeenCalledWith(
        tokenMock,
        config.secret,
        expect.any(Function),
      );
      expect(redisClientMock.set).toHaveBeenCalledWith(
        keyMock,
        expect.any(String),
        0,
        expect.any(TraceContext),
      );
      expect(redisClientMock.expire).toHaveBeenCalledWith(
        tokenMock,
        config.expiration,
      );
    });

    it("should success when jwt.verify fails with TokenExpiredError", async () => { // eslint-disable-line max-len
      const errorMsg = "TokenExpiredError";
      let error: jwt.VerifyErrors;

      // Create the manager with mock
      createManager({
        jwtClientMock: {
          verify: jest.fn((
            _token: string,
            _secret: string,
            callback: (error2: any, decoded: object) => void,
          ) => callback({ name: errorMsg }, null)),
        },
      });

      try {
        await manager.expire(tokenMock);
      } catch (catchedError) {
        error = catchedError;
      }

      expect(jwtClientMock.verify).toHaveBeenCalledWith(
        tokenMock,
        config.secret,
        expect.any(Function),
      );
      expect(redisClientMock.set).not.toHaveBeenCalled();
      expect(redisClientMock.expire).not.toHaveBeenCalled();
      expect(error).toBeUndefined();
    });

    it("should fails when jwt.verify fails", async () => {
      const errorMsg = "some error";
      let error: jwt.VerifyErrors;

      // Create the manager with mock
      createManager({
        jwtClientMock: {
          verify: jest.fn((
            _token: string,
            _secret: string,
            callback: (error2: any, decoded: object) => void,
          ) => callback(new Error(errorMsg), null)),
        },
      });

      try {
        await manager.expire(tokenMock);
      } catch (catchedError) {
        error = catchedError;
      }

      expect(jwtClientMock.verify).toHaveBeenCalledWith(
        tokenMock,
        config.secret,
        expect.any(Function),
      );
      expect(redisClientMock.set).not.toHaveBeenCalled();
      expect(redisClientMock.expire).not.toHaveBeenCalled();
      expect(error).toBeDefined();
      expect(error.message).toBe(errorMsg);
    });

    it("should fails when redisClient.set fails", async () => {
      const keyMock = `${config.type}_${tokenMock}`;
      const errorMsg = "some error";
      let error: jwt.VerifyErrors;

      createManager({
        redisClientMock: {
          set: jest.fn(
            (
              _key: string,
              _data: any,
              _expTimeInSec?: number,
            ) => Promise.reject(new Error(errorMsg)),
          ),
        },
      });

      try {
        await manager.expire(tokenMock);
      } catch (catchedError) {
        error = catchedError;
      }

      expect(jwtClientMock.verify).toHaveBeenCalledWith(
        tokenMock,
        config.secret,
        expect.any(Function),
      );
      expect(redisClientMock.set).toHaveBeenCalledWith(
        keyMock,
        expect.any(String),
        0,
        expect.any(TraceContext),
      );
      expect(redisClientMock.expire).not.toHaveBeenCalled();
      expect(error).toBeDefined();
      expect(error.message).toBe(errorMsg);
    });
  });
});
