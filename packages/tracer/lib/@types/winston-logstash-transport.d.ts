declare module "winston-logstash-transport" {
  import { transports } from "winston";

  export class LogstashTransport extends transports.Stream {
    constructor(opts: { // eslint-disable-line import/prefer-default-export
      port: number;
      host: string;
    })
  }
}
