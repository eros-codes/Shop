import { IsInt, Max, Min } from 'class-validator';
import { MAX_MONEY_AMOUNT } from '../../common/constants/money';

export class AdjustWalletDto {
  @IsInt({ message: 'Amount must be an integer' })
  @Min(1, { message: 'Amount must be at least 1' })
  @Max(MAX_MONEY_AMOUNT, {
    message: 'Amount is larger than the allowed maximum',
  })
  amount!: number;
}
