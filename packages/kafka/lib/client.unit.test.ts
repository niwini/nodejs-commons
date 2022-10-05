import { hashEncode } from "@niwini/tracer";
import { delay } from "@niwini/utils";
import dayjs from "dayjs";

import { KafkaClient } from "./client";
import {
  IAdminClient,
  IConsumer,
  IKafkaClientConfig,
  IMessage,
  IOnConsumerMessageCallbackFn,
  IProducer,
  IProducerSendArgs,
  ISendMessage,
} from "./types";

//#####################################################
// Local variables
//#####################################################
let adminClientMock: IAdminClient;
let consumerMock: IConsumer;
let producerMock: IProducer;
let kafkaClient: KafkaClient;

//#####################################################
// Auxiliary Functions
//#####################################################

/**
 * This function going to setup test environment.
 *
 * @param args - A set of arguments.
 * @param args.consumerMock - Properties to be used in consumer mock.
 * @param args.producerMock - Properties to be used in producer mock.
 * @param args.adminClientMock - Properties to be used in admin client mock.
 * @param args.config - Additional configs to be passed to kafka client.
 */
function setup(args: {
  consumerMock?: Partial<IConsumer>;
  producerMock?: Partial<IProducer>;
  adminClientMock?: Partial<IAdminClient>;
  config?: Partial<IKafkaClientConfig>;
} = {}) {
  adminClientMock = {
    createTopic: jest.fn(),
    disconnect: jest.fn(),
    ...(args.adminClientMock ?? {}), // eslint-disable-line @typescript-eslint/no-extra-parens
  };

  consumerMock = {
    connect: jest.fn(),
    connected: Promise.resolve(),
    disconnect: jest.fn(),
    isConnected: true,
    onMessage: jest.fn(),
    start: jest.fn(),
    subscribe: jest.fn(),
    ...(args.consumerMock ?? {}), // eslint-disable-line @typescript-eslint/no-extra-parens
  };

  producerMock = {
    connect: jest.fn(),
    connected: Promise.resolve(),
    disconnect: jest.fn(),
    isConnected: true,
    send: jest.fn(),
    ...(args.consumerMock ?? {}), // eslint-disable-line @typescript-eslint/no-extra-parens
  };

  kafkaClient = new KafkaClient({
    brokers: ["kafka-1"],
    ...(args.config ?? {}), // eslint-disable-line @typescript-eslint/no-extra-parens
    adminClient: adminClientMock,
    consumer: consumerMock,
    producer: producerMock,
  });
}

//#####################################################
// Test definitions
//#####################################################
describe("kafka client", () => {
  beforeEach(() => {
    setup();
  });

  it("should start consumer", async () => {
    expect(consumerMock.onMessage).toHaveBeenCalled();
    expect(consumerMock.subscribe).not.toHaveBeenCalled();
    expect(consumerMock.start).toHaveBeenCalled();
  });

  it("should handle incoming messages properly", async () => {
    const onMessageCallbacks: IOnConsumerMessageCallbackFn[] = [];
    const topic = "topic-a";
    const evtName = "hello";
    const type = `${topic}:${evtName}`;
    const $traceHash = hashEncode({ fnName: "test" });

    setup({
      consumerMock: {
        onMessage: jest.fn((callback: IOnConsumerMessageCallbackFn) => {
          onMessageCallbacks.push(callback);
        }),
      },
    });

    await delay(500); // eslint-disable-line @typescript-eslint/no-magic-numbers

    let msg: IMessage;

    kafkaClient.on(type, (aMsg) => {
      msg = aMsg;
    });

    expect(consumerMock.onMessage).toHaveBeenCalled();
    expect(onMessageCallbacks.length).toBe(1);

    const mockedMsg: IMessage = {
      $traceHash,
      body: {
        text: "hello",
      },
      evtName,
      partition: 0,
      timestamp: dayjs().unix(),
      topic,
      type,
    };

    onMessageCallbacks[0]({
      key: type,
      partition: 0,
      topic,
      value: JSON.stringify(mockedMsg),
    });

    expect(msg).toBeDefined();
    expect(msg.body).toEqual(mockedMsg.body);
    expect(msg.topic).toBe(topic);
    expect(msg.evtName).toBe(evtName);
    expect(msg.$traceHash).toBe($traceHash);
    expect(msg.timestamp).toEqual(expect.any(Number));
    expect(msg.env).toBeNull();
  });

  it("should handle incoming messages from topic with env", async () => {
    const onMessageCallbacks: IOnConsumerMessageCallbackFn[] = [];
    const topic = "topic-a___dev";
    const evtName = "hello";
    const type = `${topic}:${evtName}`;
    const $traceHash = hashEncode({ fnName: "test" });

    setup({
      consumerMock: {
        onMessage: jest.fn((callback: IOnConsumerMessageCallbackFn) => {
          onMessageCallbacks.push(callback);
        }),
      },
    });

    await delay(500); // eslint-disable-line @typescript-eslint/no-magic-numbers

    let msg: IMessage;

    kafkaClient.on(type, (aMsg) => {
      msg = aMsg;
    });

    expect(consumerMock.onMessage).toHaveBeenCalled();
    expect(onMessageCallbacks.length).toBe(1);

    const mockedMsg: IMessage = {
      $traceHash,
      body: {
        text: "hello",
      },
      evtName,
      partition: 0,
      timestamp: dayjs().unix(),
      topic,
      type,
    };

    onMessageCallbacks[0]({
      key: type,
      partition: 0,
      topic,
      value: JSON.stringify(mockedMsg),
    });

    expect(msg).toBeDefined();
    expect(msg.body).toEqual(mockedMsg.body);
    expect(msg.topic).toBe(topic);
    expect(msg.evtName).toBe(evtName);
    expect(msg.$traceHash).toBe($traceHash);
    expect(msg.timestamp).toEqual(expect.any(Number));
    expect(msg.env).toEqual("dev");
  });

  // eslint-disable-next-line max-len
  it("should consume messages with multiple event names using * char", async () => {
    const onMessageCallbacks: IOnConsumerMessageCallbackFn[] = [];
    const topic = "topic-a";
    const $traceHash = hashEncode({ fnName: "test" });

    setup({
      consumerMock: {
        onMessage: jest.fn((callback: IOnConsumerMessageCallbackFn) => {
          onMessageCallbacks.push(callback);
        }),
      },
    });

    await delay(500); // eslint-disable-line @typescript-eslint/no-magic-numbers

    const msgs: IMessage[] = [];

    kafkaClient.on(`${topic}:*`, (aMsg) => {
      msgs.push(aMsg);
    });

    expect(consumerMock.onMessage).toHaveBeenCalled();
    expect(onMessageCallbacks.length).toBe(1);

    const mockedMsg: IMessage = {
      $traceHash,
      body: {
        text: "hello",
      },
      evtName: "test-1",
      partition: 0,
      timestamp: dayjs().unix(),
      topic,
      type: `${topic}:test-1`,
    };

    onMessageCallbacks[0]({
      key: `${topic}:test-1`,
      partition: 0,
      topic,
      value: JSON.stringify(mockedMsg),
    });

    onMessageCallbacks[0]({
      key: `${topic}:test-2`,
      partition: 0,
      topic,
      value: JSON.stringify({
        ...mockedMsg,
        evtName: "test-2",
        type: `${topic}:test-2`,
      }),
    });

    expect(msgs.length).toBe(2);

    expect(msgs[0]).toBeDefined();
    expect(msgs[0].body).toEqual(mockedMsg.body);
    expect(msgs[0].topic).toBe(topic);
    expect(msgs[0].evtName).toBe("test-1");
    expect(msgs[0].$traceHash).toBe($traceHash);
    expect(msgs[0].timestamp).toEqual(expect.any(Number));
    expect(msgs[0].env).toBeNull();

    expect(msgs[1]).toBeDefined();
    expect(msgs[1].body).toEqual(mockedMsg.body);
    expect(msgs[1].topic).toBe(topic);
    expect(msgs[1].evtName).toBe("test-2");
    expect(msgs[1].$traceHash).toBe($traceHash);
    expect(msgs[1].timestamp).toEqual(expect.any(Number));
    expect(msgs[1].env).toBeNull();
  });

  it("should consume messages with no event name", async () => {
    const onMessageCallbacks: IOnConsumerMessageCallbackFn[] = [];
    const topic = "topic-a";
    const $traceHash = hashEncode({ fnName: "test" });

    setup({
      consumerMock: {
        onMessage: jest.fn((callback: IOnConsumerMessageCallbackFn) => {
          onMessageCallbacks.push(callback);
        }),
      },
    });

    await delay(500); // eslint-disable-line @typescript-eslint/no-magic-numbers

    const msgs: IMessage[] = [];

    kafkaClient.on(`${topic}`, (aMsg) => {
      msgs.push(aMsg);
    });

    expect(consumerMock.onMessage).toHaveBeenCalled();
    expect(onMessageCallbacks.length).toBe(1);

    const mockedMsg: IMessage = {
      $traceHash,
      body: {
        text: "hello",
      },
      partition: 0,
      timestamp: dayjs().unix(),
      topic,
      type: topic,
    };

    onMessageCallbacks[0]({
      key: topic,
      partition: 0,
      topic,
      value: JSON.stringify(mockedMsg),
    });

    onMessageCallbacks[0]({
      key: topic,
      partition: 0,
      topic,
      value: JSON.stringify({
        ...mockedMsg,
        type: topic,
      }),
    });

    expect(msgs.length).toBe(2);

    expect(msgs[0]).toBeDefined();
    expect(msgs[0].body).toEqual(mockedMsg.body);
    expect(msgs[0].topic).toBe(topic);
    expect(msgs[0].evtName).toBeNull();
    expect(msgs[0].$traceHash).toBe($traceHash);
    expect(msgs[0].timestamp).toEqual(expect.any(Number));
    expect(msgs[0].env).toBeNull();

    expect(msgs[1]).toBeDefined();
    expect(msgs[1].body).toEqual(mockedMsg.body);
    expect(msgs[1].topic).toBe(topic);
    expect(msgs[1].evtName).toBeNull();
    expect(msgs[1].$traceHash).toBe($traceHash);
    expect(msgs[1].timestamp).toEqual(expect.any(Number));
    expect(msgs[1].env).toBeNull();
  });

  it("should correctly send a message with event name", async () => {
    const msgBody = {
      hello: "world",
    };
    const $traceHash = hashEncode({ fnName: "test" });
    const type = "topic-a:hello";

    const msgToSend: ISendMessage = {
      $traceHash,
      body: msgBody,
    };

    await kafkaClient.send(type, msgToSend);

    const sendArgs: IProducerSendArgs = {
      key: type,
      message: {
        ...msgToSend,
        body: expect.any(Object),
        timestamp: dayjs().unix(),
        type,
      },
      topic: "topic-a",
    };

    expect(producerMock.send).toHaveBeenCalledWith(sendArgs);
  });

  it("should correctly send a message with no event name", async () => {
    const msgBody = {
      hello: "world",
    };
    const $traceHash = hashEncode({ fnName: "test" });
    const type = "topic-a";

    const msgToSend: ISendMessage = {
      $traceHash,
      body: msgBody,
    };

    await kafkaClient.send(type, msgToSend);

    const sendArgs: IProducerSendArgs = {
      key: type,
      message: {
        ...msgToSend,
        body: expect.any(Object),
        timestamp: dayjs().unix(),
        type,
      },
      topic: "topic-a",
    };

    expect(producerMock.send).toHaveBeenCalledWith(sendArgs);
  });

  it("should correctly send a message to topic with env", async () => {
    setup({
      config: {
        env: "dev",
      },
    });

    const msgBody = {
      hello: "world",
    };
    const $traceHash = hashEncode({ fnName: "test" });
    const type = "topic-a:hello";

    const msgToSend: ISendMessage = {
      $traceHash,
      body: msgBody,
    };

    await kafkaClient.send(type, msgToSend);

    const sendArgs: IProducerSendArgs = {
      key: type,
      message: {
        ...msgToSend,
        body: expect.any(Object),
        timestamp: dayjs().unix(),
        type,
      },
      topic: "topic-a___dev",
    };

    expect(producerMock.send).toHaveBeenCalledWith(sendArgs);
  });

  it("should correctly send a messages to multiple topics", async () => {
    const msgBody = {
      hello: "world",
    };
    const $traceHash = hashEncode({ fnName: "test" });
    const type = "topic-a,topic-b:hello";

    const msgToSend: ISendMessage = {
      $traceHash,
      body: msgBody,
    };

    await kafkaClient.send(type, msgToSend);

    const sendArgs: IProducerSendArgs = {
      key: "topic-a:hello",
      message: {
        ...msgToSend,
        body: expect.any(Object),
        timestamp: dayjs().unix(),
        type: "topic-a:hello",
      },
      topic: "topic-a",
    };

    expect(producerMock.send).toHaveBeenCalledTimes(2);
    expect(producerMock.send).toHaveBeenNthCalledWith(1, sendArgs);
    expect(producerMock.send).toHaveBeenNthCalledWith(2, {
      ...sendArgs,
      key: "topic-b:hello",
      message: {
        ...sendArgs.message,
        type: "topic-b:hello",
      },
      topic: "topic-b",
    });
  });
});
