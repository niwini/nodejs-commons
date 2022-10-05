import {
  trace,
  TraceContext,
} from "@niwini/tracer";
import * as KafkaJS from "kafkajs";

import {
  IConsumer,
  IConsumerConfig,
  IConsumerReceiveMessage,
  IKafkaClient,
  IOnConsumerMessageCallbackFn,
} from "../types";

//#####################################################
// Main class
//#####################################################
/**
 * This is a consumer which uses KafkaJS under the hood.
 * We use KafkaJS for consumer because RdKafka has problems
 * when consuming messages and performance for reading
 * messages seems to be similar for both packages.
 */
export default class KafkaConsumer implements IConsumer {
  /**
   * Flag indicating if this producer is already connected.
   */
  private _isConnected = false;

  /**
   * Promise for connected status.
   */
  private _connected: Promise<void>;

  /**
   * The kafka client.
   */
  private readonly _client: IKafkaClient;

  /**
   * The kafka client.
   */
  private _kafkajsClient: KafkaJS.Kafka;

  /**
   * The kafkajs consumer.
   */
  private _consumer: KafkaJS.Consumer;

  /**
   * Flag indicating if producer is initialized and ready.
   */
  private readonly _initialized: Promise<void>;

  /**
   * List of registered callbacks.
   */
  private readonly _callbacks: IOnConsumerMessageCallbackFn[] = [];

  /**
   * Getter for initialized promise.
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * Getter for is isConnected flag.
   */
  get isConnected() {
    return this._isConnected;
  }

  /**
   * Getter for connected promise.
   */
  get connected() {
    return this._connected;
  }

  /**
   * Constructor.
   *
   * @param client - Main kafka client.
   * @param config - Consumer configs.
   */
  constructor(client: IKafkaClient, config: IConsumerConfig = {}) {
    this._client = client;
    this._initialized = this._init(config);
  }

  /**
   * This function going to initialize the consumer.
   *
   * @param config - Consumer config options.
   * @param _$ctx - Trace context.
   */
  @trace()
  private async _init(
    config: IConsumerConfig,
    _$ctx?: TraceContext,
  ) {
    this._kafkajsClient = new KafkaJS.Kafka({
      brokers: this._client.brokers,
      clientId: this._client.id,
      logLevel: KafkaJS.logLevel.NOTHING,
    });

    this._consumer = this._kafkajsClient.consumer({
      groupId: config.groupId || this._client.id,
    });

    this._connected = this.connect();
  }

  /**
   * This function going to connect the underlying producer.
   *
   * @param $ctx - Trace Context.
   */
  @trace()
  public async connect(
    $ctx?: TraceContext,
  ) {
    try {
      await this._consumer.connect();
      this._isConnected = true;

      $ctx.logger.debug("kafkajs consumer is ready");
    } catch (error) {
      $ctx.logger.error("kafkajs consumer can't connect", error);
    }
  }

  /**
   * This function going to disconnect this producer.
   */
  @trace()
  public async disconnect() {
    return this._consumer.disconnect();
  }

  /**
   * This function going to subscribe to topic.
   *
   * @param topic - Topic to subscribe to.
   * @param $ctx - Trace context.
   */
  @trace()
  public async subscribe(
    topic: string,
    $ctx?: TraceContext,
  ) {
    await this.connected;

    try {
      await this._consumer.subscribe({
        topic,
      });

      $ctx.logger.debug(`kafkajs subscribed to topic "${topic}"`);
    } catch (error) {
      $ctx.logger.error(`could not subscribe to topic ${topic}`, error);
    }
  }

  /**
   * Start consuming messages.
   */
  @trace()
  public async start() {
    await this._connected;

    return this._consumer.run({
      eachMessage: async ({
        topic,
        message,
        partition,
      }) => {
        await Promise.all(this._callbacks.map((callback) => {
          const value = message.value.toString();
          const key = message.key.toString();

          const msg: IConsumerReceiveMessage = {
            key,
            partition,
            topic,
            value,
          };

          return callback(msg);
        }));
      },
    });
  }

  /**
   * This function register a callback for on message.
   *
   * @param callback - Callback to be invoked.
   */
  public async onMessage(
    callback: (msg: IConsumerReceiveMessage) => void,
  ) {
    this._callbacks.push(callback);
  }
}
