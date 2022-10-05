import { MongoClient } from "./client";

//#####################################################
// Test definitions
//#####################################################
describe("mongo client test", () => {
  it("should call driver connect", async () => {
    const dbNameMock = "DbMock";

    // Mock mongo driver connect function
    const clientMock = {
      close: jest.fn(),
      db: jest.fn(),
    };

    const driverMock = {
      connect: jest.fn(async () => Promise.resolve(
        clientMock,
      )),
    };

    // Create the client
    const mongoClient = new MongoClient({
      driver: driverMock,
    });

    const url = "mongodb://localhost:27017";

    await mongoClient.connect({ dbName: dbNameMock, url });

    expect(driverMock.connect).toHaveBeenCalledWith(url);
    expect(clientMock.db).toHaveBeenCalledWith(dbNameMock);
  });
});
