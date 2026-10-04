import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: "Mobile number can't be empty" })
  @IsString({ message: 'Mobile number should be a string' })
  @Matches(/^09\d{9}$/, {
    message: 'Mobile number must be a valid Iranian phone number.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  mobile!: string;

  @IsNotEmpty({ message: "Password can't be empty" })
  @IsString({ message: 'Password should be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64, { message: 'Password must be shorter than 64 characters' })
  password!: string;
}
