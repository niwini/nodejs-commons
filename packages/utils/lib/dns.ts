//#####################################################
// Imports
//#####################################################
import dns from "dns";

import {
  getUrlParts,
  IUrlParts,
} from "./url";

//#####################################################
// Types
//#####################################################
interface IServiceUrl {
  hostname: string;
  port: number;
  host: string;
}

/**
 * This function resolves an url hostname to ip.
 *
 * @param url - The url to be resolved.
 * @param opts - A set of options.
 * @param opts.ignoredIps - List of ips to ignore.
 */
async function resolveUrlHostname(
  url: string,
  opts?: {
    ignoredIps?: string[];
  },
): Promise<IUrlParts> {
  return new Promise<IUrlParts>((resolve, reject) => {
    const urlParts = getUrlParts(url);

    dns.resolve4(urlParts.hostname, (error: any, ips: any) => {
      if (error) {
        return reject(error.message);
      } else if (ips.length === 0) {
        return reject(new Error("could not resolve hostname"));
      }

      let ip;

      // Try to find an non-ignored ip.
      if (opts && opts.ignoredIps) {
        for (let i = 0; i < ips.length; i++) {
          if (!opts.ignoredIps.find((ignoredIp) => ignoredIp === ips[i])) {
            ip = ips[i];
            break;
          }
        }

        // We could not find a suitable address.
        if (!ip) {
          return reject(new Error("coild not resolve hostname"));
        }
      } else {
        ip = ips[0];
      }

      urlParts.hostname = ip;

      const protocolPrefix = urlParts.protocol ? `${urlParts.protocol}://` : "";
      const portSuffix = urlParts.port ? `:${urlParts.port}` : "";
      urlParts.host = `${ip}${portSuffix}`;
      urlParts.origin = `${protocolPrefix}${urlParts.host}`;

      return resolve(urlParts);
    });
  });
}

/**
 * This function resolves a service port.
 *
 * @param url - The url to be resolved.
 */
async function resolveUrlPort(
  url: string,
): Promise<IUrlParts> {
  return new Promise<IUrlParts>((resolve, reject) => {
    const urlParts = getUrlParts(url);

    if (urlParts.port) {
      resolve(urlParts);
    } else {
      dns.resolveSrv(urlParts.hostname, (error: any, addrs: any) => {
        if (error) {
          return reject(error.message);
        } else if (addrs.length === 0) {
          return reject(new Error("service not found"));
        } else if (!addrs[0].port) {
          return reject(new Error("service port not found"));
        }

        const [addr] = addrs;
        urlParts.port = addr.port;
        urlParts.origin += `:${addr.port}`;
        urlParts.host += `:${addr.port}`;

        return resolve(urlParts);
      });
    }
  });
}

/**
 * This function resolves a service url.
 *
 * @deprecated In favor of resolveUrlPort and resolveUrlHostname
 *
 * @param url - The url to be resolved.
 */
async function resolveUrl(url: string): Promise<IUrlParts> {
  return new Promise<IUrlParts>((resolve, reject) => {
    const urlParts = getUrlParts(url);

    if (urlParts.port) {
      resolve(urlParts);
    } else {
      dns.resolveSrv(urlParts.hostname, (error: any, addrs: any) => {
        if (error) {
          return reject(error.message);
        } else if (addrs.length === 0) {
          return reject(new Error("service not found"));
        }

        const [addr] = addrs;
        urlParts.port = addr.port;
        urlParts.origin += `:${addr.port}`;
        urlParts.host += `:${addr.port}`;

        return resolve(urlParts);
      });
    }
  });
}

//#####################################################
// Export
//#####################################################
export {
  IServiceUrl,
  resolveUrl,
  resolveUrlHostname,
  resolveUrlPort,
};
