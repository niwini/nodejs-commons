//#####################################################
// Imports
//#####################################################
import {
  TraceContext,
} from "@niwini/tracer";

//#####################################################
// Types
//#####################################################
/**
 * Interface of basic message items.
 */
interface IMessageBase<T = any> {
  $traceHash?: string;
  body: T;
}

/**
 * Interface of message as we going to send it.
 */
export interface ISendMessage<T = any> extends IMessageBase<T> {}

/**
 * Interface of message as we going to send to producer.
 */
export interface IProducerSendMessage<T = any> extends ISendMessage<T> {
  timestamp: number;
  type: string;
}

/**
 * Interface of message as we going to receive it from consumer.
 */
export interface IConsumerReceiveMessage {
  key: string;
  partition: number;
  value: string;
  topic: string;
}

/**
 * Interface of message as we going to receive it from client.
 */
export interface IMessage<T = any> extends IMessageBase<T> {
  env?: string;
  evtName?: string;
  type: string;
  partition: number;
  timestamp: number;
  topic: string;
}

/**
 * Interface for config options a producer can receive.
 */
export interface IProducerConfig {
  compression?: string;
  maxRetries?: number;
  maxRetryTimeout?: number;
}

/**
 * Interface for send options
 */
export interface ISendOpts {
  partition?: number;
  shouldCreateTopics?: boolean;
}

/**
 * Send arguments.
 */
export interface IProducerSendArgs<T = any> extends ISendOpts {
  key: string;
  topic: string;
  message: IProducerSendMessage<T>;
  partition?: number;
}

/**
 * Interface for the producer we going to use.
 */
export interface IProducer {
  isConnected: boolean;
  connected: Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (
    args: IProducerSendArgs,
  ) => Promise<void>;
}

/**
 * Interface for config options a consumer can receive.
 */
export interface IConsumerConfig {
  groupId?: string;
  subscribe?: string[];
}

/**
 * Interface for consumer message callback.
 */
export type IOnConsumerMessageCallbackFn = (
  msg: IConsumerReceiveMessage,
) => void;

/**
 * Interface for a consumer.
 */
export interface IConsumer {
  isConnected: boolean;
  connected: Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  start: () => Promise<void>;
  subscribe: (topic: string) => Promise<void>;
  onMessage: (
    callback: IOnConsumerMessageCallbackFn,
  ) => void;
}

/**
 * Admin client
 */
export interface IAdminClient {
  disconnect: () => Promise<void>;
  createTopic: (
    topic: string,
    opts: {
      partitions?: number;
      replication?: number;
      timeout?: number;
    },
  ) => Promise<void>;
}

/**
 * Interface for topic config.
 */
export interface ITopicConfig {
  numPartitions: number;
  replicationFactor: number;
}

/**
 * Interface for config options a client can receive.
 */
export interface IKafkaClientConfig {

  /**
   * Environment name to prefix all event emits.
   */
  env?: string;

  /**
   * Client id.
   */
  id?: string;

  /**
   * List of kafka brokers.
   */
  brokers: string[];

  /**
   * List of topics to subscribe.
   */
  subscribe?: {topic: string}[];

  /**
   * Flag indicating if we should use node emitter instead
   * of kafka itself.
   */
  useNodeEmitter?: boolean;

  /**
   * Config for creating topics.
   */
  topicConfig?: ITopicConfig;

  /**
   * Flag indicating if we should create topics.
   */
  shouldCreateTopics?: boolean;

  /**
   * Producer config.
   */
  producerConfig?: IProducerConfig;

  /**
   * Consumer config.
   */
  consumerConfig?: IConsumerConfig;

  /**
   * Producer to use instead of creating a new one.
   */
  producer?: IProducer;

  /**
   * A name space to restrict ourselves to. Events going to
   * be emitted in this namespace and only events in this namespace
   * are going to be consumed.
   */
  namespace?: string;

  /**
   * Consumer to use instead of creating a new one.
   */
  consumer?: IConsumer;

  /**
   * Admin client instance.
   */
  adminClient?: IAdminClient;
}

/**
 * Interface for message callback.
 */
export type IOnMessageCallbackFn<T = any> = (
  msg: IMessage<T>,
) => void;

/**
 * Interface for bare minimum methods exposed by kafka client.
 */
export interface IKafkaClient {
  id: string;
  brokers: string[];
  disconnect: () => Promise<void>;
  send: <T = any>(
    type: string,
    msg: ISendMessage<T>,
    opts?: ISendOpts,
    $ctx?: TraceContext,
  ) => void;
  on: <T = any>(
    type: string,
    callback: (msg: IMessage<T>) => any,
    $ctx?: TraceContext,
  ) => (() => void);
}
