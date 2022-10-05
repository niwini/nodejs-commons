import {
  trace,
  TraceContext,
} from "@niwini/tracer";
import * as RdKafka from "node-rdkafka";

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
 * This is a consumer which uses RdKafka under the hood.
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
   * The kafkajs consumer.
   */
  private _consumer: RdKafka.KafkaConsumer;

  /**
   * Flag indicating if producer is initialized and ready.
   */
  private readonly _initialized: Promise<void>;

  /**
   * List of registered callbacks.
   */
  private readonly _callbacks: IOnConsumerMessageCallbackFn[] = [];

  /**
   * Getter for is initialized promise.
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
   * @param _$ctx - Trace context
   */
  @trace()
  private async _init(
    config: IConsumerConfig,
    _$ctx?: TraceContext,
  ) {
    this._consumer = new RdKafka.KafkaConsumer({
      "group.id": config.groupId || this._client.id,
      "metadata.broker.list": this._client.brokers.join(","),
    }, {});

    this._connected = this.connect();

    return this._connected;
  }

  /**
   * This function going to connect the underlying producer.
   *
   * @param $ctx - Trace context.
   */
  @trace()
  public async connect(
    $ctx?: TraceContext,
  ) {
    return new Promise<void>((res) => {
      this._consumer.connect();

      this._consumer.on("ready", () => {
        this._isConnected = true;
        $ctx.logger.debug("rdkafka consumer connected");
        res();
      });
    });
  }

  /**
   * This function going to disconnect this producer.
   *
   * @param $ctx - Trace context.
   */
  @trace()
  public async disconnect(
    $ctx?: TraceContext,
  ) {
    return new Promise<void>((res) => {
      this._consumer.disconnect((error) => {
        if (error) {
          $ctx.logger.error("could not disconnect rdkafka consumer", error);
        }

        res();
      });
    });
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

    this._consumer.subscribe([topic]);
    $ctx.logger.debug(`rdkafka consumer subscribed to "${topic}"`);

    return Promise.resolve();
  }

  /**
   * Start consuming messages.
   *
   * @param $ctx - Log context.
   */
  @trace()
  public async start(
    $ctx?: TraceContext,
  ) {
    await this._connected;

    return new Promise<void>((res) => {
      this._consumer.on("data", (message) => {
        this._callbacks.map((callback) => {
          const value = message.value.toString();
          const key = message.key.toString();

          const msg: IConsumerReceiveMessage = {
            key,
            partition: message.partition,
            topic: message.topic,
            value,
          };

          return callback(msg);
        });
      });


      this._consumer.consume((error) => {
        if (error) {
          $ctx.logger.error("rdkafka consumer start error", error);
        }

        res();
      });
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
