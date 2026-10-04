// What a one-time code is for. Both flows use the same table and the
// same throttling, but they are separate codes.
enum OtpPurposeEnum {
  Register = 'register',
  PasswordReset = 'password_reset',
}

export default OtpPurposeEnum;
