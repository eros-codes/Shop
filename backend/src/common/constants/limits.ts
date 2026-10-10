export const MAX_INT32 = 2147483647;

export const MAX_UNSIGNED_INT32 = 4294967295;

// bcrypt reads at most 72 bytes of a password. Every form that sets or
// checks one uses this, so a password that can be set can also be typed
// into the sign-in form (login used to stop at 64 while reset allowed 72).
export const PASSWORD_MAX_LENGTH = 72;
