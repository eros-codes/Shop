import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeDigits } from '../../common/validation/normalize';
import { PASSWORD_MAX_LENGTH } from '../../common/constants/limits';

export class RegisterDto {
  @IsNotEmpty({ message: "Mobile number can't be empty" })
  @IsString({ message: 'Mobile number should be a string' })
  @Matches(/^09\d{9}$/, {
    message: 'Mobile number must be a valid Iranian phone number.',
  })
  @NormalizeDigits()
  mobile!: string;

  @IsString({ message: 'Name should be a string' })
  @IsNotEmpty({ message: "Display name can't be empty" })
  @MaxLength(100, {
    message: 'Display name must be shorter than 100 characters',
  })
  display_name!: string;

  @IsNotEmpty({ message: "Password can't be empty" })
  @IsString({ message: 'Password should be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one number',
  })
  password!: string;
}
