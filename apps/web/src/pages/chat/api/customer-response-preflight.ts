import type {
  CustomerResponseAssistanceMutationRequest,
  CustomerResponseAssistanceMutationResponse,
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

export function mutateCustomerResponseAssistance(
  input: CustomerResponseAssistanceMutationRequest,
) {
  return http.post<
    CustomerResponseAssistanceMutationResponse,
    CustomerResponseAssistanceMutationRequest
  >("/server/customer-response-preflight/assistance", input);
}

export function isCustomerResponsePreflightEnabled() {
  return import.meta.env.VITE_CUSTOMER_RESPONSE_PREFLIGHT_ENABLED === "true";
}
