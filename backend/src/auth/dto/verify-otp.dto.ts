import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { NormalizeDigits } from '../../common/validation/normalize';

export class VerifyOtpDto {
  @IsNotEmpty({ message: "Mobile number can't be empty" })
  @IsString()
  @Matches(/^09\d{9}$/, {
    message: 'Mobile number must be a valid Iranian phone number.',
  })
  @NormalizeDigits()
  mobile!: string;

  @IsNotEmpty({ message: "Code can't be empty" })
  @IsString()
  @NormalizeDigits()
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code!: string;
}
