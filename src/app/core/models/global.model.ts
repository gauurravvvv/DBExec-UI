export interface IParams {
  limit: number;
  pageNumber: number;
  orgId?: string;
}

/**
 * Standard envelope every BE endpoint returns. The HTTP status is always 200;
 * `status` and `code` carry the application-level outcome. See
 * DbExec-API/src/utility/response.ts for the source of truth.
 */
export interface IAPIResponse<T = unknown> {
  status: boolean;
  code: number;
  message: string;
  data?: T;
}
