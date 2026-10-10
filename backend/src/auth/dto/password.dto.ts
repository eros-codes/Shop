import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeDigits } from '../../common/validation/normalize';
import { PASSWORD_MAX_LENGTH } from '../../common/constants/limits';

// Same rule as registration: anything weaker here would be a way around
// the password policy.
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const PASSWORD_MESSAGE =
  'Password must contain at least one uppercase letter, one lowercase letter and one digit';

export class ForgotPasswordDto {
  @NormalizeDigits()
  @IsString()
  @IsNotEmpty({ message: 'Mobile number is required' })
  @Matches(/^09\d{9}$/, { message: 'Mobile number must look like 09123456789' })
  mobile!: string;
}

export class ResetPasswordDto {
  @NormalizeDigits()
  @IsString()
  @IsNotEmpty({ message: 'Mobile number is required' })
  @Matches(/^09\d{9}$/, { message: 'Mobile number must look like 09123456789' })
  mobile!: string;

  @NormalizeDigits()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'The verification code is 6 digits' })
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Your current password is required' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
