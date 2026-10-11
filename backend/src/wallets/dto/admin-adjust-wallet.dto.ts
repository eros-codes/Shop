import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AdjustWalletDto } from './adjust-wallet.dto';

// A manual charge or withdrawal by staff, with the reason for it. The
// reason goes into the customer's wallet statement and the audit log, so
// "why did my balance change" has an answer.
export class AdminAdjustWalletDto extends AdjustWalletDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(255)
  note?: string;
}
