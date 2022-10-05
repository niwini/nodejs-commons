/* eslint-disable import/prefer-default-export, max-classes-per-file */

//#####################################################
// Imports
//#####################################################
import { EventEmitter } from "events";

import {
  trace,
  TraceContext,
  TTracedFnArgs,
} from "@niwini/tracer";
import dayjs from "dayjs";
import _ from "lodash";
import { nanoid } from "nanoid";

import {
  KafkaConsumer,
} from "./kafkajs";
import {
  KafkaAdminClient,
  KafkaProducer,
} from "./rdkafka";
import {
  IAdminClient,
  IConsumer,
  IConsumerConfig,
  IConsumerReceiveMessage,
  ISendMessage,
  ISendOpts,
  IProducer,
  ITopicConfig,
  IMessage,
  IOnMessageCallbackFn,
  IKafkaClient,
  IKafkaClientConfig,
  IProducerSendArgs,
} from "./types";

//#####################################################
// Auxiliary Functions
//#####################################################
/**
 * This function converts a struct to a plain javascript
 * object that encapsulates the original types info within
 * the struct.
 *
 * @param body - Body object to get converted.
 */
function convertToTypedObj(body: any): any {
  if (_.isMap(body)) {
    const obj = [
      ...body.entries(),
    ].reduce((accum, [key, val]) => ({
      ...accum,
      [key]: val,
    }), {} as any);

    return {
      __nsbKakfaType: "Map",
      value: convertToTypedObj(obj),
    };
  } else if (_.isSet(body)) {
    return {
      __nsbKakfaType: "Set",
      value: [...body.keys()].map((item) => convertToTypedObj(item)),
    };
  } else if (_.isArray(body)) {
    return body.map((val) => convertToTypedObj(val));
  } else if (_.isDate(body)) {
    return {
      __nsbKakfaType: "Date",
      value: body.toString(),
    };
  } else if (dayjs.isDayjs(body)) {
    return {
      __nsbKakfaType: "Dayjs",
      value: body.toISOString(),
    };
  } else if (_.isError(body)) {
    return {
      __nsbKakfaType: "Error",
      stack: body.stack,
      value: body.message,
    };
  } else if (_.isObject(body)) {
    return Object.entries(body).reduce((accum, [key, val]) => ({
      ...accum,
      [key]: convertToTypedObj(val),
    }), {});
  } else if (
    _.isNumber(body)
    || _.isString(body)
    || _.isBoolean(body)
    || _.isNull(body)
  ) {
    return body;
  }

  return {
    __nsbKakfaType: "unknown",
    value: body,
  };
}

/**
 * This function converts a plain typed object to original struct
 * with correct types.
 *
 * @param body - Typed body object to be converted.
 */
function convertFromTypedObj(body: any): any {
  if (_.isArray(body)) {
    return body.map((val) => convertFromTypedObj(val));
  } else if (_.isObject(body)) {
    body = body as any; // eslint-disable-line no-param-reassign

    switch (body.__nsbKakfaType) {
      case "Map": {
        return new Map(
          Object.entries(body.value).map(([key, val]) => // eslint-disable-line dot-notation
            [key, convertFromTypedObj(val)]),
        );
      }

      case "Set": {
        return new Set(body.value.map((val: any) => // eslint-disable-line dot-notation
          convertFromTypedObj(val)));
      }

      case "Date": {
        return new Date(body.value);
      }

      case "Dayjs": {
        return dayjs(body.value);
      }

      case "Error": {
        const error = new Error(body.value);
        error.stack = body.stack;
        return error;
      }

      case "unknown": {
        return body.value;
      }

      default: {
        break;
      }
    }

    /**
     * Iterate over each key.
     */
    return Object.entries(body).reduce((accum, [key, val]) => ({
      ...accum,
      [key]: convertFromTypedObj(val),
    }), {});
  }

  return body;
}

//#####################################################
// Main class
//#####################################################
/**
 * This function implements a kafka client.
 */
class KafkaClient implements IKafkaClient {
  /**
   * Shared instance.
   */
  private static _sharedClients: {
    [id: string]: KafkaClient;
  } = {};

  /**
   * Topics already created by the clien.
   */
  private static readonly _createdTopicsSet = new Set<string>();

  /**
   * This static function retrieves the shared instance.
   *
   * @param config - The client config.
   * @param _$ctx - Trace context.
   */
  @trace()
  public static sharedInit(
    config?: IKafkaClientConfig,
    _$ctx?: TraceContext,
  ) {
    const id = config.id ?? "main";

    if (!KafkaClient._sharedClients[id]) {
      KafkaClient._sharedClients[id] = new KafkaClient(config);
    }

    return KafkaClient._sharedClients[id];
  }

  /**
   * This function decode a message key which has the format
   * TOPIC:EVT_NAME.
   *
   * @param type - The message type.
   */
  public static msgTypeDecode(
    type: string,
  ) {
    const parts = type.split(":");
    const topicName = parts.length ? parts[0] : null;
    const evtName = parts.length > 1 ? parts[1] : null;

    return {
      evtName,
      topicName,
    };
  }

  /**
   * Static getter for the main shared client.
   *
   * @deprecated - Prefer using new static get method.
   */
  static get shared() {
    return KafkaClient._sharedClients.main;
  }

  /**
   * Get shared client by id.
   *
   * @param id - The shared client id.
   */
  public static get(id = "main") {
    if (!KafkaClient._sharedClients[id]) {
      throw new Error(`shared client with id "${id}" not found`);
    }

    return KafkaClient._sharedClients[id];
  }

  /**
   * Client id.
   */
  private readonly _id: string;

  /**
   * Kafka broker urls.
   */
  private readonly _brokers: string[];

  /**
   * Environment name which going to be used to scope topic names.
   */
  private readonly _env: string;

  /**
   * Node emitter to be used instead of kafka. Useful when running a monolith
   * version of backend.
   */
  private _emitter: EventEmitter;

  /**
   * The producer.
   */
  private _producer: IProducer;

  /**
   * The consumer.
   */
  private _consumer: IConsumer;

  /**
   * Admin client.
   */
  private _adminClient: IAdminClient;

  /**
   * Events namespace.
   */
  private readonly _namespace: string;

  /**
   * Flag indicating if we should create topics on the fly.
   */
  private readonly _shouldCreateTopics: boolean = false;

  /**
   * Topics config for creation.
   */
  private readonly _topicConfig: ITopicConfig;

  /**
   * This is a promise that gets resolved when client is fully initialized.
   */
  private readonly _initialized: Promise<void>;

  /**
   * The producer queue which store all producer messages while
   * producer is not ready yet.
   */
  private readonly _sendQueue: IProducerSendArgs[] = [];

  /**
   * Consumer callbacks map.
   */
  private readonly _callbacksMap: Map<string, {fn: IOnMessageCallbackFn}[]>;

  /**
   * Getter for emiiter.
   */
  get emitter() {
    return this._emitter;
  }

  /**
   * This getter retrieves the initialized property.
   */
  public get initialized() {
    return this._initialized;
  }

  /**
   * Getter for id.
   */
  public get id() {
    return this._id;
  }

  /**
   * Getter for brokers.
   */
  public get brokers() {
    return this._brokers;
  }

  /**
   * This function creates a new instance of this class.
   *
   * @param config - The client config.
   */
  constructor(config: IKafkaClientConfig) {
    this._id = config.id ?? nanoid();
    this._brokers = config.brokers;
    this._callbacksMap = new Map();
    this._shouldCreateTopics = config.shouldCreateTopics;
    this._topicConfig = config.topicConfig;
    this._env = config.env;
    this._namespace = config.namespace;

    this._initialized = this._init(config);
  }

  /**
   * This function initializes the client.
   *
   * @param args -
   */
  @trace()
  private async _init(
    args: TTracedFnArgs<IKafkaClientConfig>,
  ) {
    const { $ctx } = args;

    if (args.useNodeEmitter) {
      this._emitter = new EventEmitter();
      this._emitter.on("event", this._handleConsumerMessage.bind(this));

      return Promise.resolve();
    }

    const consumerConfig: IConsumerConfig = {
      ...args.consumerConfig,
    };

    if (args.namespace) {
      consumerConfig.groupId = consumerConfig.groupId
        ? `${args.namespace}-${consumerConfig.groupId}`
        : consumerConfig.groupId;
    }

    this._producer = args.producer
      ?? new KafkaProducer(this, args.producerConfig);
    this._consumer = args.consumer
      ?? new KafkaConsumer(this, consumerConfig);
    this._adminClient = args.adminClient ?? new KafkaAdminClient(this);

    // Flush queued messages when producer is ready.
    this._producer.connected.then(() => {
      while (this._sendQueue.length > 0) { // eslint-disable-line no-magic-numbers
        const sendArgs = this._sendQueue.shift();
        this._producer.send(sendArgs);
      }
    });

    // Setup consumer when connected.
    const consumerPromise = this._consumer.connected.then(async () => {
      // Register consumer.
      this._consumer.onMessage((consumerMsg) => {
        this._handleConsumerMessage(consumerMsg);
      });

      // Subscribe to topics.
      await Promise.all((args.subscribe ?? []).map(({ topic }) =>
        this._consumer.subscribe(this._encodeTopicName(topic))));

      if (this._shouldCreateTopics) {
        this._createTopics(
          (args.subscribe ?? []).map(({ topic }) => topic),
          $ctx,
        );
      }

      // Start consuming.
      await this._consumer.start();
    });

    return Promise.all([
      this._producer.connected,
      consumerPromise,
    ]).then(() => null);
  }

  /**
   * This function going to create a set of topics based on topic
   * config received.
   *
   * @param topics - Topic names to be created.
   * @param $ctx - Trace context.
   */
  @trace()
  private async _createTopics(
    topics: string[],
    $ctx?: TraceContext,
  ) {
    const promises = topics.map((topic) =>
      this.createTopic(topic, {
        partitions: _.get(this._topicConfig, "numbPartitions"),
        replication: _.get(this._topicConfig, "replicationFactor"),
      }, $ctx));

    return Promise.all(promises);
  }

  /**
   * This function handle a consumer message.
   *
   * @param consumerMsg - The message as coming from consumer.
   * @param $ctx - Trace context.
   */
  @trace()
  private _handleConsumerMessage(
    consumerMsg: IConsumerReceiveMessage,
    $ctx?: TraceContext,
  ) {
    // Built message
    let msg: IMessage;

    // Parse msg data.
    try {
      msg = JSON.parse(consumerMsg.value);
    } catch (error) {
      $ctx.logger.error("could not parse message", error);
      return;
    }

    msg.body = convertFromTypedObj(msg.body);

    /**
     * Decode topic name to get env.
     */
    const { env } = this._decodeTopicName(consumerMsg.topic);

    /**
     * Find out the key coming from remote sender (from
     * message). The key sent is something in the form:
     *
     * TOPIC:EVT_NAME.
     */
    const decodedType = KafkaClient.msgTypeDecode(msg.type);

    // Remove namespace prefix from topicName
    if (this._namespace) {
      decodedType.topicName = decodedType.topicName.replace(
        new RegExp(`^${this._namespace}-`),
        "",
      );
    }

    // Fulfill message.
    msg.evtName = decodedType.evtName;
    msg.topic = decodedType.topicName;
    msg.env = env;

    /**
     * Now we going to iterate over all registered consumer
     * callbacks to verify which callback we going to call
     * (i.e., which match the message key).
     */
    const typesWithCallbacks = [...this._callbacksMap.keys()];

    typesWithCallbacks.forEach((typeWithListener) => {
      const {
        topicName: targetTopicName,
        evtName: targetEvtName,
      } = KafkaClient.msgTypeDecode(typeWithListener);

      /**
       * Check if keyWithListener match incoming key.
       */
      if (
        typeWithListener === "*"
        || (
          msg.topic === targetTopicName
          && targetEvtName === "*"
        ) || msg.type === typeWithListener
      ) {
        // Iterate over all registered callbacks.
        if (this._callbacksMap.has(typeWithListener)) {
          this._callbacksMap.get(typeWithListener).forEach((callback) => {
            callback.fn(msg);
          });
        }
      }
    });
  }

  /**
   * This function encode topic name with env.
   *
   * @param name - Topic name to encode.
   */
  @trace()
  private _encodeTopicName(
    name: string,
  ) {
    let topic = name;

    if (this._env) {
      topic = `${topic}___${this._env}`;
    }

    if (this._namespace) {
      topic = `${this._namespace}-${topic}`;
    }

    return topic;
  }

  /**
   * This function decode topic name with env.
   *
   * @param name - Name to be decoded.
   */
  @trace()
  private _decodeTopicName(
    name: string,
  ) {
    const parts = name.split("___");
    const env = parts.length === 2 ? parts[1] : null;

    return { env, topic: parts[0] };
  }

  /**
   * This function going to create a topic.
   *
   * @param name - Topic name.
   * @param opts - Set of options.
   * @param opts.partitions - Number of partitions.
   * @param opts.replication - Replication factor.
   * @param opts.timeout - The timeout to create topic.
   * @param $ctx - Trace context.
   */
  @trace()
  public async createTopic(
    name: string,
    opts: {
      partitions?: number;
      replication?: number;
      timeout?: number;
    } = {},
    $ctx?: TraceContext,
  ) {
    /**
     * We don't need to create topic for local event emitter.
     */
    if (this._emitter) {
      return Promise.resolve();
    }

    const partitions = opts.partitions ?? 1;
    const replication = opts.replication ?? 1;

    if (KafkaClient._createdTopicsSet.has(name)) {
      $ctx.logger.debug(`topic "${name}" already created`);
      return Promise.resolve();
    }

    const topicEncodedName = this._encodeTopicName(name);

    try {
      await this._adminClient.createTopic(topicEncodedName, {
        partitions,
        replication,
        timeout: opts.timeout,
      });

      $ctx.logger.debug(`topic ${topicEncodedName} created`);

      KafkaClient._createdTopicsSet.add(topicEncodedName);
    } catch (error) {
      $ctx.logger.error(`could not create topic ${topicEncodedName}`, error);
    }

    return null;
  }

  /**
   * This function going to emit an event. You can send to
   * multiple topics using `topic_1,topic_2,...,topic_n:evt-name`.
   *
   * @param type - The message type.
   * @param msg - Message to send.
   * @param opts - Options to control sending.
   * @param $ctx - Trace context.
   */
  @trace()
  public async send<T = any>(
    type: string,
    msg: ISendMessage<T>,
    opts: ISendOpts = {},
    $ctx?: TraceContext,
  ) {
    const topics = type.split(",");

    // Process last topic to extract evtName
    const lastParts = topics.pop().split(":");
    const lastTopic = lastParts.shift();
    const evtName = lastParts.length ? lastParts.shift() : null;

    topics.push(lastTopic);

    const promises: Promise<void>[] = [];

    if (this._shouldCreateTopics || opts.shouldCreateTopics) {
      try {
        await this._createTopics(topics, $ctx);
      } catch (error) {
        $ctx.logger.error("could not create topics", error);
      }
    }

    const plainMsgBody = convertToTypedObj(msg.body);

    for (let i = 0; i < topics.length; i++) { // eslint-disable-line no-magic-numbers
      const encodedTopicName = this._encodeTopicName(topics[i]);
      const msgType = evtName ? `${topics[i]}:${evtName}` : topics[i];

      const sendArgs: IProducerSendArgs = {
        key: msgType,
        message: {
          ...msg,
          body: plainMsgBody,
          timestamp: dayjs().unix(),
          type: msgType,
        },
        partition: opts.partition,
        topic: encodedTopicName,
      };

      if (this._producer && !this._producer.isConnected) {
        // Enqueue payload to send it latter.
        this._sendQueue.push(sendArgs);
        return Promise.resolve();
      }

      if (this._emitter) {
        const consumerMsg: IConsumerReceiveMessage = {
          key: sendArgs.key,
          partition: sendArgs.partition,
          topic: sendArgs.topic,
          value: JSON.stringify(sendArgs.message),
        };

        this._emitter.emit("event", consumerMsg);
      } else {
        promises.push(this._producer.send(sendArgs));
      }
    }

    return Promise.all(promises);
  }

  /**
   * This function going to register a new callback.
   *
   * @param typeOrTypes - Type or types of messages to listen to.
   * @param callback - Callback to get called when a message arrives.
   * @param _ctx - Log context.
   */
  public on<T = any>(
    typeOrTypes: string | string[],
    callback: (msg: IMessage<T>) => any,
  ) {
    const types = _.castArray(typeOrTypes);

    /**
     * This function is going to unsubscribe the callback and
     * is just for convenience.
     */
    const unsubscribeFn = () => {
      types.forEach((type) => {
        this.off(type, callback);
      });
    };

    // Register to callback map.
    for (const type of types) {
      if (!this._callbacksMap.has(type)) {
        this._callbacksMap.set(type, []);
      }

      this._callbacksMap.get(type).push({
        fn: callback,
      });
    }

    /**
     * Return an unsubscribe function just for convenience.
     */
    return unsubscribeFn;
  }

  /**
   * This function is going to unregister a callback.
   *
   * @param type - Type of messages to unregister the callback from.
   * @param callback - The callback.
   * @param _ctx - Log context.
   */
  public async off<T = any>(
    type: string,
    callback: (msg: IMessage<T>) => any,
  ) {
    // Unregister to callback map.
    if (this._callbacksMap.has(type)) {
      const callbacks = this._callbacksMap.get(type);

      const idx = callbacks.findIndex((aCallback) =>
        aCallback.fn === callback);

      if (idx >= 0) {
        callbacks.splice(idx, 1);
      }
    }
  }

  /**
   * This function disconnect this client from the remote broker.
   *
   * @param _$ctx - Trace context.
   */
  @trace()
  public async disconnect(
    _$ctx?: TraceContext,
  ) {
    return Promise.all([
      this._producer.disconnect(),
      this._consumer.disconnect(),
      this._adminClient.disconnect(),
    ]).then(() => null);
  }
}

//#####################################################
// Exports
//#####################################################
export {
  KafkaClient,
};
