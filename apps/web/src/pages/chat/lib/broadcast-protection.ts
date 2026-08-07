export function formatBroadcastProtectionEta(
  degradeCallbackCnt: number,
  degradeCallbackRate: number,
) {
  if (degradeCallbackCnt <= 0 || degradeCallbackRate <= 0) {
    return undefined;
  }

  const minutes = Math.ceil(degradeCallbackCnt / degradeCallbackRate);

  if (minutes > 120) {
    return "> 2 小时";
  }

  return formatEtaDuration(minutes);
}

function formatEtaDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} 小时`;
  }

  return `${hours} 小时 ${remainingMinutes} 分钟`;
}
