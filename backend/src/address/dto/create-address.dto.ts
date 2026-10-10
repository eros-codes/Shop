import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { NormalizeDigits } from '../../common/validation/normalize';

export class CreateAddressDto {
  @IsString({ message: 'Province must be a string' })
  @IsNotEmpty({ message: 'Province cannot be empty' })
  @MaxLength(255, { message: 'Province must be at most 255 characters' })
  province!: string;

  @IsString({ message: 'City must be a string' })
  @IsNotEmpty({ message: 'City cannot be empty' })
  @MaxLength(255, { message: 'City must be at most 255 characters' })
  city!: string;

  @NormalizeDigits()
  @IsString({ message: 'Postal code must be a string' })
  @Matches(/^\d{10}$/, { message: 'Postal code must be 10 digits' })
  postal_code!: string;

  @IsString({ message: 'Address must be a string' })
  @IsNotEmpty({ message: 'Address cannot be empty' })
  @MaxLength(255, { message: 'Address must be at most 255 characters' })
  address!: string;

  @NormalizeDigits()
  @IsString({ message: 'Receiver mobile must be a string' })
  @Matches(/^09\d{9}$/, {
    message: 'Receiver mobile must look like 09123456789',
  })
  receiver_mobile!: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(255, { message: 'Description must be at most 255 characters' })
  description!: string;
}
