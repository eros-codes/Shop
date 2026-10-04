import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsString({ message: 'Province must be a string' })
  @IsNotEmpty({ message: 'Province cannot be empty' })
  @MaxLength(255, { message: 'Province must be at most 255 characters' })
  province!: string;

  @IsString({ message: 'City must be a string' })
  @IsNotEmpty({ message: 'City cannot be empty' })
  @MaxLength(255, { message: 'City must be at most 255 characters' })
  city!: string;

  @IsString({ message: 'Postal code must be a string' })
  @Length(10, 10, {
    message: 'Postal code must be exactly 10 characters long',
  })
  postal_code!: string;

  @IsString({ message: 'Address must be a string' })
  @IsNotEmpty({ message: 'Address cannot be empty' })
  @MaxLength(255, { message: 'Address must be at most 255 characters' })
  address!: string;

  @IsString({ message: 'Receiver mobile must be a string' })
  @Length(11, 11, {
    message: 'Receiver mobile must be exactly 11 characters long',
  })
  receiver_mobile!: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(255, { message: 'Description must be at most 255 characters' })
  description!: string;
}
