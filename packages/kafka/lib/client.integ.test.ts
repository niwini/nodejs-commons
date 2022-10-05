import { hashEncode } from "@niwini/tracer";
import { delay } from "@niwini/utils";

import {
  KafkaClient,
} from "./client";
import {
  IMessage,
} from "./types";

//#####################################################
// Global constants
//#####################################################
const TIMEOUT = 5000;

//#####################################################
// Global variables
//#####################################################
let kafkaClient: KafkaClient;

//#####################################################
// Helper methods
//#####################################################
/**
 * This function going to setup the test environment.
 *
 * @param args - Set of arguments.
 * @param args.env - Environment to use.
 * @param args.namespace - The namespace.
 * @param args.topics - Topics to subscribe to.
 */
async function setup(args: {
  env?: string;
  namespace?: string;
  topics: string[];
}) {
  const kafkaUrl = process.env.KAFKA_URL ?? "localhost";
  const kafkaPort = process.env.KAFKA_PORT ?? "15393";

  const client = new KafkaClient({
    brokers: [`${kafkaUrl}:${kafkaPort}`],
    env: args.env,
    namespace: args.namespace,
    shouldCreateTopics: true,
    subscribe: args.topics.map((topic) => ({ topic })),
  });

  await client.initialized;

  return client;
}

//#####################################################
// Test definitions
//#####################################################
describe("kafka client", () => {
  beforeAll(async () => {
    kafkaClient = await setup({ topics: [
      "topic-a",
      "topic-b",
      "topic-c",
    ] });

    // Wait some time
    await delay(10000); // eslint-disable-line @typescript-eslint/no-magic-numbers
  });

  afterAll(async () => {
    await kafkaClient.disconnect();
  });

  it("should send message to a single topic with event name", async () => {
    const $traceHash = hashEncode({ fnName: "test" });
    const msgBody = {
      hello: "world",
    };

    let msg: IMessage<typeof msgBody>;

    kafkaClient.on("topic-a:hello", (aMsg) => {
      msg = aMsg;
    });

    await kafkaClient.send("topic-a:hello", {
      $traceHash,
      body: msgBody,
    });

    await delay(TIMEOUT);

    expect(msg).toBeTruthy();
    expect(msg.body).toEqual(msgBody);
    expect(msg.topic).toBe("topic-a");
    expect(msg.evtName).toBe("hello");
    expect(msg.$traceHash).toBe($traceHash);
    expect(msg.timestamp).toEqual(expect.any(Number));
  });

  it("should send message to a single topic with no event name", async () => {
    const $traceHash = hashEncode({ fnName: "test" });
    const msgBody = {
      hello: "world",
    };

    let msg: IMessage<typeof msgBody>;
    let msgWithEvtName: IMessage<typeof msgBody>;

    kafkaClient.on("topic-a", (aMsg) => {
      msg = aMsg;
    });

    kafkaClient.on("topic-a:someEvent", (aMsg) => {
      msgWithEvtName = aMsg;
    });

    await kafkaClient.send("topic-a", {
      $traceHash,
      body: msgBody,
    });

    await delay(TIMEOUT);

    expect(msg).toBeTruthy();
    expect(msg.body).toEqual(msgBody);
    expect(msg.topic).toBe("topic-a");
    expect(msg.evtName).toBeNull();
    expect(msg.$traceHash).toBe($traceHash);
    expect(msg.timestamp).toEqual(expect.any(Number));

    expect(msgWithEvtName).toBeFalsy();
  });

  it("should sent message to multiple topics", async () => {
    const $traceHash = hashEncode({ fnName: "test" });
    const msgBody = {
      hello: "world",
    };

    let msgB: IMessage<typeof msgBody>;
    let msgC: IMessage<typeof msgBody>;

    kafkaClient.on("topic-b:hello", (aMsg) => {
      msgB = aMsg;
    });

    kafkaClient.on("topic-c:hello", (aMsg) => {
      msgC = aMsg;
    });

    await kafkaClient.send("topic-b,topic-c:hello", {
      $traceHash,
      body: msgBody,
    });

    await delay(TIMEOUT);

    expect(msgB).toBeTruthy();
    expect(msgB.body).toEqual(msgBody);
    expect(msgB.topic).toBe("topic-b");
    expect(msgB.evtName).toBe("hello");
    expect(msgB.$traceHash).toBe($traceHash);
    expect(msgB.timestamp).toEqual(expect.any(Number));

    expect(msgC).toBeTruthy();
    expect(msgC.body).toEqual(msgBody);
    expect(msgC.topic).toBe("topic-c");
    expect(msgC.evtName).toBe("hello");
    expect(msgC.$traceHash).toBe($traceHash);
    expect(msgC.timestamp).toEqual(expect.any(Number));
  });

  it("should receive message for same env", async () => {
    const $traceHash = hashEncode({ fnName: "test" });
    const msgBody = {
      hello: "world",
    };

    const kafkaDevClient = await setup({
      env: "dev",
      topics: ["topic-a"],
    });

    const msgs: IMessage<typeof msgBody>[] = [];

    kafkaClient.on("topic-a:hello", (aMsg) => {
      msgs.push(aMsg);
    });

    kafkaDevClient.on("topic-a:hello", (aMsg) => {
      msgs.push(aMsg);
    });

    await kafkaDevClient.send("topic-a:hello", {
      $traceHash,
      body: msgBody,
    });

    await delay(TIMEOUT);

    expect(msgs.length).toBe(1);

    const [msg] = msgs;

    expect(msg).toBeTruthy();
    expect(msg.body).toEqual(msgBody);
    expect(msg.topic).toBe("topic-a");
    expect(msg.evtName).toBe("hello");
    expect(msg.$traceHash).toBe($traceHash);
    expect(msg.timestamp).toEqual(expect.any(Number));
    expect(msg.env).toBe("dev");

    await kafkaDevClient.disconnect();
  });

  it("should receive message for same namespace", async () => {
    const $traceHash = hashEncode({ fnName: "test" });
    const msgBody = {
      hello: "world",
    };

    const kafkaNsClient = await setup({
      namespace: "nosebit",
      topics: ["topic-a"],
    });

    const msgs: IMessage<typeof msgBody>[] = [];

    kafkaClient.on("topic-a:hello", (aMsg) => {
      msgs.push(aMsg);
    });

    kafkaNsClient.on("topic-a:hello", (aMsg) => {
      msgs.push(aMsg);
    });

    await kafkaNsClient.send("topic-a:hello", {
      $traceHash,
      body: msgBody,
    });

    await delay(TIMEOUT);

    expect(msgs.length).toBe(1);

    const [msg] = msgs;

    expect(msg).toBeTruthy();
    expect(msg.body).toEqual(msgBody);
    expect(msg.topic).toBe("topic-a");
    expect(msg.evtName).toBe("hello");
    expect(msg.$traceHash).toBe($traceHash);
    expect(msg.timestamp).toEqual(expect.any(Number));
    expect(msg.env).toBeNull();

    await kafkaNsClient.disconnect();
  });

  it("should receive messages with multiple evt name", async () => {
    const $traceHash = hashEncode({ fnName: "test" });
    const msgBody = {
      hello: "world",
    };

    const msgs: IMessage<typeof msgBody>[] = [];

    kafkaClient.on("topic-a:*", (aMsg) => {
      msgs.push(aMsg);
    });

    await kafkaClient.send("topic-a:hello-a", {
      $traceHash,
      body: msgBody,
    });

    await kafkaClient.send("topic-a:hello-b", {
      $traceHash,
      body: msgBody,
    });

    await delay(TIMEOUT);

    expect(msgs.length).toBe(2);

    const msgA = msgs.find((msg) => msg.evtName === "hello-a");
    const msgB = msgs.find((msg) => msg.evtName === "hello-b");

    expect(msgA).toBeDefined();
    expect(msgA.body).toEqual(msgBody);
    expect(msgA.topic).toBe("topic-a");
    expect(msgA.evtName).toBe("hello-a");
    expect(msgA.$traceHash).toBe($traceHash);
    expect(msgA.timestamp).toEqual(expect.any(Number));

    expect(msgB).toBeDefined();
    expect(msgB.body).toEqual(msgBody);
    expect(msgB.topic).toBe("topic-a");
    expect(msgB.evtName).toBe("hello-b");
    expect(msgB.$traceHash).toBe($traceHash);
    expect(msgB.timestamp).toEqual(expect.any(Number));
  });
});
