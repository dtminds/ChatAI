import type {
  CustomerResponsePreflightRequest,
  CustomerResponsePreflightResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export function requestCustomerResponsePreflight(
  input: CustomerResponsePreflightRequest,
  signal?: AbortSignal,
) {
  return http.post<
    CustomerResponsePreflightResponse,
    CustomerResponsePreflightRequest
  >("/server/customer-response-preflight", input, { signal });
}

export function isCustomerResponsePreflightEnabled() {
  return import.meta.env.VITE_CUSTOMER_RESPONSE_PREFLIGHT_ENABLED === "true";
}
