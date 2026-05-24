import type {
  ApiSuccessEnvelope,
  SettingsManagedAccount,
  SettingsManagedAccountsResponse,
  SettingsManagedAccountsQuery,
  SettingsManagedAccountSubAccountsUpdateRequest,
  SettingsSidebarItem,
  SettingsSidebarItemCreateRequest,
  SettingsSidebarItemsResponse,
  SettingsSidebarItemsSortUpdateRequest,
  SettingsSidebarItemStatus,
  SettingsSidebarItemStatusUpdateRequest,
  SettingsSidebarItemUpdateRequest,
  SettingsSubAccount,
  SettingsSubAccountCreateRequest,
  SettingsSubAccountsQuery,
  SettingsSubAccountsResponse,
  SettingsSubAccountStatus,
  SettingsSubAccountStatusUpdateRequest,
  SettingsSubAccountUpdateRequest,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listSubAccounts(query: SettingsSubAccountsQuery = {}) {
  const response = await http.get<ApiSuccessEnvelope<SettingsSubAccountsResponse>>(
    "/server/settings/sub-accounts",
    {
      params: query,
    },
  );

  return response.data;
}

export async function listManagedAccounts(query: SettingsManagedAccountsQuery = {}) {
  const response = await http.get<ApiSuccessEnvelope<SettingsManagedAccountsResponse>>(
    "/server/settings/managed-accounts",
    {
      params: query,
    },
  );

  return response.data;
}

export async function updateManagedAccountSubAccounts(
  managedAccountId: string,
  payload: SettingsManagedAccountSubAccountsUpdateRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<SettingsManagedAccount>,
    SettingsManagedAccountSubAccountsUpdateRequest
  >(`/server/settings/managed-accounts/${managedAccountId}/sub-accounts`, payload);

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

export async function listSidebarItems() {
  const response = await http.get<ApiSuccessEnvelope<SettingsSidebarItemsResponse>>(
    "/server/settings/sidebar-items",
  );

  return response.data;
}

export async function createSidebarItem(payload: SettingsSidebarItemCreateRequest) {
  const response = await http.post<
    ApiSuccessEnvelope<SettingsSidebarItem>,
    SettingsSidebarItemCreateRequest
  >("/server/settings/sidebar-items", payload);

  return response.data;
}

export async function updateSidebarItem(
  sidebarItemId: string,
  payload: SettingsSidebarItemUpdateRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<SettingsSidebarItem>,
    SettingsSidebarItemUpdateRequest
  >(`/server/settings/sidebar-items/${sidebarItemId}`, payload);

  return response.data;
}

export async function updateSidebarItemStatus(
  sidebarItemId: string,
  status: SettingsSidebarItemStatus,
) {
  const response = await http.patch<
    ApiSuccessEnvelope<SettingsSidebarItem>,
    SettingsSidebarItemStatusUpdateRequest
  >(`/server/settings/sidebar-items/${sidebarItemId}/status`, { status });

  return response.data;
}

export async function updateSidebarItemsSort(itemIds: string[]) {
  const response = await http.put<
    ApiSuccessEnvelope<SettingsSidebarItemsResponse>,
    SettingsSidebarItemsSortUpdateRequest
  >("/server/settings/sidebar-items/sort", { itemIds });

  return response.data;
}

export async function deleteSidebarItem(sidebarItemId: string) {
  const response = await http.delete<ApiSuccessEnvelope<{ deleted: boolean }>>(
    `/server/settings/sidebar-items/${sidebarItemId}`,
  );

  return response.data;
}
