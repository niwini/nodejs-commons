import {
  trace,
  TraceContext,
} from "@niwini/tracer";
import * as RdKafka from "node-rdkafka";

import {
  IAdminClient,
  IKafkaClient,
} from "../types";

//#####################################################
// Main class
//#####################################################
/**
 * This is an admin client that uses RdKafka under the hood.
 */
export default class KafkaAdminClient implements IAdminClient {
  /**
   * Underlying rdkafka admin client.
   */
  private readonly _adminClient: RdKafka.IAdminClient;

  /**
   * Constructor.
   *
   * @param client - The kafka client.
   */
  constructor(client: IKafkaClient) {
    this._adminClient = RdKafka.AdminClient.create({
      "client.id": `${client.id}-admin`,
      "metadata.broker.list": client.brokers.join(","),
    });
  }

  /**
   * This function creates a single topic in kafka.
   *
   * @param topic - Name of topic to create.
   * @param opts - A set of options to control creation.
   * @param opts.partitions - Number of partitions to use.
   * @param opts.replication - The replication factor.
   * @param opts.timeout - Timeout value.
   * @param $ctx - Trace context.
   */
  @trace()
  public async createTopic(
    topic: string,
    opts: {
      partitions?: number;
      replication?: number;
      timeout?: number;
    } = {},
    $ctx?: TraceContext,
  ) {
    const DEFAULT_TIMEOUT = 30000;

    return new Promise<void>((res, rej) => {
      this._adminClient.createTopic({
        num_partitions: opts.partitions,
        replication_factor: opts.replication,
        topic,
      }, opts.timeout || DEFAULT_TIMEOUT, (error) => {
        const ALREADY_CREATED_CODE = 36;

        if (error && error.code !== ALREADY_CREATED_CODE) {
          $ctx.logger.error(`could not create topic "${topic}"`, error);
          rej(error);
          return;
        } else if (error && error.code === ALREADY_CREATED_CODE) {
          $ctx.logger.debug(`topic "${topic}" already created`);
        }

        res();
      });
    });
  }

  /**
   * This function going to disconnect admin client.
   *
   * @param _$ctx - Log context.
   */
  @trace()
  public async disconnect(
    _$ctx?: TraceContext,
  ) {
    return Promise.resolve(this._adminClient.disconnect());
  }
}
