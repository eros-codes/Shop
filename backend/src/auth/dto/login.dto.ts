import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeDigits } from '../../common/validation/normalize';
import { PASSWORD_MAX_LENGTH } from '../../common/constants/limits';

export class LoginDto {
  @IsNotEmpty({ message: "Mobile number can't be empty" })
  @IsString({ message: 'Mobile number should be a string' })
  @Matches(/^09\d{9}$/, {
    message: 'Mobile number must be a valid Iranian phone number.',
  })
  @NormalizeDigits()
  mobile!: string;

  @IsNotEmpty({ message: "Password can't be empty" })
  @IsString({ message: 'Password should be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  })
  password!: string;
}
