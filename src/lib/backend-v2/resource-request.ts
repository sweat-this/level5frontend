import "server-only";
import type { paths } from "@/generated/level5-v2";
import {
  request,
  type RequestOptions,
  type TransportResult,
} from "./transport";

/** A Backend V2 route template declared by the pinned generated OpenAPI contract. */
export type BackendV2ContractPath = keyof paths;

export type ResourceRequestOptions = Omit<RequestOptions, "path"> & {
  /** The OpenAPI route template that authorizes this resource request. */
  readonly contractPath: BackendV2ContractPath;
  /** Encoded runtime URL when path parameters or a query string are present. */
  readonly path?: string;
};

/**
 * Resource-only contract boundary. Runtime behavior remains owned by the generic transport;
 * this helper only requires each resource request to name a generated OpenAPI route.
 */
export function resourceRequest<T>(
  options: ResourceRequestOptions,
): Promise<TransportResult<T>> {
  const { contractPath, path = contractPath, ...requestOptions } = options;
  return request<T>({ ...requestOptions, path });
}
