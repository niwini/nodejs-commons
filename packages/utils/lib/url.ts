//#####################################################
// Types
//#####################################################
export interface IUrlParts {
  host?: string;
  hostname?: string;
  origin?: string;
  password?: string;
  path?: string;
  port?: number;
  protocol?: string;
  user?: string;
  userinfo?: string;
}

//#####################################################
// Methods
//#####################################################
/**
 * This function breaks an url into it's parts. By url
 * we mean somethig with the following schema.
 *
 * [protocol://user:password@hostname:port/path].
 *
 * @param url - The url to be broken.
 * @param opts - A set of options.
 * @param opts.port - A custom port number.
 */
export function getUrlParts(
  url: string,
  opts: { port?: number } = {},
) {
  const result: IUrlParts = {
    host: null,
    hostname: null,
    origin: null,
    password: null,
    path: null,
    port: null,
    protocol: null,
    user: null,
    userinfo: null,
  };
  let parts = url.split("://");

  if (parts.length > 1) {
    result.protocol = parts.shift();
  }

  parts = parts[0].split("@");

  if (parts.length === 2) {
    result.userinfo = parts.shift();

    const userParts = result.userinfo.split(":");
    result.user = userParts.shift();
    result.password = userParts.length ? userParts.shift() : null;
  }

  parts = parts[0].split(":");

  if (parts.length === 2) {
    result.hostname = parts.shift();
    result.port = parseInt(parts.shift(), 10);
    result.host = `${result.hostname}:${result.port}`;
  }

  if (parts.length === 1) {
    result.hostname = parts.shift();

    if (opts.port) {
      result.port = opts.port;
      result.host = `${result.hostname}:${result.port}`;
    } else {
      result.host = result.hostname;
    }
  }

  result.origin = result.protocol ? `${result.protocol}://` : "";
  result.origin += result.hostname;
  result.origin += result.port ? `:${result.port}` : "";

  return result;
}
