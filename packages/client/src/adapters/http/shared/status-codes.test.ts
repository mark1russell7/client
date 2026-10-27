/**
 * The error details of an HTTP status without a code in the body (O74). The code comes from
 * `ERROR_REGISTRY`, and the retryable flag agrees with the registry.
 */

import { describe, it, expect } from "vitest";
import { createHTTPStatusError } from "./errors.js";
import { HTTPStatusToCode, getStatusCode, isRetryableStatus } from "./status-codes.js";
import { HTTPStatus } from "./constants.js";
import { ERROR_REGISTRY } from "../../../client/errors/registry.js";
import { httpStatusToErrorCode } from "../../../client/errors/http-errors.js";

describe("createHTTPStatusError: the codes of ERROR_REGISTRY (O74)", () => {
  it("gives TIMEOUT for 408, and the call is retryable because it did not start", () => {
    expect(createHTTPStatusError(HTTPStatus.REQUEST_TIMEOUT)).toEqual({ code: "TIMEOUT", message: "HTTP 408", retryable: true, status: 408 });
  });

  it("gives INTERNAL_ERROR for 500, and the call is not retryable because it can have had its effect", () => {
    expect(createHTTPStatusError(HTTPStatus.INTERNAL_SERVER_ERROR)).toEqual({ code: "INTERNAL_ERROR", message: "HTTP 500", retryable: false, status: 500 });
  });

  it("gives HTTP_NETWORK_CONNECT_TIMEOUT for 599, and the call is retryable", () => {
    expect(createHTTPStatusError(HTTPStatus.HTTP_NETWORK_CONNECT_TIMEOUT_ERROR)).toEqual({ code: "HTTP_NETWORK_CONNECT_TIMEOUT", message: "HTTP 599", retryable: true, status: 599 });
  });

  it("gives the retryable flag of the registry for the statuses that changed", () => {
    const changed: Array<[HTTPStatus, string, boolean]> = [
      [HTTPStatus.MISDIRECTED_REQUEST, "MISDIRECTED_REQUEST", true],
      [HTTPStatus.TOO_EARLY, "TOO_EARLY", true],
      [HTTPStatus.NOT_IMPLEMENTED, "NOT_IMPLEMENTED", false],
      [HTTPStatus.HTTP_VERSION_NOT_SUPPORTED, "HTTP_VERSION_NOT_SUPPORTED", false],
      [HTTPStatus.VARIANT_ALSO_NEGOTIATES, "VARIANT_ALSO_NEGOTIATES", false],
      [HTTPStatus.LOOP_DETECTED, "LOOP_DETECTED", false],
      [HTTPStatus.NOT_EXTENDED, "NOT_EXTENDED", false],
      [HTTPStatus.NETWORK_AUTHENTICATION_REQUIRED, "NETWORK_AUTHENTICATION_REQUIRED", false],
    ];
    for (const [status, code, retryable] of changed) {
      expect(createHTTPStatusError(status), String(status)).toMatchObject({ code, retryable, status });
    }
  });

  it("gives a code of the registry for each error status with an entry, and the name of the status for another status", () => {
    const statuses = Object.keys(HTTPStatusToCode).map(Number) as HTTPStatus[];
    for (const status of statuses) {
      const registryCode = httpStatusToErrorCode(status);
      const expected = registryCode === "UNKNOWN" ? getStatusCode(status) : registryCode;
      expect(createHTTPStatusError(status).code, String(status)).toBe(expected);
      if (status >= 400) expect(ERROR_REGISTRY[createHTTPStatusError(status).code], String(status)).toBeDefined();
    }
    expect(createHTTPStatusError(HTTPStatus.NOT_MODIFIED).code).toBe("NOT_MODIFIED");
  });
});

describe("isRetryableStatus agrees with ERROR_REGISTRY (O74)", () => {
  it("gives the retryable flag of the entry of each status that has an entry in the registry", () => {
    let checked = 0;
    for (const entry of Object.values(ERROR_REGISTRY)) {
      const status = entry.httpStatus;
      // The entry of a status is the entry of its code. TIMEOUT has 504, and GATEWAY_TIMEOUT is the entry of 504
      if (!status || httpStatusToErrorCode(status) !== entry.code) continue;
      expect(isRetryableStatus(status as HTTPStatus), `${status} ${entry.code}`).toBe(entry.retryable);
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });

  it("gives true for 408, because the server did not read the full request", () => {
    expect(isRetryableStatus(HTTPStatus.REQUEST_TIMEOUT)).toBe(true);
  });

  it("gives true for a server error without an entry, and false for a client error without an entry", () => {
    expect(isRetryableStatus(520 as HTTPStatus)).toBe(true);
    expect(isRetryableStatus(419 as HTTPStatus)).toBe(false);
    expect(isRetryableStatus(HTTPStatus.OK)).toBe(false);
  });
});
