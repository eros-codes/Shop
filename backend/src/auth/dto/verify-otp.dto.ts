import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyOtpDto {
  @IsNotEmpty({ message: "Mobile number can't be empty" })
  @IsString()
  @Matches(/^09\d{9}$/, {
    message: 'Mobile number must be a valid Iranian phone number.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  mobile!: string;

  @IsNotEmpty({ message: "Code can't be empty" })
  @IsString()
  @Length(6, 6, { message: 'Code must be 6 digits' })
  code!: string;
}
