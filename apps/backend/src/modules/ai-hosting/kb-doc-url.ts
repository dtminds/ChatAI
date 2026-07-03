import { normalizeMediaAssetUrl } from "../chat/workbench-content-utils.js";

export function resolveKbDocUrlForJava(docUrl: string) {
  return normalizeMediaAssetUrl(docUrl);
}
