import { resourceRequest } from "./resource-request";

// Compiled by `npm run typecheck`; never invoked at runtime. These calls keep the negative
// regression tied to the real resource-request boundary and generated OpenAPI paths.
function contractPathTypeRegression(): void {
  void resourceRequest({
    method: "GET",
    contractPath: "/api/v2/me",
    operationName: "typecheck.valid",
  });

  void resourceRequest({
    method: "GET",
    // @ts-expect-error -- undeclared Backend V2 resource routes must fail typecheck.
    contractPath: "/api/v2/not-declared",
    operationName: "typecheck.invalid",
  });
}

void contractPathTypeRegression;
