import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Name should be a string' })
  @IsNotEmpty({ message: "Display name can't be empty" })
  @MaxLength(100, {
    message: 'Display name must be shorter than 100 characters',
  })
  display_name?: string;

  @IsOptional()
  @IsString({ message: 'Password should be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64, { message: 'Password must be shorter than 64 characters' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one number',
  })
  password?: string;
}
