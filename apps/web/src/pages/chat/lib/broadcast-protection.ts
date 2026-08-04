export function formatBroadcastProtectionEta(
  degradeCallbackCnt: number,
  degradeCallbackRate: number,
) {
  if (degradeCallbackCnt <= 0 || degradeCallbackRate <= 0) {
    return undefined;
  }

  const minutes = Math.ceil(degradeCallbackCnt / degradeCallbackRate);

  if (minutes <= 5) {
    return "5 分钟内";
  }
  if (minutes <= 15) {
    return "5～15 分钟";
  }
  if (minutes <= 30) {
    return "15～30 分钟";
  }
  if (minutes <= 60) {
    return "30～60 分钟";
  }
  if (minutes <= 120) {
    return "1～2 小时";
  }
  if (minutes <= 240) {
    return "2～4 小时";
  }

  return "4 小时以上";
}
