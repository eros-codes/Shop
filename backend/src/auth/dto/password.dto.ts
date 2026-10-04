import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Same rule as registration: anything weaker here would be a way around
// the password policy.
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const PASSWORD_MESSAGE =
  'Password must contain at least one uppercase letter, one lowercase letter and one digit';

export class ForgotPasswordDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Mobile number is required' })
  @Matches(/^09\d{9}$/, { message: 'Mobile number must look like 09123456789' })
  mobile!: string;
}

export class ResetPasswordDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Mobile number is required' })
  @Matches(/^09\d{9}$/, { message: 'Mobile number must look like 09123456789' })
  mobile!: string;

  @Transform(trim)
  @IsString()
  @Length(6, 6, { message: 'The verification code is 6 digits' })
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Your current password is required' })
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
