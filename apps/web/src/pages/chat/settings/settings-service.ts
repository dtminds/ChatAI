import type {
  ApiSuccessEnvelope,
  SettingsSubAccount,
  SettingsSubAccountCreateRequest,
  SettingsSubAccountsResponse,
  SettingsSubAccountStatus,
  SettingsSubAccountStatusUpdateRequest,
  SettingsSubAccountUpdateRequest,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listSubAccounts() {
  const response = await http.get<ApiSuccessEnvelope<SettingsSubAccountsResponse>>(
    "/server/settings/sub-accounts",
  );

  return response.data;
}

export async function createSubAccount(payload: SettingsSubAccountCreateRequest) {
  const response = await http.post<
    ApiSuccessEnvelope<SettingsSubAccount>,
    SettingsSubAccountCreateRequest
  >("/server/settings/sub-accounts", payload);

  return response.data;
}

export async function updateSubAccount(
  subAccountId: string,
  payload: SettingsSubAccountUpdateRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<SettingsSubAccount>,
    SettingsSubAccountUpdateRequest
  >(`/server/settings/sub-accounts/${subAccountId}`, payload);

  return response.data;
}

export async function updateSubAccountStatus(
  subAccountId: string,
  status: SettingsSubAccountStatus,
) {
  const response = await http.patch<
    ApiSuccessEnvelope<SettingsSubAccount>,
    SettingsSubAccountStatusUpdateRequest
  >(`/server/settings/sub-accounts/${subAccountId}/status`, { status });

  return response.data;
}

export async function deleteSubAccount(subAccountId: string) {
  const response = await http.delete<ApiSuccessEnvelope<{ deleted: boolean }>>(
    `/server/settings/sub-accounts/${subAccountId}`,
  );

  return response.data;
}
