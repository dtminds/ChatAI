export const settingsSubAccountPasswordMessage =
  "密码必须包含大写字母、小写字母、数字、符号";

export function isValidSettingsSubAccountPassword(password: string) {
  return (
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
