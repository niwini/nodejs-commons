import {
  trace,
  TraceContext,
} from "@niwini/tracer";
import * as RdKafka from "node-rdkafka";

import {
  IKafkaClient,
  IProducer,
  IProducerConfig,
  IProducerSendArgs,
} from "../types";

//#####################################################
// Main class
//#####################################################
/**
 * This is a producer which uses RdKafka under ther hood.
 * We use RdKafka for producer because of performance
 * (high throughput when delivering messages).
 */
export default class KafkaProducer implements IProducer {
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
   * Flag indicating if producer is initialized and ready.
   */
  private readonly _initialized: Promise<void>;

  /**
   * The underlying rdkafka producer.
   */
  private _producer: RdKafka.Producer;

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
   * Getter for initialized promise.
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * Constructor.
   *
   * @param client - The kafka client to use.
   * @param config - Producer config options.
   */
  constructor(client: IKafkaClient, config: IProducerConfig = {}) {
    this._client = client;
    this._initialized = this._init(config);
  }

  /**
   * This function going to initialize the producer.
   *
   * @param config - Producer config options.
   * @param $ctx - Trace context.
   */
  @trace()
  private async _init(
    config: IProducerConfig = {},
    $ctx?: TraceContext,
  ) {
    const maxRetries = config.maxRetries || 10; // eslint-disable-line @typescript-eslint/no-magic-numbers

    this._producer = new RdKafka.Producer({
      "batch.num.messages": 1000000,
      "client.id": this._client.id,
      "compression.codec": "none",
      "dr_cb": true, // eslint-disable-line
      "log.connection.close": false,
      "message.send.max.retries": maxRetries,
      "metadata.broker.list": this._client.brokers.join(","),
      "queue.buffering.max.messages": 100000,
      "queue.buffering.max.ms": 1000,
      "retry.backoff.ms": 200,
      "socket.keepalive.enable": true,
    });

    try {
      await this.connect($ctx);
    } catch (error) {
      $ctx.logger.error("could not connect");
    }
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
    this._connected = new Promise<void>((res) => {
      this._producer.connect();

      this._producer.on("ready", () => {
        $ctx.logger.debug("rdkafka producer is ready");
        this._isConnected = true;
        res();
      });

      this._producer.on("event.error", (error) => {
        $ctx.logger.warn("producer error", error);
      });
    });

    return this._connected;
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
      this._producer.disconnect((error) => {
        if (error) {
          $ctx.logger.error("could not disconnect rdkafka producer", error);
          return;
        }

        $ctx.logger.debug("rdkafka producer disconnected");
        res(null);
      });
    });
  }

  /**
   * This function going to send a new message.
   *
   * @param args - Send arguments.
   * @param $ctx - Trace context.
   */
  @trace()
  public async send(
    args: IProducerSendArgs,
    $ctx?: TraceContext,
  ) {
    const msgStr = JSON.stringify(args.message);
    const msgBuffer = Buffer.from(msgStr);

    try {
      this._producer.produce(
        args.topic,
        args.partition || args.partition,
        msgBuffer,
        args.message.type,
        args.message.timestamp,
      );

      $ctx.logger.debug("message sent using rdkafka producer", args);
    } catch (error) {
      $ctx.logger.error("rdkafka producer failed to produce message", error);
    }
  }
}
