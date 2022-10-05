import {
  RedisClient,
  IClientConfig,
  IRedisDriver,
} from "./client";

//#####################################################
// Local variables
//#####################################################
let mockedRedisDriver: IRedisDriver;
let redisClient: RedisClient;

//#####################################################
// Constants
//#####################################################
const mockedKey = "fooKey";
const mockedValue = "fooValue";

//#####################################################
// Test definitions
//#####################################################
beforeEach(() => {
  mockedRedisDriver = {
    expire: jest.fn<void, any>(
      (_k: string, _t: number, callback: (error: Error, res: any) => void) => {
        callback(null, "OK");
      },
    ),
    get: jest.fn<void, any>(
      (_k: string, callback: (error: Error, res: any) => void) => {

        /* We must call the callback with the stringified value because
        it will be parsed inside this callback before being returned. */
        callback(null, JSON.stringify(mockedValue));
      },
    ),
    quit: jest.fn<void, any>(
      (callback: (error: Error, res: any) => void) => {
        callback(null, "OK");
      },
    ),
    set: jest.fn<void, any>(
      (
        _k: string,
        data: string,
        callback: (error: Error, res: any) => void,
      ) => {
        /* The data is parsed here because redisDriver set method firstly stringifies it and
        then call this mocked set method. To prevent parsing the result on the test implementation,
        it's better and faster to call the callback with the already parsed value. */
        callback(null, JSON.parse(data));
      },
    ),
  };

  const config: IClientConfig = {
    _redisDriver: mockedRedisDriver,
  };
  redisClient = new RedisClient(config);
});

describe("Redis driver test", () => {
  it("should call set method correctly", async () => {
    const value = await redisClient.set(mockedKey, mockedValue);
    expect(value).toBe(mockedValue);
    expect(mockedRedisDriver.set).toHaveBeenCalled();
  });

  it("should call get method correctly", async () => {
    const value = await redisClient.get(mockedKey);
    expect(value).toBe(mockedValue);
    expect(mockedRedisDriver.get).toHaveBeenCalled();
  });

  it("should call expire method correctly", async () => {
    const value = await redisClient.expire(mockedKey, 1000); //eslint-disable-line
    expect(value).toBe("OK");
    expect(mockedRedisDriver.expire).toHaveBeenCalled();
  });

  it("should call quit method correctly", async () => {
    const value = await redisClient.disconnect();
    expect(value).toBe("OK");
    expect(mockedRedisDriver.quit).toHaveBeenCalled();
  });
});
